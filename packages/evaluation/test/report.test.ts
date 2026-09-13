import { describe, expect, test } from "vitest";
import { buildEvaluationReport, type ValidationResult } from "../src/index.js";

const base = {
  validator: { id: "files-required", version: "1.0.0", method: "filesystem" },
  startedAt: "2026-09-13T12:00:00.000Z",
  finishedAt: "2026-09-13T12:00:01.000Z",
  observations: ["Checked the declared output directory"],
  privateRawOutputRef: "private://runs/run-1/validators/files-required.log",
  publicSummary: "Required output file is present.",
} as const;

describe("evaluation reports", () => {
  test("preserves every objective validator outcome without synthesizing a score", () => {
    const results: ValidationResult[] = [
      { ...base, status: "passed" },
      { ...base, validator: { ...base.validator, id: "command" }, status: "failed", publicSummary: "Command exited with status 1." },
      { ...base, validator: { ...base.validator, id: "lint" }, status: "warning" },
      { ...base, validator: { ...base.validator, id: "optional" }, status: "skipped" },
      { ...base, validator: { ...base.validator, id: "browser" }, status: "unavailable" },
      { ...base, validator: { ...base.validator, id: "timeout" }, status: "timed-out" },
      { ...base, validator: { ...base.validator, id: "error" }, status: "errored" },
    ];

    const report = buildEvaluationReport({ runId: "run-1", evaluationType: "exhibitive", results, evidence: [] });

    expect(report.objectiveResults.map((result) => result.status)).toEqual([
      "passed", "failed", "warning", "skipped", "unavailable", "timed-out", "errored",
    ]);
    expect(report.score).toBeNull();
    expect(report.editorialNotes).toEqual([]);
    expect(report.publicationReadiness).toBe("review-required");
  });
});
