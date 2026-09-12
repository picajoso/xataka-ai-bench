import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { RunStore, createRunId, type CreateRunPlan } from "../src/index.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function root(): string {
  const directory = mkdtempSync(join(tmpdir(), "aibench-runs-"));
  temporaryDirectories.push(directory);
  return directory;
}

const plan: CreateRunPlan = {
  benchmark: {
    slug: "smoke-benchmark",
    version: "1.0.0",
    definitionHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    promptHash: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    promptLocale: "es",
    inputsPublic: false,
  },
  system: {
    slug: "fake-system",
    version: "1.0.0",
    profileHash: "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
  },
  attempt: { kind: "first-shot", parent: null },
  executionClass: "official-container",
};

function deterministicRandom() {
  const values = [
    "a1b2c3", "d4e5f6071829", "112233", "445566", "778899", "aabbccddeeff",
    "ddeeff", "102030", "405060", "708090", "112233445566", "778899aabbcc",
  ];
  return (bytes: number) => Buffer.from(values.shift()!.slice(0, bytes * 2), "hex");
}

describe("run identifiers", () => {
  test("creates a sortable UTC id with a random suffix", () => {
    expect(createRunId(
      new Date("2026-09-11T15:00:00Z"),
      "smoke-benchmark",
      "fake-system",
      () => Buffer.from("a1b2c3", "hex"),
    )).toBe("20260911T150000Z-smoke-benchmark-fake-system-a1b2c3");
  });
});

describe("RunStore", () => {
  test("creates an immutable directory and resumes it in another store instance", async () => {
    const runsRoot = root();
    const options = { runsRoot, clock: () => new Date("2026-09-11T15:00:00Z"), randomBytes: deterministicRandom() };
    const created = await new RunStore(options).createRun(plan);
    writeFileSync(join(created.directory, ".manifest.json.interrupted"), "{broken");

    const resumed = await new RunStore({ ...options, randomBytes: deterministicRandom() }).loadRun(created.runId);
    expect(resumed).toEqual(created.manifest);
    expect(resumed.status).toBe("PENDING");
    expect(readFileSync(join(created.directory, "manifest.json"), "utf8")).toContain(created.runId);
  });

  test("appends ordered events without rewriting previous lines", async () => {
    const runsRoot = root();
    const store = new RunStore({ runsRoot, clock: () => new Date("2026-09-11T15:00:00Z"), randomBytes: deterministicRandom() });
    const created = await store.createRun(plan);
    const initial = readFileSync(join(created.directory, "events.jsonl"), "utf8");
    await store.appendEvent(created.runId, { type: "diagnostic", payload: { message: "one" } });
    await store.appendEvent(created.runId, { type: "diagnostic", payload: { message: "two" } });
    const final = readFileSync(join(created.directory, "events.jsonl"), "utf8");

    expect(final.startsWith(initial)).toBe(true);
    expect(final.trim().split("\n").map((line) => JSON.parse(line).sequence)).toEqual([0, 1, 2]);
  });

  test("persists transitions atomically and prevents terminal rewrites", async () => {
    const runsRoot = root();
    const store = new RunStore({ runsRoot, clock: () => new Date("2026-09-11T15:00:00Z"), randomBytes: deterministicRandom() });
    const created = await store.createRun(plan);
    await store.transition(created.runId, "PREFLIGHT");
    await store.transition(created.runId, "RUNNING");
    const failed = await store.transition(created.runId, "FAILED", {
      classification: "MODEL_FAILURE",
      summary: "synthetic non-zero exit",
    });
    expect(failed.failure?.classification).toBe("MODEL_FAILURE");
    await expect(store.transition(created.runId, "PREFLIGHT")).rejects.toThrow(/transition/i);
  });

  test("retries only infrastructure failures with a new technical attempt id", async () => {
    const runsRoot = root();
    const store = new RunStore({ runsRoot, clock: () => new Date("2026-09-11T15:00:00Z"), randomBytes: deterministicRandom() });
    const created = await store.createRun(plan);
    await store.transition(created.runId, "PREFLIGHT");
    const failed = await store.transition(created.runId, "INFRA_ERROR", {
      classification: "INFRA_ERROR",
      summary: "container unavailable",
    });
    const retried = await store.transition(created.runId, "PREFLIGHT");
    expect(retried.technicalAttemptId).not.toBe(failed.technicalAttemptId);
    expect(retried.failure).toBeNull();
    expect(retried.finishedAt).toBeNull();
  });

  test("appends a correction after a truncated event instead of rewriting history", async () => {
    const runsRoot = root();
    const store = new RunStore({ runsRoot, clock: () => new Date("2026-09-11T15:00:00Z"), randomBytes: deterministicRandom() });
    const created = await store.createRun(plan);
    const eventsPath = join(created.directory, "events.jsonl");
    const before = readFileSync(eventsPath, "utf8");
    writeFileSync(eventsPath, "{\"truncated\":", { flag: "a" });
    await store.reconcile(created.runId);
    const after = readFileSync(eventsPath, "utf8");
    expect(after.startsWith(`${before}{"truncated":`)).toBe(true);
    expect(after).toContain('"type":"terminal-correction"');
  });
});
