import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { parseJsonLine } from "./jsonl.js";
import type { AdapterContext, AdapterEvent, AgentAdapter, PreflightReport } from "./types.js";

const execFileAsync = promisify(execFile);

export type CodexCommandOptions = {
  executable: string;
  workspaceRoot: string;
  prompt: string;
  model?: string;
};

export type ProcessCommand = {
  executable: string;
  args: string[];
};

export type CodexOutput = { stream: "stdout" | "stderr"; data: string };

export type CodexLaunch = {
  output(): AsyncIterable<CodexOutput>;
  cancel(reason: string): Promise<void>;
};

export type CodexAdapterOptions = {
  executable: string;
  model?: string;
  clock?: () => Date;
  versionReader?: () => Promise<string>;
  launcher?: (command: ProcessCommand) => CodexLaunch;
};

function numberAt(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function textAt(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function recordAt(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function seemsSecret(value: string): boolean {
  return /(?:^sk-[a-z0-9]|api[_-]?key|token|secret|password)/i.test(value);
}

export function buildCodexCommand(options: CodexCommandOptions): ProcessCommand {
  if (!options.executable.trim() || !options.workspaceRoot.trim() || !options.prompt.trim()) {
    throw new Error("Codex command requires an executable, workspace and prompt");
  }
  if (options.model && seemsSecret(options.model)) {
    throw new Error("Codex model value resembles a secret and cannot be used as an argument");
  }
  return {
    executable: options.executable,
    args: [
      "exec", "--json", "--cd", options.workspaceRoot, "--skip-git-repo-check", "--ephemeral",
      ...(options.model ? ["--model", options.model] : []),
      options.prompt,
    ],
  };
}

export function normalizeCodexJsonLine(line: string, timestamp: string): AdapterEvent[] {
  const event = parseJsonLine(line);
  if (!event) return [{
    type: "adapter.error", timestamp, classification: "malformed-event", message: "Codex emitted malformed JSONL",
  }];

  if (event.type === "thread.started" && typeof event.thread_id === "string") {
    return [{ type: "session.started", timestamp, sessionId: event.thread_id }];
  }

  const item = recordAt(event.item);
  if (event.type === "item.completed" && item?.type === "agent_message" && typeof item.text === "string") {
    return [{ type: "message.delta", timestamp, text: item.text }];
  }
  if (event.type === "item.started" && item?.type === "command_execution" && typeof item.id === "string") {
    return [{
      type: "tool.started", timestamp, toolCallId: item.id,
      name: "command_execution", inputSummary: textAt(item.command) ?? "",
    }];
  }
  if (event.type === "item.completed" && item?.type === "command_execution" && typeof item.id === "string") {
    const exitCode = numberAt(item.exit_code);
    return [{
      type: "tool.finished", timestamp, toolCallId: item.id,
      status: exitCode === 0 ? "ok" : "error",
      outputSummary: textAt(item.aggregated_output) ?? "",
    }];
  }
  if (event.type === "turn.completed") {
    const usage = recordAt(event.usage);
    const exitCode = numberAt(event.exit_code) ?? 0;
    const events: AdapterEvent[] = [];
    if (usage) events.push({
      type: "usage", timestamp,
      inputTokens: numberAt(usage.input_tokens) ?? 0,
      outputTokens: numberAt(usage.output_tokens) ?? 0,
      costUsd: null,
    });
    events.push({
      type: "session.finished", timestamp,
      outcome: exitCode === 0 ? "success" : "failed",
      exitCode,
    });
    return events;
  }
  return [];
}

function redact(value: string): string {
  return value
    .replace(/\bsk-[A-Za-z0-9_-]+\b/g, "[REDACTED]")
    .replace(/\b(Bearer\s+)[^\s]+/gi, "$1[REDACTED]");
}

function defaultLauncher(command: ProcessCommand): CodexLaunch {
  const child = spawn(command.executable, command.args, { stdio: ["ignore", "pipe", "pipe"] });
  return {
    async *output() {
      for await (const data of child.stdout) yield { stream: "stdout", data: data.toString() };
      for await (const data of child.stderr) yield { stream: "stderr", data: data.toString() };
    },
    async cancel() {
      child.kill("SIGTERM");
    },
  };
}

export class CodexAdapter implements AgentAdapter {
  readonly name = "codex";
  readonly #options: CodexAdapterOptions;
  #active: CodexLaunch | undefined;

  constructor(options: CodexAdapterOptions) {
    this.#options = options;
  }

  async preflight(context: AdapterContext): Promise<PreflightReport> {
    void context;
    try {
      const version = this.#options.versionReader
        ? await this.#options.versionReader()
        : (await execFileAsync(this.#options.executable, ["--version"])).stdout.trim();
      return { ok: true, adapter: this.name, version, diagnostics: [] };
    } catch (error) {
      return { ok: false, adapter: this.name, version: "unavailable", diagnostics: [redact(error instanceof Error ? error.message : "Codex version check failed")] };
    }
  }

  async *start(context: AdapterContext): AsyncIterable<AdapterEvent> {
    if (this.#active) throw new Error("Codex adapter is already running");
    const command = buildCodexCommand({
      executable: this.#options.executable,
      workspaceRoot: context.workspaceRoot,
      prompt: context.prompt,
      ...(this.#options.model ? { model: this.#options.model } : {}),
    });
    const launch = (this.#options.launcher ?? defaultLauncher)(command);
    this.#active = launch;
    const clock = this.#options.clock ?? (() => new Date());
    try {
      for await (const chunk of launch.output()) {
        await context.rawEventSink?.({ adapter: this.name, stream: chunk.stream, data: redact(chunk.data) });
        const timestamp = clock().toISOString();
        if (chunk.stream === "stderr") {
          for (const line of chunk.data.split(/\r?\n/).filter(Boolean)) {
            yield { type: "diagnostic", timestamp, stream: "stderr", level: "warning", message: redact(line) };
          }
          continue;
        }
        for (const line of chunk.data.split(/\r?\n/).filter(Boolean)) {
          yield* normalizeCodexJsonLine(line, timestamp);
        }
      }
    } finally {
      if (this.#active === launch) this.#active = undefined;
    }
  }

  async cancel(reason: string): Promise<void> {
    void reason;
    await this.#active?.cancel(reason);
  }
}
