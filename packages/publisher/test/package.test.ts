import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { approveCandidate, buildPublicationCandidate } from "../src/index.js";

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));

function directory(): string {
  const root = mkdtempSync(join(tmpdir(), "aibench-package-"));
  roots.push(root);
  return root;
}

describe("publication candidate packaging", () => {
  test("includes only allow-listed public material and produces a stable digest", async () => {
    const root = directory();
    mkdirSync(join(root, "evidence"));
    writeFileSync(join(root, "summary.es.md"), "Resultado público\n");
    writeFileSync(join(root, "evidence", "capture.png"), "image");
    writeFileSync(join(root, "events.jsonl"), "raw private transcript");

    const candidate = await buildPublicationCandidate({
      candidateId: "candidate-001",
      root,
      allowedPaths: ["summary.es.md", "evidence/capture.png"],
    });

    expect(candidate.includedPaths).toEqual(["evidence/capture.png", "summary.es.md"]);
    expect(candidate.packageHash).toMatch(/^sha256:/);
    expect(candidate.scan.blocked).toBe(false);
  });

  test("refuses approval after the package digest changes", () => {
    const approval = approveCandidate({ candidateId: "candidate-001", packageHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", reviewer: "javipas", approvedAt: "2026-09-13T18:00:00.000Z" });

    expect(approval).toMatchObject({ candidateId: "candidate-001", reviewer: "javipas" });
    expect(() => approveCandidate({ ...approval, packageHash: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" })).toThrow(/immutable/i);
  });
});
