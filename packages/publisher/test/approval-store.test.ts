import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { loadApprovalRecord, saveApprovalRecord } from "../src/index.js";

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));

describe("private approval records", () => {
  test("persists an approval in the candidate directory without allowing replacement", async () => {
    const root = mkdtempSync(join(tmpdir(), "aibench-approval-"));
    roots.push(root);
    const candidateRoot = join(root, "candidate-001");
    const approval = {
      candidateId: "candidate-001",
      packageHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      approvedPackageHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      reviewer: "javipas",
      approvedAt: "2026-09-14T12:00:00.000Z",
    };

    await saveApprovalRecord(candidateRoot, approval);

    await expect(loadApprovalRecord(candidateRoot)).resolves.toEqual(approval);
    await expect(saveApprovalRecord(candidateRoot, approval)).rejects.toThrow(/already exists/i);
  });
});
