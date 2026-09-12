import { type BatchPlan } from "@aibench/contracts";
import { type RandomBytes } from "./ids.js";

export type PlanBenchmark = {
  slug: string;
  version: string;
  hash: string;
};

export type PlanSystem = {
  slug: string;
  version: string;
  hash: string;
};

export type PlannerOptions = {
  createdAt: Date;
  randomBytes: RandomBytes;
  official: boolean;
  confirmedAt?: Date;
  exclude?: Array<{ benchmarkSlug: string; systemSlug: string }>;
};

function dateStamp(date: Date): string {
  const pad = (value: number) => value.toString().padStart(2, "0");
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}`;
}

export function createBatchPlan(
  benchmarks: PlanBenchmark[],
  systems: PlanSystem[],
  options: PlannerOptions,
): BatchPlan {
  if (options.official && !options.confirmedAt) {
    throw new Error("Official plans require confirmation metadata");
  }
  const exclusions = new Set((options.exclude ?? []).map((entry) => `${entry.benchmarkSlug}/${entry.systemSlug}`));
  const runs = [...benchmarks]
    .sort((left, right) => left.slug.localeCompare(right.slug))
    .flatMap((benchmark) => [...systems]
      .sort((left, right) => left.slug.localeCompare(right.slug))
      .filter((system) => !exclusions.has(`${benchmark.slug}/${system.slug}`))
      .map((system) => ({
        benchmarkSlug: benchmark.slug,
        benchmarkVersion: benchmark.version,
        benchmarkHash: benchmark.hash,
        systemSlug: system.slug,
        systemVersion: system.version,
        systemHash: system.hash,
      })));

  return {
    schemaVersion: "1.0.0",
    planId: `plan-${dateStamp(options.createdAt)}-${options.randomBytes(3).toString("hex")}`,
    createdAt: options.createdAt.toISOString(),
    official: options.official,
    confirmedAt: options.confirmedAt?.toISOString() ?? null,
    runs,
  };
}
