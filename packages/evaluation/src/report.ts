import { type Evidence, type ValidationResult } from "./types.js";

export type EvaluationReport = {
  runId: string;
  evaluationType: "verifiable" | "mixed" | "exhibitive";
  objectiveResults: ValidationResult[];
  evidence: Evidence[];
  score: null;
  editorialNotes: string[];
  publicationReadiness: "review-required";
};

export function buildEvaluationReport(input: {
  runId: string;
  evaluationType: EvaluationReport["evaluationType"];
  results: ValidationResult[];
  evidence: Evidence[];
}): EvaluationReport {
  return {
    runId: input.runId,
    evaluationType: input.evaluationType,
    objectiveResults: [...input.results],
    evidence: [...input.evidence],
    score: null,
    editorialNotes: [],
    publicationReadiness: "review-required",
  };
}
