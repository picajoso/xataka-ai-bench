import { parseJsonLine } from "./jsonl.js";
import type { AdapterEvent } from "./types.js";

export type OpenCodeCommandOptions = {
  executable: string;
  workspaceRoot: string;
  prompt: string;
  model: string;
  variant?: string;
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
    args: ["run", "--format", "json", "--dir", options.workspaceRoot, "--model", options.model,
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
