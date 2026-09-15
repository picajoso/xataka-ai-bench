import { describe, expect, test } from "vitest";
import { OpenCodeAdapter, buildOpenCodeCommand, normalizeOpenCodeJsonLine, type OpenCodeLaunch } from "../src/index.js";

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
    expect(command.args).toEqual(["run", "--format", "json", "--print-logs", "--log-level", "ERROR", "--title", "Xataka AI Bench run", "--dir", "/workspace", "--model", "lmstudio/qwen3.8-27b", "--variant", "max", "Build it."]);
    expect(command.args).not.toContain("--auto");
  });
});

describe("OpenCodeAdapter", () => {
  test("preflights through the isolated command executor when one is supplied", async () => {
    const commands: unknown[] = [];
    const adapter = new OpenCodeAdapter({ executable: "opencode", model: "ninfer/qwen3.8-27b" });

    const report = await adapter.preflight({
      runId: "run-1", prompt: "test", workspaceRoot: "/workspace", environment: {},
      commandExecutor: async function* (command) {
        commands.push(command);
        yield { type: "stdout", data: "1.18.30\n" };
        yield { type: "exit", exitCode: 0 };
      },
    });

    expect(commands).toEqual([{ executable: "opencode", args: ["--version"] }]);
    expect(report).toEqual({ ok: true, adapter: "opencode", version: "1.18.30", diagnostics: [] });
  });

  test("preflights locally and normalizes private streamed JSON", async () => {
    const raw: unknown[] = [];
    const launch: OpenCodeLaunch = {
      async *output() {
        yield { stream: "stdout", data: '{"type":"session.created","properties":{"info":{"id":"s1"}}}\n' };
        yield { stream: "stdout", data: '{"type":"session.status","properties":{"status":{"type":"idle"}}}\n' };
      },
      async cancel() {},
    };
    const adapter = new OpenCodeAdapter({ executable: "opencode", model: "ninfer/qwen3.8-27b", variant: "max", clock: () => new Date(timestamp), versionReader: async () => "1.18.30", launcher: () => launch });
    await expect(adapter.preflight({ runId: "run-1", prompt: "test", workspaceRoot: "/workspace", environment: {} })).resolves.toMatchObject({ ok: true, version: "1.18.30" });
    const events = [];
    for await (const event of adapter.start({ runId: "run-1", prompt: "test", workspaceRoot: "/workspace", environment: {}, rawEventSink: async (value) => { raw.push(value); } })) events.push(event);
    expect(events.map((event) => event.type)).toEqual(["session.started", "session.finished"]);
    expect(raw).toHaveLength(2);
  });

  test("uses the supplied isolated command executor instead of launching on the controller", async () => {
    const commands: unknown[] = [];
    const adapter = new OpenCodeAdapter({ executable: "opencode", model: "ninfer/qwen3.8-27b", launcher: () => { throw new Error("controller launch is unsafe"); } });
    const events = [];
    for await (const event of adapter.start({
      runId: "run-1", prompt: "test", workspaceRoot: "/workspace", environment: {},
      commandExecutor: async function* (command) {
        commands.push(command);
        yield { type: "stdout", data: '{"type":"session.status","properties":{"status":{"type":"idle"}}}\n' };
        yield { type: "exit", exitCode: 0 };
      },
    })) events.push(event);

    expect(commands).toEqual([{ executable: "opencode", args: ["run", "--format", "json", "--print-logs", "--log-level", "ERROR", "--title", "Xataka AI Bench run", "--dir", "/workspace", "--model", "ninfer/qwen3.8-27b", "test"] }]);
    expect(events.at(-1)).toMatchObject({ type: "session.finished", outcome: "success" });
  });

  test("reports success when an isolated OpenCode process exits zero without an idle event", async () => {
    const adapter = new OpenCodeAdapter({ executable: "opencode", model: "ninfer/qwen3.8-27b" });
    const events = [];

    for await (const event of adapter.start({
      runId: "run-1", prompt: "test", workspaceRoot: "/workspace", environment: {},
      commandExecutor: async function* () {
        yield { type: "stderr" as const, data: "non-fatal catalogue warning\n" };
        yield { type: "exit" as const, exitCode: 0 };
      },
    })) events.push(event);

    expect(events.at(-1)).toMatchObject({ type: "session.finished", outcome: "success", exitCode: 0 });
  });

  test("cancels an isolated execution through its supplied callback", async () => {
    let releaseExecution: (() => void) | undefined;
    let cancellationCalls = 0;
    const adapter = new OpenCodeAdapter({ executable: "opencode", model: "ninfer/qwen3.8-27b" });

    const execution = adapter.start({
      runId: "run-1",
      prompt: "test",
      workspaceRoot: "/workspace",
      environment: {},
      commandExecutor: async function* () {
        await new Promise<void>((resolve) => { releaseExecution = resolve; });
        yield { type: "exit" as const, exitCode: 143 };
      },
      cancelExecution: async () => { cancellationCalls += 1; },
    } as Parameters<typeof adapter.start>[0])[Symbol.asyncIterator]();

    const pending = execution.next();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    await adapter.cancel("first-shot timeout");

    expect(cancellationCalls).toBe(1);
    releaseExecution?.();
    await pending;
  });
});
