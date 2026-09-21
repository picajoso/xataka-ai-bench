import { z } from "zod";
import { BilingualTextSchema, RunIdSchema, SemVerSchema, SlugSchema } from "./common.js";

export const PublicRunContextSchema = z.object({
  runId: RunIdSchema,
  benchmark: z.object({
    slug: SlugSchema,
    title: BilingualTextSchema,
  }).strict(),
  system: z.object({
    slug: SlugSchema,
    displayName: z.string().min(1),
  }).strict(),
  status: z.enum(["completed", "validation-failure", "infra-error", "incomplete", "legacy-unverified"]),
  canonicalPrompt: z.object({
    locale: z.enum(["es", "en"]),
    text: z.string().min(1),
  }).strict(),
}).strict();

export type PublicRunContext = z.infer<typeof PublicRunContextSchema>;

export const PublicCatalogIndexSchema = z.object({
  schemaVersion: SemVerSchema,
  runs: z.array(PublicRunContextSchema),
}).strict().superRefine((catalog, context) => {
  const seen = new Set<string>();
  for (const [index, run] of catalog.runs.entries()) {
    if (seen.has(run.runId)) {
      context.addIssue({
        code: "custom",
        message: "expected each public catalog runId to be unique",
        path: ["runs", index, "runId"],
      });
    }
    seen.add(run.runId);
  }
});

export type PublicCatalogIndex = z.infer<typeof PublicCatalogIndexSchema>;

export function parsePublicCatalogIndex(input: unknown): PublicCatalogIndex {
  return PublicCatalogIndexSchema.parse(input);
}
