import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { RunStore, type CreateRunPlan } from "@aibench/runner";
import { assertConsoleId, toConsoleRun } from "../src/model.js";

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));

const plan: CreateRunPlan = {
  benchmark: { slug: "smoke-benchmark", version: "1.0.0", definitionHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", promptHash: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", promptLocale: "es", inputsPublic: false },
  system: { slug: "fake-system", version: "1.0.0", profileHash: "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc" },
  attempt: { kind: "first-shot", parent: null }, executionClass: "official-container",
};

describe("local console read model", () => {
  test("lists valid manifests and exposes a redacted run view", async () => {
    const runsRoot = mkdtempSync(join(tmpdir(), "aibench-console-"));
    roots.push(runsRoot);
    const randomValues = ["a1b2c3", "d4e5f6071829", "112233"];
    const store = new RunStore({
      runsRoot,
      clock: () => new Date("2026-09-21T12:00:00Z"),
      randomBytes: (bytes) => Buffer.from(randomValues.shift()!.slice(0, bytes * 2), "hex"),
    });
    const created = await store.createRun(plan);
    const runs = await store.listRuns();
    expect(runs.map((run) => run.runId)).toEqual([created.runId]);
    expect(toConsoleRun({ ...runs[0]!, failure: { classification: "INFRA_ERROR", summary: "token=private-value" } }).failureSummary).toContain("[redacted]");
  });

  test("rejects path-like console identifiers", () => {
    expect(() => assertConsoleId("../state", "run")).toThrow("Invalid run identifier");
  });
});
