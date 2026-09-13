import { cp } from "node:fs/promises";
import { hashFile, type RunManifest } from "@aibench/contracts";
import { type RunHandle, type RunStore } from "@aibench/runner";

export async function prepareRepairRun(input: {
  store: RunStore;
  parent: RunHandle;
  parentManifestPath: string;
  parentOutputPath: string;
  repairWorkspacePath: string;
}): Promise<RunHandle> {
  const parentManifest: RunManifest = input.parent.manifest;
  if (parentManifest.attempt.kind !== "first-shot") throw new Error("Only first-shot runs can be repaired");
  await cp(input.parentOutputPath, input.repairWorkspacePath, { recursive: true, errorOnExist: true });
  return input.store.createRun({
    benchmark: parentManifest.benchmark,
    system: parentManifest.system,
    attempt: { kind: "repair", parent: { runId: parentManifest.runId, attemptKind: "first-shot", manifestHash: await hashFile(input.parentManifestPath) } },
    executionClass: parentManifest.executionClass,
  });
}
