import { execFileSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { join } from "node:path";

const requiredHome = "/Volumes/MacOS_VMs/xataka-ai-bench";
const requiredMount = "/Volumes/MacOS_VMs";

export type BenchPaths = {
  repoRoot: string;
  dataRoot: string;
  plansRoot: string;
  runsRoot: string;
  workspaceRoot: string;
  cacheRoot: string;
  reviewRoot: string;
};

export type StorageIdentity = {
  mounted: true;
  mountPoint: string;
  filesystem: "APFS";
  readOnly: false;
};

function diskInfoField(output: string, label: string): string | undefined {
  const line = output.split("\n").find((candidate) => candidate.trimStart().startsWith(`${label}:`));
  return line?.slice(line.indexOf(":") + 1).trim();
}

export function parseStorageIdentity(output: string): StorageIdentity {
  const mounted = diskInfoField(output, "Mounted") === "Yes";
  const mountPoint = diskInfoField(output, "Mount Point");
  const filesystem = diskInfoField(output, "File System Personality");
  const readOnly = diskInfoField(output, "Volume Read-Only") === "Yes";
  if (!mounted) throw new Error("External SSD is not mounted");
  if (mountPoint !== "/Volumes/MacOS_VMs") {
    throw new Error(`Unexpected external SSD mount point: ${mountPoint ?? "unknown"}`);
  }
  if (filesystem !== "APFS") throw new Error(`External SSD must use APFS, found: ${filesystem ?? "unknown"}`);
  if (readOnly) throw new Error("External SSD is read-only");
  return { mounted: true, mountPoint, filesystem: "APFS", readOnly: false };
}

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
  if (!existsSync(configuredHome)) {
    throw new Error(`External SSD benchmark root is unavailable: ${requiredHome}`);
  }
  let diskInfo: string;
  try {
    diskInfo = execFileSync("/usr/sbin/diskutil", ["info", requiredMount], { encoding: "utf8" });
  } catch {
    throw new Error(`Cannot verify external SSD identity: ${requiredHome}`);
  }
  parseStorageIdentity(diskInfo);
  if (realpathSync(configuredHome) !== requiredHome) {
    throw new Error(`External SSD benchmark root resolves unexpectedly: ${requiredHome}`);
  }

  const dataRoot = join(configuredHome, "state");
  return {
    repoRoot: join(configuredHome, "platform"),
    dataRoot,
    plansRoot: join(dataRoot, "plans"),
    runsRoot: join(dataRoot, "runs"),
    workspaceRoot: join(dataRoot, "workspaces"),
    cacheRoot: join(dataRoot, "cache"),
    reviewRoot: join(dataRoot, "review"),
  };
}
