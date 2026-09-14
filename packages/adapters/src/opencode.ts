import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { parseJsonLine } from "./jsonl.js";
import type { AdapterContext, AdapterEvent, AgentAdapter, PreflightReport } from "./types.js";

const execFileAsync = promisify(execFile);

export type OpenCodeCommandOptions = {
  executable: string;
  workspaceRoot: string;
  prompt: string;
  model: string;
  variant?: string;
};

export type OpenCodeOutput = { stream: "stdout" | "stderr"; data: string };
export type OpenCodeLaunch = { output(): AsyncIterable<OpenCodeOutput>; cancel(reason: string): Promise<void> };
export type OpenCodeAdapterOptions = Omit<OpenCodeCommandOptions, "workspaceRoot" | "prompt"> & {
  clock?: () => Date;
  versionReader?: () => Promise<string>;
  launcher?: (command: { executable: string; args: string[] }) => OpenCodeLaunch;
};

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

export function buildOpenCodeCommand(options: OpenCodeCommandOptions): { executable: string; args: string[] } {
  if (!options.executable.trim() || !options.workspaceRoot.trim() || !options.prompt.trim() || !options.model.includes("/")) {
    throw new Error("OpenCode requires an executable, workspace, prompt and provider/model");
  }
  return {
    executable: options.executable,
    args: ["run", "--format", "json", "--print-logs", "--log-level", "ERROR", "--title", "Xataka AI Bench run", "--dir", options.workspaceRoot, "--model", options.model,
      ...(options.variant ? ["--variant", options.variant] : []), options.prompt],
  };
}

export function normalizeOpenCodeJsonLine(line: string, timestamp: string): AdapterEvent[] {
  const event = parseJsonLine(line);
  if (!event) return [{ type: "adapter.error", timestamp, classification: "malformed-event", message: "OpenCode emitted malformed JSON" }];
  const properties = record(event.properties);
  const info = record(properties?.info);
  if (event.type === "session.created" && typeof info?.id === "string") {
    return [{ type: "session.started", timestamp, sessionId: info.id }];
  }
  const part = record(properties?.part);
  if (event.type === "message.part.updated" && part?.type === "text" && typeof part.text === "string") {
    return [{ type: "message.delta", timestamp, text: part.text }];
  }
  if (event.type === "message.part.updated" && part?.type === "tool" && typeof part.id === "string") {
    const state = record(part.state);
    if (state?.status === "running") return [{ type: "tool.started", timestamp, toolCallId: part.id, name: typeof part.tool === "string" ? part.tool : "tool", inputSummary: "" }];
    if (state?.status === "completed" || state?.status === "error") return [{ type: "tool.finished", timestamp, toolCallId: part.id, status: state.status === "completed" ? "ok" : "error", outputSummary: typeof state.error === "string" ? state.error : "" }];
  }
  if (event.type === "session.error") return [{ type: "adapter.error", timestamp, classification: "process-error", message: "OpenCode reported a session error" }];
  if (event.type === "session.status" && record(properties?.status)?.type === "idle") {
    return [{ type: "session.finished", timestamp, outcome: "success", exitCode: 0 }];
  }
  return [];
}

function redact(value: string): string {
  return value.replace(/\bsk-[A-Za-z0-9_-]+\b/g, "[REDACTED]").replace(/\b(Bearer\s+)[^\s]+/gi, "$1[REDACTED]");
}

function defaultLauncher(command: { executable: string; args: string[] }): OpenCodeLaunch {
  const child = spawn(command.executable, command.args, { stdio: ["ignore", "pipe", "pipe"] });
  return {
    async *output() {
      for await (const data of child.stdout) yield { stream: "stdout", data: data.toString() };
      for await (const data of child.stderr) yield { stream: "stderr", data: data.toString() };
    },
    async cancel() { child.kill("SIGTERM"); },
  };
}

async function isolatedVersion(context: AdapterContext, executable: string): Promise<string> {
  if (!context.commandExecutor) throw new Error("An isolated command executor is required");
  let output = "";
  let exitCode: number | null | undefined;
  for await (const event of context.commandExecutor({ executable, args: ["--version"] })) {
    if (event.type === "stdout") output += event.data;
    if (event.type === "exit") exitCode = event.exitCode;
  }
  if (exitCode !== 0) throw new Error("OpenCode version check failed in the isolated environment");
  const version = output.trim();
  if (!version) throw new Error("OpenCode version check produced no output");
  return version;
}

async function* isolatedOutput(context: AdapterContext, command: { executable: string; args: string[] }): AsyncIterable<OpenCodeOutput> {
  if (!context.commandExecutor) return;
  for await (const event of context.commandExecutor(command)) {
    if (event.type === "stdout" || event.type === "stderr") yield { stream: event.type, data: event.data };
  }
}

export class OpenCodeAdapter implements AgentAdapter {
  readonly name = "opencode";
  readonly #options: OpenCodeAdapterOptions;
  #active: OpenCodeLaunch | undefined;
  #cancelExecution: (() => Promise<void>) | undefined;

  constructor(options: OpenCodeAdapterOptions) { this.#options = options; }

  async preflight(context: AdapterContext): Promise<PreflightReport> {
    try {
      const version = context.commandExecutor
        ? await isolatedVersion(context, this.#options.executable)
        : this.#options.versionReader
          ? await this.#options.versionReader()
          : (await execFileAsync(this.#options.executable, ["--version"])).stdout.trim();
      return { ok: true, adapter: this.name, version, diagnostics: [] };
    } catch (error) {
      return { ok: false, adapter: this.name, version: "unavailable", diagnostics: [redact(error instanceof Error ? error.message : "OpenCode version check failed")] };
    }
  }

  async *start(context: AdapterContext): AsyncIterable<AdapterEvent> {
    if (this.#active) throw new Error("OpenCode adapter is already running");
    const command = buildOpenCodeCommand({ executable: this.#options.executable, workspaceRoot: context.workspaceRoot, prompt: context.prompt, model: this.#options.model, ...(this.#options.variant ? { variant: this.#options.variant } : {}) });
    const launch = context.commandExecutor ? undefined : (this.#options.launcher ?? defaultLauncher)(command);
    this.#active = launch;
    this.#cancelExecution = context.cancelExecution;
    const clock = this.#options.clock ?? (() => new Date());
    try {
      for await (const chunk of context.commandExecutor ? isolatedOutput(context, command) : launch!.output()) {
        await context.rawEventSink?.({ adapter: this.name, stream: chunk.stream, data: redact(chunk.data) });
        const timestamp = clock().toISOString();
        if (chunk.stream === "stderr") {
          for (const line of chunk.data.split(/\r?\n/).filter(Boolean)) yield { type: "diagnostic", timestamp, stream: "stderr", level: "warning", message: redact(line) };
        } else {
          for (const line of chunk.data.split(/\r?\n/).filter(Boolean)) yield* normalizeOpenCodeJsonLine(line, timestamp);
        }
      }
    } finally {
      if (this.#active === launch) this.#active = undefined;
      if (this.#cancelExecution === context.cancelExecution) this.#cancelExecution = undefined;
    }
  }

  async cancel(reason: string): Promise<void> {
    const cancellations: Promise<void>[] = [];
    if (this.#active) cancellations.push(this.#active.cancel(reason));
    if (this.#cancelExecution) cancellations.push(this.#cancelExecution());
    await Promise.all(cancellations);
  }
}
