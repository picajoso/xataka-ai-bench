import { z } from "zod";
import {
  IsoTimestampSchema,
  RunIdSchema,
  SemVerSchema,
  Sha256Schema,
  SlugSchema,
} from "./common.js";

export const RunStatusSchema = z.enum([
  "PENDING",
  "PREFLIGHT",
  "RUNNING",
  "VALIDATING",
  "READY_FOR_REVIEW",
  "PUBLISHED",
  "FAILED",
  "TIMEOUT",
  "PARTIAL",
  "REJECTED_FOR_PUBLICATION",
  "INFRA_ERROR",
]);

const PlannedRunSchema = z.object({
  benchmarkSlug: SlugSchema,
  benchmarkVersion: SemVerSchema,
  benchmarkHash: Sha256Schema,
  systemSlug: SlugSchema,
  systemVersion: SemVerSchema,
  systemHash: Sha256Schema,
}).strict();

export const BatchPlanSchema = z.object({
  schemaVersion: SemVerSchema,
  planId: z.string().regex(/^plan-20\d{6}-[a-f0-9]{6}$/),
  createdAt: IsoTimestampSchema,
  official: z.boolean(),
  confirmedAt: IsoTimestampSchema.nullable(),
  runs: z.array(PlannedRunSchema).min(1),
}).strict().superRefine((plan, context) => {
  if (plan.official && plan.confirmedAt === null) {
    context.addIssue({
      code: "custom",
      message: "official plans require confirmation metadata",
      path: ["confirmedAt"],
    });
  }
});

export const RunManifestSchema = z.object({
  schemaVersion: SemVerSchema,
  runId: RunIdSchema,
  technicalAttemptId: z.string().regex(/^attempt-[a-z0-9]{8,}$/),
  createdAt: IsoTimestampSchema,
  benchmark: z.object({
    slug: SlugSchema,
    version: SemVerSchema,
    definitionHash: Sha256Schema,
    promptHash: Sha256Schema,
    promptLocale: z.enum(["es", "en"]),
    inputsPublic: z.boolean(),
  }).strict(),
  system: z.object({
    slug: SlugSchema,
    version: SemVerSchema,
    profileHash: Sha256Schema,
  }).strict(),
  attempt: z.object({
    kind: z.enum(["first-shot", "repair", "assisted"]),
    parentRunId: RunIdSchema.nullable(),
  }).strict(),
  executionClass: z.enum(["official-container", "experimental-native", "legacy"]),
  status: RunStatusSchema,
  startedAt: IsoTimestampSchema.nullable(),
  finishedAt: IsoTimestampSchema.nullable(),
  failure: z.object({
    classification: z.enum([
      "INFRA_ERROR",
      "MODEL_FAILURE",
      "TIMEOUT",
      "VALIDATION_FAILURE",
      "CANCELLED",
    ]),
    summary: z.string().min(1),
  }).strict().nullable(),
  publicationStatus: z.enum(["private", "review", "approved", "published", "rejected"]),
}).strict().superRefine((run, context) => {
  if (run.attempt.kind === "first-shot" && run.attempt.parentRunId !== null) {
    context.addIssue({
      code: "custom",
      message: "first-shot runs cannot have a parent run",
      path: ["attempt", "parentRunId"],
    });
  }
  if (run.attempt.kind !== "first-shot" && run.attempt.parentRunId === null) {
    context.addIssue({
      code: "custom",
      message: `${run.attempt.kind} runs require a parent first-shot run`,
      path: ["attempt", "parentRunId"],
    });
  }
});

export const RunEventSchema = z.object({
  schemaVersion: SemVerSchema,
  runId: RunIdSchema,
  sequence: z.number().int().nonnegative(),
  timestamp: IsoTimestampSchema,
  type: z.enum(["status", "agent", "tool", "process", "metric", "diagnostic", "terminal-correction"]),
  payload: z.record(z.string(), z.unknown()),
}).strict();

export type BatchPlan = z.infer<typeof BatchPlanSchema>;
export type RunManifest = z.infer<typeof RunManifestSchema>;
export type RunEvent = z.infer<typeof RunEventSchema>;

export function parseRunManifest(input: unknown): RunManifest {
  return RunManifestSchema.parse(input);
}
