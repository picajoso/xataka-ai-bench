import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parsePublicationManifest, type PublicationManifest } from "@aibench/contracts";
import { buildPublicationCandidate, type PublicationCandidate } from "./package.js";

export type ReviewCandidate = {
  schemaVersion: "1.0.0";
  candidateId: string;
  runId: string;
  allowedPaths: string[];
  publication: PublicationManifest;
  packageRoot: string;
};

type CandidateFile = Omit<ReviewCandidate, "packageRoot">;

function assertCandidateId(candidateId: string): void {
  if (!/^[a-z][a-z0-9-]*$/.test(candidateId)) {
    throw new Error("Invalid candidate identifier");
  }
}

function parseCandidateFile(input: unknown, candidateId: string): CandidateFile {
  if (!input || typeof input !== "object") throw new Error("Invalid review candidate record");
  const record = input as Record<string, unknown>;
  if (record.schemaVersion !== "1.0.0" || record.candidateId !== candidateId || typeof record.runId !== "string") {
    throw new Error("Invalid review candidate record");
  }
  if (!Array.isArray(record.allowedPaths) || !record.allowedPaths.every((path) => typeof path === "string" && path.length > 0)) {
    throw new Error("Invalid review candidate allow list");
  }
  const publication = parsePublicationManifest(record.publication);
  if (publication.runId !== record.runId) throw new Error("Review candidate run identifier does not match its publication manifest");
  return {
    schemaVersion: "1.0.0",
    candidateId,
    runId: record.runId,
    allowedPaths: record.allowedPaths,
    publication,
  };
}

/** Loads private review metadata; the package itself remains under state/review. */
export async function loadReviewCandidate(reviewRoot: string, candidateId: string): Promise<ReviewCandidate> {
  assertCandidateId(candidateId);
  const candidateRoot = join(resolve(reviewRoot), "candidates", candidateId);
  const contents = await readFile(join(candidateRoot, "candidate.json"), "utf8");
  const candidate = parseCandidateFile(JSON.parse(contents), candidateId);
  return { ...candidate, packageRoot: join(candidateRoot, "package") };
}

export type ReviewedCandidate = {
  record: ReviewCandidate;
  candidate: PublicationCandidate;
};

/** Rebuilds the allowed package and proves it still matches the review record. */
export async function buildReviewedCandidate(reviewRoot: string, candidateId: string): Promise<ReviewedCandidate> {
  const record = await loadReviewCandidate(reviewRoot, candidateId);
  const candidate = await buildPublicationCandidate({
    candidateId: record.candidateId,
    root: record.packageRoot,
    allowedPaths: record.allowedPaths,
  });
  if (candidate.packageHash !== record.publication.packageHash) {
    throw new Error("Review candidate package digest does not match its publication manifest");
  }
  return { record, candidate };
}
