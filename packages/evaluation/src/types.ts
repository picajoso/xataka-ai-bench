export type ValidatorStatus = "passed" | "failed" | "warning" | "skipped" | "unavailable" | "timed-out" | "errored";

export type ValidationResult = {
  validator: { id: string; version: string; method: string };
  status: ValidatorStatus;
  startedAt: string;
  finishedAt: string;
  observations: readonly string[];
  privateRawOutputRef: string | null;
  publicSummary: string;
};

export type Evidence = {
  kind: "screenshot" | "video" | "artifact" | "log";
  privateRef: string;
  publicRef: string | null;
  sha256: string;
  capturedAt: string;
  description: string;
};

export type EvaluationContext = { runId: string; outputPath: string };

export interface Validator {
  run(context: EvaluationContext): Promise<ValidationResult>;
}

export interface EvidenceCollector {
  collect(context: EvaluationContext): Promise<Evidence[]>;
}
