import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { FakeAdapter, type AdapterContext, type AdapterEvent } from "../src/index.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function context(): AdapterContext {
  const workspaceRoot = mkdtempSync(join(tmpdir(), "aibench-fake-"));
  temporaryDirectories.push(workspaceRoot);
  return {
    runId: "20260911T150000Z-smoke-benchmark-fake-system-a1b2c3",
    prompt: "Create answer.txt",
    workspaceRoot,
    environment: {},
  };
}

const times = [
  "2026-09-11T15:00:00.000Z",
  "2026-09-11T15:00:01.000Z",
  "2026-09-11T15:00:02.000Z",
  "2026-09-11T15:00:03.000Z",
  "2026-09-11T15:00:04.000Z",
  "2026-09-11T15:00:05.000Z",
];

function clock() {
  let index = 0;
  return () => new Date(times[Math.min(index++, times.length - 1)]!);
}

describe("FakeAdapter", () => {
  test("emits structured deterministic events and confines file changes", async () => {
    const adapterContext = context();
    const adapter = new FakeAdapter({
      clock: clock(),
      fileChanges: [{ path: "nested/answer.txt", content: "AI_BENCH_SMOKE_OK\n" }],
      events: [
        { type: "session.started", sessionId: "fake-session" },
        { type: "message.delta", text: "working" },
        { type: "tool.started", toolCallId: "tool-1", name: "write", inputSummary: "answer.txt" },
        { type: "tool.finished", toolCallId: "tool-1", status: "ok", outputSummary: "written" },
        { type: "diagnostic", stream: "stderr", level: "warning", message: "synthetic warning" },
        { type: "session.finished", outcome: "success", exitCode: 0 },
      ],
    });

    await expect(adapter.preflight(adapterContext)).resolves.toMatchObject({ ok: true, adapter: "fake" });
    const events: AdapterEvent[] = [];
    for await (const event of adapter.start(adapterContext)) events.push(event);

    expect(events.map((event) => event.type)).toEqual([
      "session.started", "message.delta", "tool.started", "tool.finished", "diagnostic", "session.finished",
    ]);
    expect(events.map((event) => event.timestamp)).toEqual(times);
    expect(readFileSync(join(adapterContext.workspaceRoot, "nested/answer.txt"), "utf8")).toBe("AI_BENCH_SMOKE_OK\n");
  });

  test("rejects file changes outside the supplied workspace", async () => {
    const adapter = new FakeAdapter({
      events: [],
      fileChanges: [{ path: "../escape.txt", content: "no" }],
    });
    const consume = async () => {
      for await (const event of adapter.start(context())) {
        void event;
      }
    };
    await expect(consume()).rejects.toThrow(/outside/i);
  });

  test("normalizes malformed scripted events to an adapter error", async () => {
    const adapter = new FakeAdapter({
      clock: clock(),
      events: [{ type: "message.delta", text: 42 }],
    });
    const events: AdapterEvent[] = [];
    for await (const event of adapter.start(context())) events.push(event);
    expect(events).toEqual([{
      type: "adapter.error",
      timestamp: times[0],
      classification: "malformed-event",
      message: "Fake adapter received a malformed scripted event",
    }]);
  });

  test("preserves a scripted non-zero model exit", async () => {
    const adapter = new FakeAdapter({
      clock: clock(),
      events: [{ type: "session.finished", outcome: "failed", exitCode: 2 }],
    });
    const events: AdapterEvent[] = [];
    for await (const event of adapter.start(context())) events.push(event);
    expect(events[0]).toMatchObject({ type: "session.finished", outcome: "failed", exitCode: 2 });
  });

  test("cancels an active delay promptly and emits a terminal cancellation", async () => {
    const adapter = new FakeAdapter({
      clock: clock(),
      events: [
        { type: "session.started", sessionId: "fake-session" },
        { afterMs: 5_000, type: "message.delta", text: "too late" },
      ],
    });
    const iterator = adapter.start(context())[Symbol.asyncIterator]();
    await expect(iterator.next()).resolves.toMatchObject({ value: { type: "session.started" } });
    const delayed = iterator.next();
    await adapter.cancel("test cancellation");
    await expect(delayed).resolves.toMatchObject({
      value: { type: "adapter.error", classification: "cancelled" },
    });
    await expect(iterator.next()).resolves.toMatchObject({
      value: { type: "session.finished", outcome: "cancelled", exitCode: null },
    });
  });

  test("can reproduce a delay longer than a caller timeout", async () => {
    const adapter = new FakeAdapter({
      events: [{ afterMs: 100, type: "session.started", sessionId: "late" }],
    });
    const iterator = adapter.start(context())[Symbol.asyncIterator]();
    const outcome = await Promise.race([
      iterator.next().then(() => "event"),
      new Promise<string>((resolve) => setTimeout(() => resolve("timeout"), 10)),
    ]);
    expect(outcome).toBe("timeout");
    await adapter.cancel("test cleanup");
    await iterator.next();
  });
});
