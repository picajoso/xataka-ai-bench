import { z } from "zod";
import { EvaluationTypeSchema } from "./benchmark.js";
import {
  BilingualTextSchema,
  IsoTimestampSchema,
  RelativePathSchema,
  RunIdSchema,
  SemVerSchema,
  Sha256Schema,
  SlugSchema,
} from "./common.js";

const ObjectiveResultSchema = z.object({
  validatorId: SlugSchema,
  validatorVersion: SemVerSchema,
  status: z.enum(["pass", "fail", "warning", "skipped", "unavailable", "timed-out", "error"]),
  method: z.object({
    kind: z.enum(["command", "file", "json", "browser", "custom"]),
    detail: z.string().min(1),
  }).strict(),
  startedAt: IsoTimestampSchema,
  finishedAt: IsoTimestampSchema,
  observations: z.array(z.string()),
  rawOutputRef: RelativePathSchema.nullable(),
  publicSummary: BilingualTextSchema,
}).strict();

const EvidenceSchema = z.object({
  id: SlugSchema,
  kind: z.enum(["screenshot", "video", "file", "report", "demo"]),
  path: RelativePathSchema,
  sha256: Sha256Schema,
  public: z.boolean(),
}).strict();

export const EvaluationReportSchema = z.object({
  schemaVersion: SemVerSchema,
  runId: RunIdSchema,
  evaluationType: EvaluationTypeSchema,
  createdAt: IsoTimestampSchema,
  objectiveResults: z.array(ObjectiveResultSchema),
  evidence: z.array(EvidenceSchema),
  editorialNotes: z.array(BilingualTextSchema),
  publicationReadiness: z.enum(["not-eligible", "needs-review", "ready", "blocked"]),
  score: z.object({
    value: z.number(),
    minimum: z.number(),
    maximum: z.number(),
    method: z.string().min(1),
  }).strict().superRefine((score, context) => {
    if (score.minimum >= score.maximum) {
      context.addIssue({ code: "custom", message: "score minimum must be lower than maximum", path: ["minimum"] });
    }
    if (score.value < score.minimum || score.value > score.maximum) {
      context.addIssue({ code: "custom", message: "score value must be within its declared range", path: ["value"] });
    }
  }).optional(),
}).strict();

export type EvaluationReport = z.infer<typeof EvaluationReportSchema>;

export function parseEvaluationReport(input: unknown): EvaluationReport {
  return EvaluationReportSchema.parse(input);
}
