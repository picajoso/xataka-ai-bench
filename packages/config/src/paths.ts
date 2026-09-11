import { existsSync, realpathSync } from "node:fs";
import { join } from "node:path";

const requiredHome = "/Volumes/MacOS_VMs/xataka-ai-bench";

export type BenchPaths = {
  repoRoot: string;
  dataRoot: string;
  runsRoot: string;
  workspaceRoot: string;
  cacheRoot: string;
  reviewRoot: string;
};

export function resolveBenchPaths(
  environment: Record<string, string | undefined> = process.env,
): BenchPaths {
  const configuredHome = environment.AIBENCH_HOME;
  if (!configuredHome) {
    throw new Error(`AIBENCH_HOME must be set to ${requiredHome}`);
  }
  if (configuredHome !== requiredHome) {
    throw new Error(`AIBENCH_HOME must point to the external SSD at ${requiredHome}`);
  }
  if (!existsSync(configuredHome) || realpathSync(configuredHome) !== requiredHome) {
    throw new Error(`External SSD benchmark root is unavailable: ${requiredHome}`);
  }

  const dataRoot = join(configuredHome, "state");
  return {
    repoRoot: join(configuredHome, "platform"),
    dataRoot,
    runsRoot: join(dataRoot, "runs"),
    workspaceRoot: join(dataRoot, "workspaces"),
    cacheRoot: join(dataRoot, "cache"),
    reviewRoot: join(dataRoot, "review"),
  };
}
