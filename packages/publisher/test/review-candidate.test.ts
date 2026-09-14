import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { buildReviewedCandidate, loadReviewCandidate } from "../src/index.js";

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));

const runId = "20260914T120000Z-space-station-fps-opencode-qwen38-ninfer-medium-a1b2c3";
const packageHash = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function reviewRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "aibench-review-"));
  roots.push(root);
  return root;
}

function writeCandidate(root: string, candidateId = "candidate-001"): void {
  const candidateRoot = join(root, "candidates", candidateId);
  mkdirSync(join(candidateRoot, "package"), { recursive: true });
  writeFileSync(join(candidateRoot, "package", "summary.md"), "Resultado público\n");
  writeFileSync(join(candidateRoot, "candidate.json"), `${JSON.stringify({
    schemaVersion: "1.0.0",
    candidateId,
    runId,
    allowedPaths: ["summary.md"],
    publication: {
      schemaVersion: "1.0.0",
      runId,
      publishedAt: "2026-09-14T12:00:00.000Z",
      official: true,
      sourceInputs: { visibility: "public", redistributable: true },
      summary: { es: "Resultado de prueba", en: "Test result" },
      includedPaths: ["summary.md"],
      evidencePaths: [],
      demo: null,
      packageHash,
    },
  }, null, 2)}\n`);
}

describe("private review candidates", () => {
  test("loads a candidate only from its private candidate directory", async () => {
    const root = reviewRoot();
    writeCandidate(root);

    const candidate = await loadReviewCandidate(root, "candidate-001");

    expect(candidate).toMatchObject({ candidateId: "candidate-001", runId, allowedPaths: ["summary.md"] });
    expect(candidate.packageRoot).toBe(join(root, "candidates", "candidate-001", "package"));
  });

  test("rejects identifiers that could escape the private review root", async () => {
    await expect(loadReviewCandidate(reviewRoot(), "../candidate-001")).rejects.toThrow(/invalid candidate/i);
  });

  test("accepts a package only when its declared digest still matches", async () => {
    const root = reviewRoot();
    writeCandidate(root);

    await expect(buildReviewedCandidate(root, "candidate-001")).rejects.toThrow(/digest/i);
  });
});
