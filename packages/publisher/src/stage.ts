import { access, copyFile, mkdir, rename, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { parsePublicationManifest, type PublicationManifest } from "@aibench/contracts";

export type StageApprovedCandidateInput = {
  source: string;
  publishedRoot: string;
  runId: string;
  packageHash: string;
  approvedPackageHash: string;
  includedPaths: string[];
  publication: PublicationManifest;
};

export type StagedPublication = { path: string; includedPaths: string[] };

function sourcePath(root: string, path: string): string {
  if (!path || isAbsolute(path) || path.split("/").includes("..")) throw new Error(`Invalid staged path: ${path}`);
  const resolved = resolve(root, path);
  if (relative(root, resolved).startsWith("../")) throw new Error(`Staged path escapes source: ${path}`);
  return resolved;
}

export async function stageApprovedCandidate(input: StageApprovedCandidateInput): Promise<StagedPublication> {
  if (input.packageHash !== input.approvedPackageHash) throw new Error("Approved package digest no longer matches the candidate");
  const publication = parsePublicationManifest(input.publication);
  if (publication.runId !== input.runId || publication.packageHash !== input.packageHash) throw new Error("Publication manifest does not match the approved package");
  const source = resolve(input.source);
  const destination = join(resolve(input.publishedRoot), "runs", input.runId);
  try {
    await access(destination);
    throw new Error(`Publication already exists for run ${input.runId}`);
  } catch (error) {
    if (!(error as NodeJS.ErrnoException).code || (error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const temporary = `${destination}.staging-${process.pid}`;
  const includedPaths = [...new Set(input.includedPaths)].sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right)));
  await mkdir(join(resolve(input.publishedRoot), "runs"), { recursive: true });
  await mkdir(temporary, { recursive: false });
  for (const path of includedPaths) {
    const target = join(temporary, path);
    await mkdir(resolve(target, ".."), { recursive: true });
    await copyFile(sourcePath(source, path), target);
  }
  await writeFile(join(temporary, "publication.json"), `${JSON.stringify(publication, null, 2)}\n`, { flag: "wx" });
  await rename(temporary, destination);
  return { path: destination, includedPaths };
}
