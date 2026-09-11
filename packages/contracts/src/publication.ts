import { z } from "zod";
import {
  BilingualTextSchema,
  IsoTimestampSchema,
  RelativePathSchema,
  RunIdSchema,
  SemVerSchema,
  Sha256Schema,
} from "./common.js";

const DemoSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("static"),
    path: RelativePathSchema,
  }).strict(),
  z.object({
    kind: z.literal("external"),
    url: z.url(),
  }).strict(),
]);

export const PublicationManifestSchema = z.object({
  schemaVersion: SemVerSchema,
  runId: RunIdSchema,
  publishedAt: IsoTimestampSchema,
  official: z.boolean(),
  sourceInputs: z.object({
    visibility: z.enum(["public", "private"]),
    redistributable: z.boolean(),
  }).strict(),
  summary: BilingualTextSchema,
  includedPaths: z.array(RelativePathSchema),
  evidencePaths: z.array(RelativePathSchema),
  demo: DemoSchema.nullable(),
  packageHash: Sha256Schema,
}).strict().superRefine((publication, context) => {
  if (publication.official &&
      (publication.sourceInputs.visibility !== "public" || !publication.sourceInputs.redistributable)) {
    context.addIssue({
      code: "custom",
      message: "official publication requires public, redistributable inputs",
      path: ["sourceInputs"],
    });
  }
});

export type PublicationManifest = z.infer<typeof PublicationManifestSchema>;

export function parsePublicationManifest(input: unknown): PublicationManifest {
  return PublicationManifestSchema.parse(input);
}
