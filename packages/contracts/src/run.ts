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
    parent: z.object({
      runId: RunIdSchema,
      attemptKind: z.literal("first-shot"),
      manifestHash: Sha256Schema,
    }).strict().nullable(),
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
  if (run.attempt.kind === "first-shot" && run.attempt.parent !== null) {
    context.addIssue({
      code: "custom",
      message: "first-shot runs cannot have a parent run",
      path: ["attempt", "parent"],
    });
  }
  if (run.attempt.kind !== "first-shot" && run.attempt.parent === null) {
    context.addIssue({
      code: "custom",
      message: `${run.attempt.kind} runs require a parent first-shot run`,
      path: ["attempt", "parent"],
    });
  }

  const terminalStatuses = new Set([
    "READY_FOR_REVIEW", "PUBLISHED", "FAILED", "TIMEOUT", "PARTIAL",
    "REJECTED_FOR_PUBLICATION", "INFRA_ERROR",
  ]);
  const failureStatuses = new Set(["FAILED", "TIMEOUT", "PARTIAL", "INFRA_ERROR"]);
  if (run.status === "PENDING" && run.startedAt !== null) {
    context.addIssue({ code: "custom", message: "pending runs cannot be started", path: ["startedAt"] });
  }
  if (run.status !== "PENDING" && run.startedAt === null) {
    context.addIssue({ code: "custom", message: "started runs require startedAt", path: ["startedAt"] });
  }
  if (terminalStatuses.has(run.status) !== (run.finishedAt !== null)) {
    context.addIssue({
      code: "custom",
      message: terminalStatuses.has(run.status) ? "terminal runs require finishedAt" : "active runs cannot have finishedAt",
      path: ["finishedAt"],
    });
  }
  if (failureStatuses.has(run.status) !== (run.failure !== null)) {
    context.addIssue({
      code: "custom",
      message: failureStatuses.has(run.status) ? "failure status requires classification" : "non-failure status cannot include failure",
      path: ["failure"],
    });
  }
  if (run.status === "INFRA_ERROR" && run.failure?.classification !== "INFRA_ERROR") {
    context.addIssue({ code: "custom", message: "infrastructure status requires INFRA_ERROR classification", path: ["failure"] });
  }
  if (run.status === "TIMEOUT" && run.failure?.classification !== "TIMEOUT") {
    context.addIssue({ code: "custom", message: "timeout status requires TIMEOUT classification", path: ["failure"] });
  }
  if ((run.status === "PUBLISHED") !== (run.publicationStatus === "published")) {
    context.addIssue({ code: "custom", message: "run and publication status disagree", path: ["publicationStatus"] });
  }
  if ((run.status === "REJECTED_FOR_PUBLICATION") !== (run.publicationStatus === "rejected")) {
    context.addIssue({ code: "custom", message: "publication rejection statuses disagree", path: ["publicationStatus"] });
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
