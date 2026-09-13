import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { RunStore } from "@aibench/runner";
import { prepareRepairRun } from "../src/index.js";

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));

describe("repair lineage", () => {
  test("creates a distinct repair attempt linked to the immutable first-shot and copies its output", async () => {
    const root = mkdtempSync(join(tmpdir(), "aibench-repair-")); roots.push(root);
    let nonce = 0;
    const store = new RunStore({ runsRoot: join(root, "runs"), clock: () => new Date("2026-09-13T18:10:00.000Z"), randomBytes: (size) => Buffer.alloc(size, ++nonce) });
    mkdirSync(join(root, "runs"));
    const parent = await store.createRun({ benchmark: { slug: "space-station-fps", version: "1.0.0", definitionHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", promptHash: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", promptLocale: "es", inputsPublic: true }, system: { slug: "opencode-qwen38-ninfer-medium", version: "1.0.0", profileHash: "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc" }, attempt: { kind: "first-shot", parent: null }, executionClass: "official-container" });
    const output = join(root, "output"); mkdirSync(output); writeFileSync(join(output, "result.txt"), "first result");
    const repair = await prepareRepairRun({ store, parent, parentManifestPath: join(parent.directory, "manifest.json"), parentOutputPath: output, repairWorkspacePath: join(root, "repair-workspace") });
    expect(repair.manifest.attempt).toMatchObject({ kind: "repair", parent: { runId: parent.runId, attemptKind: "first-shot" } });
    expect(readFileSync(join(root, "repair-workspace", "result.txt"), "utf8")).toBe("first result");
  });
});
