import { describe, expect, test } from "vitest";
import { CodexAdapter, buildCodexCommand, normalizeCodexJsonLine, type CodexLaunch, type CodexOutput } from "../src/index.js";

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

describe("CodexAdapter", () => {
  test("records the installed CLI version without running a model", async () => {
    const adapter = new CodexAdapter({
      executable: "codex",
      versionReader: async () => "codex-cli 0.154.0",
      launcher: () => { throw new Error("must not launch during preflight"); },
    });

    await expect(adapter.preflight({ runId: "run-1", prompt: "test", workspaceRoot: "/workspace", environment: {} }))
      .resolves.toEqual({ ok: true, adapter: "codex", version: "codex-cli 0.154.0", diagnostics: [] });
  });

  test("normalizes stdout, preserves raw records privately and forwards stderr as diagnostics", async () => {
    const raw: unknown[] = [];
    let cancelled = false;
    const launch: CodexLaunch = {
      async *output() {
        yield { stream: "stdout", data: '{"type":"thread.started","thread_id":"thread-1"}\n' };
        yield { stream: "stderr", data: "transient warning\n" };
        yield { stream: "stdout", data: '{"type":"turn.completed","exit_code":0}\n' };
      },
      async cancel() { cancelled = true; },
    };
    const adapter = new CodexAdapter({
      executable: "codex", clock: () => new Date(timestamp),
      versionReader: async () => "codex-cli 0.154.0", launcher: () => launch,
    });
    const events = [];
    for await (const event of adapter.start({
      runId: "run-1", prompt: "test", workspaceRoot: "/workspace", environment: {},
      rawEventSink: async (record) => { raw.push(record); },
    })) events.push(event);
    await adapter.cancel("test cancellation after completion");

    expect(events).toEqual([
      { type: "session.started", timestamp, sessionId: "thread-1" },
      { type: "diagnostic", timestamp, stream: "stderr", level: "warning", message: "transient warning" },
      { type: "session.finished", timestamp, outcome: "success", exitCode: 0 },
    ]);
    expect(raw).toHaveLength(3);
    expect(cancelled).toBe(false);
  });

  test("uses the supplied isolated command executor instead of launching on the controller", async () => {
    const commands: unknown[] = [];
    const adapter = new CodexAdapter({ executable: "codex", model: "gpt-5.6-sol", launcher: () => { throw new Error("controller launch is unsafe"); } });
    const events = [];
    for await (const event of adapter.start({
      runId: "run-1", prompt: "test", workspaceRoot: "/workspace", environment: {},
      commandExecutor: async function* (command) {
        commands.push(command);
        yield { type: "stdout", data: '{"type":"turn.completed","exit_code":0}\n' };
        yield { type: "exit", exitCode: 0 };
      },
    })) events.push(event);

    expect(commands).toEqual([{ executable: "codex", args: ["exec", "--json", "--cd", "/workspace", "--skip-git-repo-check", "--ephemeral", "--model", "gpt-5.6-sol", "test"] }]);
    expect(events.at(-1)).toMatchObject({ type: "session.finished", outcome: "success" });
  });

  test("cancels the active owned process", async () => {
    let release: (() => void) | undefined;
    let cancelled = false;
    const launch: CodexLaunch = {
      async *output() {
        await new Promise<void>((resolve) => { release = resolve; });
        yield* [] as CodexOutput[];
      },
      async cancel() { cancelled = true; release?.(); },
    };
    const adapter = new CodexAdapter({ executable: "codex", launcher: () => launch });
    const iterator = adapter.start({ runId: "run-1", prompt: "test", workspaceRoot: "/workspace", environment: {} })[Symbol.asyncIterator]();
    const pending = iterator.next();
    await adapter.cancel("timeout");
    await pending;

    expect(cancelled).toBe(true);
  });
});
