import { randomBytes } from "node:crypto";

export type RandomBytes = (size: number) => Buffer;

function utcStamp(now: Date): string {
  const pad = (value: number) => value.toString().padStart(2, "0");
  return [
    now.getUTCFullYear().toString(),
    pad(now.getUTCMonth() + 1),
    pad(now.getUTCDate()),
  ].join("") + "T" + [pad(now.getUTCHours()), pad(now.getUTCMinutes()), pad(now.getUTCSeconds())].join("") + "Z";
}

export function createRunId(now: Date, benchmarkSlug: string, systemSlug: string, random: RandomBytes = randomBytes): string {
  return `${utcStamp(now)}-${benchmarkSlug}-${systemSlug}-${random(3).toString("hex")}`;
}

export function createTechnicalAttemptId(random: RandomBytes = randomBytes): string {
  return `attempt-${random(6).toString("hex")}`;
}
