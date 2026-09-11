import { describe, expect, test } from "vitest";
import { AdapterEventSchema } from "../src/index.js";

describe("adapter event contract", () => {
  test("accepts every normalized event family", () => {
    const timestamp = "2026-09-11T15:00:00.000Z";
    const events = [
      { type: "session.started", timestamp, sessionId: "session-1" },
      { type: "message.delta", timestamp, text: "hello" },
      { type: "tool.started", timestamp, toolCallId: "tool-1", name: "shell", inputSummary: "run tests" },
      { type: "tool.finished", timestamp, toolCallId: "tool-1", status: "ok", outputSummary: "passed" },
      { type: "usage", timestamp, inputTokens: 10, outputTokens: 4, costUsd: null },
      { type: "diagnostic", timestamp, stream: "stderr", level: "warning", message: "retrying" },
      { type: "session.finished", timestamp, outcome: "success", exitCode: 0 },
      { type: "adapter.error", timestamp, classification: "process-error", message: "failed" },
    ];

    for (const event of events) expect(AdapterEventSchema.safeParse(event).success).toBe(true);
  });

  test("rejects malformed, vendor-raw and unknown event fields", () => {
    expect(AdapterEventSchema.safeParse({ type: "message.delta", text: 42 }).success).toBe(false);
    expect(AdapterEventSchema.safeParse({
      type: "message.delta",
      timestamp: "2026-09-11T15:00:00.000Z",
      text: "safe",
      raw: { apiKey: "must-stay-private" },
    }).success).toBe(false);
    expect(AdapterEventSchema.safeParse({
      type: "vendor.unknown",
      timestamp: "2026-09-11T15:00:00.000Z",
    }).success).toBe(false);
  });
});
