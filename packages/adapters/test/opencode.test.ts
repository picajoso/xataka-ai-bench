import { describe, expect, test } from "vitest";
import { buildOpenCodeCommand, normalizeOpenCodeJsonLine } from "../src/index.js";

const timestamp = "2026-09-12T10:00:00.000Z";

describe("OpenCode JSON normalization", () => {
  test("normalizes session, text, tools and idle completion", () => {
    expect(normalizeOpenCodeJsonLine('{"type":"session.created","properties":{"info":{"id":"s1"}}}', timestamp)).toEqual([{ type: "session.started", timestamp, sessionId: "s1" }]);
    expect(normalizeOpenCodeJsonLine('{"type":"message.part.updated","properties":{"part":{"type":"text","text":"done"}}}', timestamp)).toEqual([{ type: "message.delta", timestamp, text: "done" }]);
    expect(normalizeOpenCodeJsonLine('{"type":"message.part.updated","properties":{"part":{"id":"t1","type":"tool","tool":"bash","state":{"status":"running"}}}}', timestamp)).toEqual([{ type: "tool.started", timestamp, toolCallId: "t1", name: "bash", inputSummary: "" }]);
    expect(normalizeOpenCodeJsonLine('{"type":"session.status","properties":{"status":{"type":"idle"}}}', timestamp)).toEqual([{ type: "session.finished", timestamp, outcome: "success", exitCode: 0 }]);
  });
});

describe("OpenCode command construction", () => {
  test("pins model and reasoning variant without automatic permission approval", () => {
    const command = buildOpenCodeCommand({ executable: "opencode", workspaceRoot: "/workspace", prompt: "Build it.", model: "lmstudio/qwen3.8-27b", variant: "max" });
    expect(command.args).toEqual(["run", "--format", "json", "--dir", "/workspace", "--model", "lmstudio/qwen3.8-27b", "--variant", "max", "Build it."]);
    expect(command.args).not.toContain("--auto");
  });
});
