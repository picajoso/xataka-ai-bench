import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { createBatchPlan, PlanStore, withGlobalRunLock } from "../src/index.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

const benchmarks = [
  { slug: "zeta", version: "1.0.0", hash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
  { slug: "alpha", version: "1.0.0", hash: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" },
];
const systems = [
  { slug: "system-b", version: "1.0.0", hash: "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc" },
  { slug: "system-a", version: "1.0.0", hash: "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd" },
];

describe("batch planning", () => {
  test("creates a sorted Cartesian matrix and records explicit exclusions", () => {
    const plan = createBatchPlan(benchmarks, systems, {
      createdAt: new Date("2026-09-11T15:00:00Z"),
      randomBytes: () => Buffer.from("a1b2c3", "hex"),
      official: false,
      exclude: [{ benchmarkSlug: "zeta", systemSlug: "system-b" }],
    });
    expect(plan.runs.map((run) => `${run.benchmarkSlug}/${run.systemSlug}`)).toEqual([
      "alpha/system-a", "alpha/system-b", "zeta/system-a",
    ]);
    expect(plan.official).toBe(false);
    expect(plan.confirmedAt).toBeNull();
  });

  test("requires confirmation metadata for an official plan", () => {
    expect(() => createBatchPlan(benchmarks, systems, {
      createdAt: new Date("2026-09-11T15:00:00Z"),
      randomBytes: () => Buffer.from("a1b2c3", "hex"),
      official: true,
    })).toThrow(/confirmation/i);
  });
});

describe("plan storage", () => {
  test("persists a confirmed plan once and reloads its immutable selection", async () => {
    const directory = mkdtempSync(join(tmpdir(), "aibench-plans-"));
    temporaryDirectories.push(directory);
    const plan = createBatchPlan(benchmarks, systems, {
      createdAt: new Date("2026-09-13T12:00:00.000Z"),
      randomBytes: () => Buffer.from("a1b2c3", "hex"),
      official: true,
      confirmedAt: new Date("2026-09-13T12:00:01.000Z"),
    });
    const store = new PlanStore({ plansRoot: directory });

    await store.save(plan);

    expect(await store.load(plan.planId)).toEqual(plan);
    expect(JSON.parse(readFileSync(join(directory, `${plan.planId}.json`), "utf8"))).toEqual(plan);
    await expect(store.save(plan)).rejects.toThrow("already exists");
  });
});

describe("global run lock", () => {
  test("rejects contention and releases the lock after work finishes", async () => {
    const directory = mkdtempSync(join(tmpdir(), "aibench-lock-"));
    temporaryDirectories.push(directory);
    const lockPath = join(directory, "official-run.lock");

    await withGlobalRunLock(lockPath, async () => {
      await expect(withGlobalRunLock(lockPath, async () => undefined)).rejects.toThrow(/lock/i);
    });
    await expect(withGlobalRunLock(lockPath, async () => "available")).resolves.toBe("available");
  });

  test("reclaims a stale lock but does not remove a live pid lock", async () => {
    const directory = mkdtempSync(join(tmpdir(), "aibench-lock-"));
    temporaryDirectories.push(directory);
    const stalePath = join(directory, "stale.lock");
    writeFileSync(stalePath, JSON.stringify({ pid: 999_999, createdAt: "2026-09-11T00:00:00Z" }));
    await expect(withGlobalRunLock(stalePath, async () => "reclaimed")).resolves.toBe("reclaimed");

    const livePath = join(directory, "live.lock");
    writeFileSync(livePath, JSON.stringify({ pid: process.pid, createdAt: "2026-09-11T00:00:00Z" }));
    await expect(withGlobalRunLock(livePath, async () => "never")).rejects.toThrow(/lock/i);
  });
});
