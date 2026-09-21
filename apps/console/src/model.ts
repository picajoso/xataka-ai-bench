import { RunIdSchema, type RunManifest } from "@aibench/contracts";

export type ConsoleRun = Readonly<{
  runId: string;
  benchmarkSlug: string;
  systemSlug: string;
  attemptKind: RunManifest["attempt"]["kind"];
  status: RunManifest["status"];
  createdAt: string;
  finishedAt: string | null;
  publicationStatus: RunManifest["publicationStatus"];
  failureSummary: string | null;
}>;

export function assertConsoleId(value: string, kind: "run" | "candidate"): string {
  const valid = kind === "run"
    ? RunIdSchema.safeParse(value).success
    : /^[a-z][a-z0-9-]*$/.test(value);
  if (!valid) throw new Error(`Invalid ${kind} identifier`);
  return value;
}

export function toConsoleRun(manifest: RunManifest): ConsoleRun {
  return {
    runId: manifest.runId,
    benchmarkSlug: manifest.benchmark.slug,
    systemSlug: manifest.system.slug,
    attemptKind: manifest.attempt.kind,
    status: manifest.status,
    createdAt: manifest.createdAt,
    finishedAt: manifest.finishedAt,
    publicationStatus: manifest.publicationStatus,
    failureSummary: manifest.failure === null ? null : sanitizeConsoleText(manifest.failure.summary),
  };
}

function sanitizeConsoleText(value: string): string {
  return value
    .replace(/https?:\/\/[^\s,]+/gi, "[redacted]")
    .replace(/\b(?:api[_-]?key|token|secret|password)\s*[=:]\s*\S+/gi, "[redacted]")
    .slice(0, 500);
}
