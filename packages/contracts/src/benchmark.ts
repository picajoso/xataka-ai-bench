import { z } from "zod";
import {
  BilingualTextSchema,
  NetworkPolicySchema,
  RelativePathSchema,
  SemVerSchema,
  Sha256Schema,
  SlugSchema,
} from "./common.js";

const PromptSchema = z.object({
  locale: z.enum(["es", "en"]),
  path: RelativePathSchema,
  sha256: Sha256Schema,
}).strict();

const FixtureSchema = z.object({
  path: RelativePathSchema,
  sha256: Sha256Schema,
  mediaType: z.string().min(1),
}).strict();

export const EvaluationTypeSchema = z.enum(["verifiable", "mixed", "exhibitive"]);

export const BenchmarkDefinitionSchema = z.object({
  schemaVersion: SemVerSchema,
  slug: SlugSchema,
  version: SemVerSchema,
  state: z.enum(["draft", "active", "retired"]),
  category: SlugSchema,
  title: BilingualTextSchema,
  prompts: z.object({
    canonical: PromptSchema,
    translations: z.array(PromptSchema),
  }).strict(),
  network: z.object({
    policy: NetworkPolicySchema,
    allowedHosts: z.array(z.string().min(1)),
  }).strict(),
  limits: z.object({
    firstShotSeconds: z.number().int().positive(),
    repairSeconds: z.number().int().positive(),
  }).strict(),
  evaluation: z.object({
    type: EvaluationTypeSchema,
    validators: z.array(SlugSchema),
  }).strict(),
  inputs: z.object({
    visibility: z.enum(["public", "private"]),
    redistributable: z.boolean(),
    fixtures: z.array(FixtureSchema),
  }).strict(),
  capture: z.object({
    mode: z.enum(["none", "desktop"]),
  }).strict(),
  publication: z.object({
    eligible: z.boolean(),
  }).strict(),
}).strict().superRefine((benchmark, context) => {
  const canonical = benchmark.prompts.canonical;
  for (const translation of benchmark.prompts.translations) {
    if (translation.locale === canonical.locale) {
      context.addIssue({
        code: "custom",
        message: "translation locale must differ from canonical locale",
        path: ["prompts", "translations"],
      });
    }
    if (translation.sha256 === canonical.sha256) {
      context.addIssue({
        code: "custom",
        message: "translation cannot claim the canonical hash",
        path: ["prompts", "translations"],
      });
    }
  }

  if (benchmark.network.policy === "blocked" && benchmark.network.allowedHosts.length > 0) {
    context.addIssue({
      code: "custom",
      message: "blocked network policy cannot allow hosts",
      path: ["network", "allowedHosts"],
    });
  }

  if (benchmark.publication.eligible &&
      (benchmark.inputs.visibility !== "public" || !benchmark.inputs.redistributable)) {
    context.addIssue({
      code: "custom",
      message: "publication eligibility requires public, redistributable inputs",
      path: ["publication", "eligible"],
    });
  }
});

export type BenchmarkDefinition = z.infer<typeof BenchmarkDefinitionSchema>;

export function parseBenchmark(input: unknown): BenchmarkDefinition {
  return BenchmarkDefinitionSchema.parse(input);
}
