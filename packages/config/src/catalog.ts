import { readFile, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { hashFile, parseBenchmark, type BenchmarkDefinition } from "@aibench/contracts";
import { parse } from "yaml";

export type LoadedBenchmark = {
  definition: BenchmarkDefinition;
  directory: string;
  definitionHash: string;
  promptHashes: Record<string, string>;
};

function assertContained(root: string, candidate: string): void {
  const pathFromRoot = relative(root, candidate);
  if (pathFromRoot === ".." || pathFromRoot.startsWith("../") || isAbsolute(pathFromRoot)) {
    throw new Error(`Benchmark path escapes its directory: ${candidate}`);
  }
}

export async function loadBenchmark(manifestPath: string): Promise<LoadedBenchmark> {
  const absoluteManifestPath = await realpath(resolve(manifestPath));
  const directory = dirname(absoluteManifestPath);
  assertContained(directory, absoluteManifestPath);
  const definition = parseBenchmark(parse(await readFile(absoluteManifestPath, "utf8")));

  const promptHashes: Record<string, string> = {};
  const prompts = [definition.prompts.canonical, ...definition.prompts.translations];
  for (const prompt of prompts) {
    const declaredPath = resolve(directory, prompt.path);
    assertContained(directory, declaredPath);
    const physicalPath = await realpath(declaredPath);
    assertContained(directory, physicalPath);
    const actualHash = await hashFile(physicalPath);
    if (actualHash !== prompt.sha256) {
      throw new Error(`Prompt hash mismatch for ${prompt.path}`);
    }
    if (promptHashes[prompt.locale]) {
      throw new Error(`Duplicate prompt locale: ${prompt.locale}`);
    }
    promptHashes[prompt.locale] = actualHash;
  }

  for (const fixture of definition.inputs.fixtures) {
    const declaredPath = resolve(directory, fixture.path);
    assertContained(directory, declaredPath);
    const physicalPath = await realpath(declaredPath);
    assertContained(directory, physicalPath);
    if (await hashFile(physicalPath) !== fixture.sha256) {
      throw new Error(`Fixture hash mismatch for ${fixture.path}`);
    }
  }

  return {
    definition,
    directory,
    definitionHash: await hashFile(absoluteManifestPath),
    promptHashes,
  };
}
