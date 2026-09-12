import { describe, expect, test } from "vitest";
import { buildCodexCommand, normalizeCodexJsonLine } from "../src/index.js";

const timestamp = "2026-09-12T10:00:00.000Z";

describe("Codex JSONL normalization", () => {
  test("normalizes a session, agent message, command and successful completion", () => {
    expect(normalizeCodexJsonLine('{"type":"thread.started","thread_id":"thread-1"}', timestamp)).toEqual([
      { type: "session.started", timestamp, sessionId: "thread-1" },
    ]);
    expect(normalizeCodexJsonLine('{"type":"item.completed","item":{"type":"agent_message","text":"Done."}}', timestamp)).toEqual([
      { type: "message.delta", timestamp, text: "Done." },
    ]);
    expect(normalizeCodexJsonLine('{"type":"item.completed","item":{"type":"command_execution","id":"call-1","command":"pnpm test","aggregated_output":"all passed","exit_code":0}}', timestamp)).toEqual([
      { type: "tool.finished", timestamp, toolCallId: "call-1", status: "ok", outputSummary: "all passed" },
    ]);
    expect(normalizeCodexJsonLine('{"type":"turn.completed","usage":{"input_tokens":12,"output_tokens":5},"exit_code":0}', timestamp)).toEqual([
      { type: "usage", timestamp, inputTokens: 12, outputTokens: 5, costUsd: null },
      { type: "session.finished", timestamp, outcome: "success", exitCode: 0 },
    ]);
  });

  test("turns malformed JSON into a normalized private-safe error", () => {
    expect(normalizeCodexJsonLine('{not json', timestamp)).toEqual([{
      type: "adapter.error", timestamp, classification: "malformed-event", message: "Codex emitted malformed JSONL",
    }]);
  });
});

describe("Codex command construction", () => {
  test("uses JSONL, a confined workspace and an explicit model", () => {
    expect(buildCodexCommand({
      executable: "codex", workspaceRoot: "/workspace/run-1", prompt: "Build it.", model: "gpt-5.6-sol",
    })).toEqual({
      executable: "codex",
      args: ["exec", "--json", "--cd", "/workspace/run-1", "--skip-git-repo-check", "--ephemeral", "--model", "gpt-5.6-sol", "Build it."],
    });
  });

  test("rejects a model value that resembles a secret", () => {
    expect(() => buildCodexCommand({
      executable: "codex", workspaceRoot: "/workspace/run-1", prompt: "Build it.", model: "sk-secret-value",
    })).toThrow(/secret/i);
  });
});
