import { z } from "zod";
import { NetworkPolicySchema, SemVerSchema, SlugSchema } from "./common.js";

const VersionMapSchema = z.record(z.string().min(1), z.string().min(1));
const ParameterValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

export const SystemProfileSchema = z.object({
  schemaVersion: SemVerSchema,
  slug: SlugSchema,
  version: SemVerSchema,
  displayName: z.string().min(1),
  model: z.object({
    provider: z.string().min(1),
    name: z.string().min(1),
    version: z.string().min(1).nullable(),
  }).strict(),
  agent: z.object({
    name: z.string().min(1),
    version: z.string().min(1),
    executable: z.string().regex(/^[A-Za-z0-9._-]+$/),
  }).strict(),
  backend: z.object({
    kind: z.enum(["cloud", "local"]),
    provider: z.string().min(1),
    name: z.string().min(1),
    endpointDescription: z.string().min(1).refine(
      (value) => !value.includes("://"),
      "describe endpoints without recording a URL",
    ).nullable(),
  }).strict(),
  hardware: z.object({
    controller: z.string().min(1),
    inference: z.string().min(1).nullable(),
  }).strict(),
  software: z.object({
    os: z.string().min(1),
    versions: VersionMapSchema,
  }).strict(),
  inference: z.object({
    reasoning: z.enum(["off", "low", "medium", "high", "max", "unknown"]),
    quantization: z.string().min(1).nullable(),
    parameters: z.record(z.string().min(1), ParameterValueSchema),
  }).strict(),
  permissions: z.object({
    networkPolicy: NetworkPolicySchema,
    tools: z.array(z.string().min(1)),
  }).strict(),
  credentials: z.object({
    environmentVariables: z.array(z.string().regex(/^[A-Z][A-Z0-9_]*$/)),
  }).strict(),
}).strict();

export type SystemProfile = z.infer<typeof SystemProfileSchema>;

export function parseSystemProfile(input: unknown): SystemProfile {
  return SystemProfileSchema.parse(input);
}
