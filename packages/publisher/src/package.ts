import { createHash } from "node:crypto";
import { access } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { hashFile } from "@aibench/contracts";
import { scanCandidate } from "./scanner/index.js";
import type { ScanReport } from "./scanner/types.js";

export type PublicationCandidate = {
  candidateId: string;
  includedPaths: string[];
  packageHash: string;
  scan: ScanReport;
};

export type BuildPublicationCandidateInput = {
  candidateId: string;
  root: string;
  allowedPaths: string[];
};

function assertAllowedPath(root: string, path: string): string {
  if (!path || isAbsolute(path) || path.split("/").includes("..")) throw new Error(`Invalid allow-listed path: ${path}`);
  const absolute = resolve(root, path);
  const fromRoot = relative(root, absolute);
  if (!fromRoot || fromRoot.startsWith("../") || isAbsolute(fromRoot)) throw new Error(`Allow-listed path escapes candidate: ${path}`);
  return absolute;
}

export async function buildPublicationCandidate(input: BuildPublicationCandidateInput): Promise<PublicationCandidate> {
  const root = resolve(input.root);
  const includedPaths = [...new Set(input.allowedPaths)].sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right)));
  const hashes: string[] = [];
  for (const path of includedPaths) {
    const absolute = assertAllowedPath(root, path);
    await access(absolute);
    hashes.push(`${path}\0${await hashFile(absolute)}`);
  }
  const scan = await scanCandidate(root);
  if (scan.blocked) throw new Error("Publication candidate contains blocked material");
  return {
    candidateId: input.candidateId,
    includedPaths,
    packageHash: `sha256:${createHash("sha256").update(hashes.join("\n")).digest("hex")}`,
    scan,
  };
}
