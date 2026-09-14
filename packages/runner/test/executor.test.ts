import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { FakeAdapter } from "@aibench/adapters";
import {
  DockerIsolationProvider,
  RunStore,
  executeRun,
  parsePrivateEndpoint,
  type CreateRunPlan,
  type IsolationRequest,
  type IsolationProvider,
  type IsolatedWorkspace,
} from "../src/index.js";
import type { AgentAdapter } from "@aibench/adapters";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

const plan: CreateRunPlan = {
  benchmark: {
    slug: "smoke-benchmark", version: "1.0.0",
    definitionHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    promptHash: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    promptLocale: "es", inputsPublic: true,
  },
  system: {
    slug: "fake-system", version: "1.0.0",
    profileHash: "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
  },
  attempt: { kind: "first-shot", parent: null },
  executionClass: "official-container",
};

function setup() {
  const root = mkdtempSync(join(tmpdir(), "aibench-executor-"));
  temporaryDirectories.push(root);
  mkdirSync(join(root, "runs"));
  const store = new RunStore({
    runsRoot: join(root, "runs"),
    clock: () => new Date("2026-09-12T10:00:00Z"),
    randomBytes: (size) => Buffer.alloc(size, 1),
  });
  return { root, store };
}

function isolationRequest(root: string, runId: string): IsolationRequest {
  const fixturesPath = join(root, "fixtures");
  mkdirSync(fixturesPath, { recursive: true });
  return {
    runId,
    executionClass: "official-container",
    storageRoot: root,
    fixturesPath,
    workspacePath: join(root, "workspace", runId),
    outputPath: join(root, "output", runId),
    networkPolicy: "blocked",
    limits: { cpu: 1, memoryMb: 512, pids: 32 },
  };
}

