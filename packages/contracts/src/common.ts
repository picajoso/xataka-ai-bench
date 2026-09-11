import { z } from "zod";

export const SemVerSchema = z.string().regex(
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/,
  "expected a semantic version",
);

export const SlugSchema = z.string().regex(
  /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
  "expected a lowercase kebab-case slug",
);

export const Sha256Schema = z.string().regex(
  /^sha256:[a-f0-9]{64}$/,
  "expected a sha256-prefixed lowercase digest",
);

export const IsoTimestampSchema = z.iso.datetime({ offset: true });

export const RelativePathSchema = z.string().min(1).refine((value) => {
  if (value.startsWith("/") || value.includes("\\") || value.includes("\0")) return false;
  const segments = value.split("/");
  return segments.every((segment) => segment !== "" && segment !== "." && segment !== "..");
}, "expected a canonical relative POSIX path without traversal");

export const BilingualTextSchema = z.object({
  es: z.string().min(1),
  en: z.string().min(1),
}).strict();

export const NetworkPolicySchema = z.enum([
  "blocked",
  "package-registries",
  "package-registries-and-local-endpoint",
  "custom",
]);

export const RunIdSchema = z.string().regex(
  /^20\d{6}T\d{6}Z-[a-z0-9]+(?:-[a-z0-9]+)*-[a-f0-9]{6}$/,
  "expected a sortable UTC run id with a random suffix",
);
