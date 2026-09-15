import type { AgentAdapter } from "@aibench/adapters";
import type { RunManifest } from "@aibench/contracts";
import { readdir } from "node:fs/promises";
import type { IsolationProvider, IsolationRequest, IsolatedWorkspace } from "./isolation/types.js";
import { verifyNetworkIsolation } from "./network/preflight.js";
import { RunStore, type RunHandle } from "./run-store.js";
import type { RunStatus } from "./state-machine.js";

export type ExecuteRunOptions = {
  store: RunStore;
  run: RunHandle;
  prompt: string;
  timeoutMs: number;
  adapter: AgentAdapter;
  isolation: IsolationProvider;
  isolationRequest: IsolationRequest;
  environment?: Readonly<Record<string, string>>;
  outputValidator?: (workspacePath: string) => Promise<string | null>;
};

function message(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown runner error";
}

async function hasReviewableArtifact(directory: string): Promise<boolean> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isFile()) return true;
    if (entry.isDirectory() && await hasReviewableArtifact(`${directory}/${entry.name}`)) return true;
  }
  return false;
}

export async function executeRun(options: ExecuteRunOptions): Promise<RunManifest> {
  let phase: RunStatus = options.run.manifest.status;
  let workspace: IsolatedWorkspace | undefined;
  let timedOut = false;
  let timer: NodeJS.Timeout | undefined;

  try {
    phase = "PREFLIGHT";
    await options.store.transition(options.run.runId, phase);
    workspace = await options.isolation.prepare(options.isolationRequest);
    const activeWorkspace = workspace;
    const context = {
      runId: options.run.runId,
      prompt: options.prompt,
      workspaceRoot: activeWorkspace.executionClass === "official-container" ? "/workspace" : activeWorkspace.request.workspacePath,
      environment: options.environment ?? {},
      commandExecutor: (command: { executable: string; args: string[]; cwd?: string; env?: Record<string, string> }) => activeWorkspace.exec({
        ...command,
        env: { ...(options.environment ?? {}), ...(command.env ?? {}) },
      }),
      cancelExecution: () => activeWorkspace.cancel(),
    };
    if (options.isolationRequest.networkPolicy !== "blocked") {
      try {
        const proxyVersion = options.isolationRequest.proxyVersion;
        if (!proxyVersion) throw new Error("Official network isolation requires a pinned proxy version");
        const evidence = await verifyNetworkIsolation({
          policy: options.isolationRequest.networkPolicy,
          endpoints: options.isolationRequest.privateEndpoints ?? [],
          proxyVersion,
          execute: context.commandExecutor,
        });
        await options.store.appendEvent(options.run.runId, {
          type: "diagnostic",
          payload: { networkIsolation: { status: "verified", ...evidence } },
        });
      } catch (error) {
        await options.store.appendEvent(options.run.runId, {
          type: "diagnostic",
          payload: { networkIsolation: { status: "failed", reason: message(error) } },
        });
        throw new Error("Official network isolation preflight failed");
      }
    }
    const preflight = await options.adapter.preflight(context);
    await options.store.appendEvent(options.run.runId, {
      type: "diagnostic",
      payload: { adapter: preflight.adapter, version: preflight.version, diagnostics: preflight.diagnostics },
    });
    if (!preflight.ok) {
      return await options.store.transition(options.run.runId, "INFRA_ERROR", {
        classification: "INFRA_ERROR",
        summary: preflight.diagnostics.join("; ") || "Adapter preflight failed",
      });
    }

    phase = "RUNNING";
    await options.store.transition(options.run.runId, phase);
    timer = setTimeout(() => {
      timedOut = true;
      void options.adapter.cancel(`Run exceeded its ${options.timeoutMs}ms limit`);
    }, options.timeoutMs);

    let outcome: "success" | "failed" | "cancelled" | undefined;
    let exitCode: number | null | undefined;
    for await (const event of options.adapter.start(context)) {
      await options.store.appendEvent(options.run.runId, { type: "agent", payload: { ...event } });
      if (event.type === "session.finished") {
        outcome = event.outcome;
        exitCode = event.exitCode;
      }
    }
    clearTimeout(timer);
    timer = undefined;

    if (timedOut) {
      return await options.store.transition(options.run.runId, "TIMEOUT", {
        classification: "TIMEOUT",
        summary: `Run exceeded its ${options.timeoutMs}ms limit`,
      });
    }
    if (outcome === "success" && exitCode === 0) {
      phase = "VALIDATING";
      await options.store.transition(options.run.runId, phase);
      const hasOutput = await hasReviewableArtifact(activeWorkspace.request.workspacePath)
        || await hasReviewableArtifact(activeWorkspace.request.outputPath);
      if (!hasOutput) {
        return await options.store.transition(options.run.runId, "FAILED", {
          classification: "VALIDATION_FAILURE",
          summary: "Agent session completed without producing a reviewable artifact",
        });
      }
      const validationFailure = await options.outputValidator?.(activeWorkspace.request.workspacePath);
      if (validationFailure) {
        return await options.store.transition(options.run.runId, "FAILED", {
          classification: "VALIDATION_FAILURE",
          summary: validationFailure,
        });
      }
      return await options.store.transition(options.run.runId, "READY_FOR_REVIEW");
    }
    return await options.store.transition(options.run.runId, "FAILED", {
      classification: outcome === "cancelled" ? "CANCELLED" : "MODEL_FAILURE",
      summary: outcome === "cancelled" ? "Adapter cancelled the run" : "Agent session did not finish successfully",
    });
  } catch (error) {
    if (phase === "PREFLIGHT" || phase === "RUNNING" || phase === "VALIDATING") {
      return await options.store.transition(options.run.runId, "INFRA_ERROR", {
        classification: "INFRA_ERROR",
        summary: message(error),
      });
    }
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
    await workspace?.dispose();
  }
}
