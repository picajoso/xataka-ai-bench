import { parseJsonLine } from "./jsonl.js";
import type { AdapterEvent } from "./types.js";

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
