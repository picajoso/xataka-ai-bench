import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { stageApprovedCandidate } from "../src/index.js";

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));

describe("publication staging", () => {
  test("stages only an approved immutable package under its run identifier", async () => {
    const root = mkdtempSync(join(tmpdir(), "aibench-stage-"));
    roots.push(root);
    const source = join(root, "candidate");
    const published = join(root, "published");
    writeFileSync(join(root, "placeholder"), "");
    await import("node:fs/promises").then(({ mkdir }) => mkdir(source, { recursive: true }));
    writeFileSync(join(source, "summary.md"), "public summary\n");
    writeFileSync(join(source, "raw.jsonl"), "private log\n");

    const staged = await stageApprovedCandidate({
      source,
      publishedRoot: published,
      runId: "20260913T180000Z-space-station-fps-opencode-qwen38-ninfer-medium-a1b2c3",
      packageHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      approvedPackageHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      includedPaths: ["summary.md"],
      publication: {
        schemaVersion: "1.0.0", runId: "20260913T180000Z-space-station-fps-opencode-qwen38-ninfer-medium-a1b2c3", publishedAt: "2026-09-13T18:00:00.000Z", official: true,
        sourceInputs: { visibility: "public", redistributable: true }, summary: { es: "Resultado sintético", en: "Synthetic result" },
        includedPaths: ["summary.md"], evidencePaths: [], demo: null, packageHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      },
    });

    expect(staged.path).toBe(join(published, "runs", "20260913T180000Z-space-station-fps-opencode-qwen38-ninfer-medium-a1b2c3"));
    expect(readFileSync(join(staged.path, "summary.md"), "utf8")).toBe("public summary\n");
    expect(existsSync(join(staged.path, "raw.jsonl"))).toBe(false);
    expect(JSON.parse(readFileSync(join(staged.path, "publication.json"), "utf8"))).toMatchObject({ runId: "20260913T180000Z-space-station-fps-opencode-qwen38-ninfer-medium-a1b2c3" });
  });

  test("refuses a changed or duplicate package", async () => {
    const root = mkdtempSync(join(tmpdir(), "aibench-stage-"));
    roots.push(root);
    await expect(stageApprovedCandidate({
      source: root, publishedRoot: join(root, "published"), runId: "20260913T180000000Z-space-station-fps-opencode-qwen38-ninfer-medium-a1b2c3",
      packageHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      approvedPackageHash: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", includedPaths: [], publication: {} as never,
    })).rejects.toThrow(/digest/i);
  });
});