describe("executeRun", () => {
  test("records infrastructure failure before adapter preflight when a forbidden network control is reachable", async () => {
    const { root, store } = setup();
    const run = await store.createRun(plan);
    let adapterPreflightCalled = false;
    const adapter: AgentAdapter = {
      name: "inspection",
      async preflight() { adapterPreflightCalled = true; return { ok: true, adapter: "inspection", version: "1", diagnostics: [] }; },
      async *start() { yield { type: "session.finished", timestamp: new Date().toISOString(), outcome: "success", exitCode: 0 }; },
      async cancel() {},
    };
    const isolation: IsolationProvider = {
      async prepare(request) {
        return {
          request, executionClass: "official-container" as const,
          commandFor: () => [],
          async *exec() { yield { type: "exit" as const, exitCode: 0 }; },
          async dispose() {},
        } satisfies IsolatedWorkspace;
      },
    };
    const request = {
      ...isolationRequest(root, run.runId),
      networkPolicy: "package-registries-and-local-endpoint" as const,
      privateEndpoints: [parsePrivateEndpoint({ alias: "inference.local", host: "192.168.1.50", port: 1234 })],
      proxyVersion: "1.0.0",
    };

    const result = await executeRun({ store, run, prompt: "Build.", timeoutMs: 100, adapter, isolation, isolationRequest: request });

    expect(result).toMatchObject({ status: "INFRA_ERROR", failure: { classification: "INFRA_ERROR" } });
    expect(adapterPreflightCalled).toBe(false);
  });

  test("gives adapters a container workspace and an isolated command executor", async () => {
    const { root, store } = setup();
    const run = await store.createRun(plan);
    let receivedWorkspace = "";
    let commandExecutorAvailable = false;
    const adapter: AgentAdapter = {
      name: "inspection",
      async preflight() { return { ok: true, adapter: "inspection", version: "1", diagnostics: [] }; },
      async *start(context) {
        receivedWorkspace = context.workspaceRoot;
        commandExecutorAvailable = typeof context.commandExecutor === "function";
        yield { type: "session.finished", timestamp: new Date().toISOString(), outcome: "success", exitCode: 0 };
      },
      async cancel() {},
    };
    const isolation: IsolationProvider = {
      async prepare(request) {
        return {
          request, executionClass: "official-container" as const,
          commandFor: () => [],
          async *exec() { yield { type: "exit" as const, exitCode: 0 }; },
          async dispose() {},
        } satisfies IsolatedWorkspace;
      },
    };

    await executeRun({ store, run, prompt: "Build.", timeoutMs: 100, adapter, isolation, isolationRequest: isolationRequest(root, run.runId) });

    expect(receivedWorkspace).toBe("/workspace");
    expect(commandExecutorAvailable).toBe(true);
  });

  test("makes the approved execution environment available only to isolated commands", async () => {
    const { root, store } = setup();
    const run = await store.createRun(plan);
    let receivedEnvironment: Record<string, string> | undefined;
    const adapter: AgentAdapter = {
      name: "inspection",
      async preflight() { return { ok: true, adapter: "inspection", version: "1", diagnostics: [] }; },
      async *start(context) {
        for await (const _event of context.commandExecutor!({ executable: "agent", args: ["run"] })) {
          // Exercise the isolated command stream before ending the synthetic session.
          void _event;
        }
        yield { type: "session.finished", timestamp: new Date().toISOString(), outcome: "success", exitCode: 0 };
      },
      async cancel() {},
    };
    const isolation: IsolationProvider = {
      async prepare(request) {
        return {
          request, executionClass: "official-container" as const,
          commandFor: () => [],
          async *exec(command) {
            receivedEnvironment = command.env;
            yield { type: "exit" as const, exitCode: 0 };
          },
          async dispose() {},
        } satisfies IsolatedWorkspace;
      },
    };

    await executeRun({
      store, run, prompt: "Build.", timeoutMs: 100, adapter, isolation,
      isolationRequest: isolationRequest(root, run.runId),
      environment: { NINFER_API_KEY: "test-secret" },
    });

    expect(receivedEnvironment).toEqual({ NINFER_API_KEY: "test-secret" });
  });

  test("records a successful agent session as ready for review", async () => {
    const { root, store } = setup();
    const run = await store.createRun(plan);
    const request = isolationRequest(root, run.runId);

    const result = await executeRun({
      store, run, prompt: "Build the smoke fixture.", timeoutMs: 100,
      adapter: new FakeAdapter({ events: [
        { type: "session.started", sessionId: "fake-session" },
        { type: "session.finished", outcome: "success", exitCode: 0 },
      ] }),
      isolation: new DockerIsolationProvider({ image: "aibench/agent-runner:test" }),
      isolationRequest: request,
    });

    expect(result.status).toBe("READY_FOR_REVIEW");
    expect((await store.loadRun(run.runId)).status).toBe("READY_FOR_REVIEW");
    expect(existsSync(request.workspacePath)).toBe(false);
  });

  test("records a failed preflight as infrastructure failure", async () => {
    const { root, store } = setup();
    const run = await store.createRun(plan);

    const result = await executeRun({
      store, run, prompt: "Build the smoke fixture.", timeoutMs: 100,
      adapter: new FakeAdapter({ events: [], preflight: { ok: false, adapter: "fake", version: "1.0.0", diagnostics: ["not available"] } }),
      isolation: new DockerIsolationProvider({ image: "aibench/agent-runner:test" }),
      isolationRequest: isolationRequest(root, run.runId),
    });

    expect(result).toMatchObject({ status: "INFRA_ERROR", failure: { classification: "INFRA_ERROR" } });
  });

  test("cancels a session that exceeds its first-shot limit", async () => {
    const { root, store } = setup();
    const run = await store.createRun(plan);

    const result = await executeRun({
      store, run, prompt: "Build the smoke fixture.", timeoutMs: 10,
      adapter: new FakeAdapter({ events: [{ afterMs: 100, type: "session.finished", outcome: "success", exitCode: 0 }] }),
      isolation: new DockerIsolationProvider({ image: "aibench/agent-runner:test" }),
      isolationRequest: isolationRequest(root, run.runId),
    });

    expect(result).toMatchObject({ status: "TIMEOUT", failure: { classification: "TIMEOUT" } });
  });

  test("cleans the workspace after an adapter infrastructure error", async () => {
    const { root, store } = setup();
    const run = await store.createRun(plan);
    const request = isolationRequest(root, run.runId);
    const adapter = new FakeAdapter({ events: [{ type: "session.finished", outcome: "failed", exitCode: 1 }] });

    const result = await executeRun({
      store, run, prompt: "Build the smoke fixture.", timeoutMs: 100,
      adapter,
      isolation: new DockerIsolationProvider({ image: "aibench/agent-runner:test" }),
      isolationRequest: request,
    });

    expect(result).toMatchObject({ status: "FAILED", failure: { classification: "MODEL_FAILURE" } });
    expect(existsSync(request.workspacePath)).toBe(false);
  });
});
