import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, test } from "vitest";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const script = resolve(repositoryRoot, "scripts/verify-storage.sh");
const archiveScript = resolve(repositoryRoot, "scripts/archive-legacy.sh");
const temporaryDirectories: string[] = [];

type FixtureEnvironment = Record<string, string> & {
  AIBENCH_DF_OUTPUT_FILE: string;
  AIBENCH_DISKUTIL_OUTPUT_FILE: string;
  AIBENCH_MIN_AVAILABLE_BYTES: string;
  AIBENCH_REQUIRED_PREFIX: string;
  BENCH_ROOT: string;
};

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function fixture(overrides: {
  availableKilobytes?: number;
  diskInfo?: string;
  mountPoint?: string;
  rootExists?: boolean;
} = {}): FixtureEnvironment {
  const base = realpathSync(mkdtempSync(join(tmpdir(), "aibench-storage-")));
  temporaryDirectories.push(base);
  const benchRoot = join(base, "xataka-ai-bench");
  if (overrides.rootExists !== false) mkdirSync(benchRoot);

  const mountPoint = overrides.mountPoint ?? base;
  const dfPath = join(base, "df.txt");
  const diskInfoPath = join(base, "diskutil.txt");
  writeFileSync(
    dfPath,
    [
      "Filesystem 1024-blocks Used Available Capacity Mounted on",
      `/dev/disk-test 10000000 100 ${overrides.availableKilobytes ?? 9000000} 1% ${mountPoint}`,
    ].join("\n"),
  );
  writeFileSync(
    diskInfoPath,
    overrides.diskInfo ?? [
      "   File System Personality:   APFS",
      "   Read-Only Volume:          No",
      "   Owners:                    Disabled",
      "   Encrypted:                 No",
      "   Protocol:                  USB",
    ].join("\n"),
  );

  return {
    AIBENCH_DF_OUTPUT_FILE: dfPath,
    AIBENCH_DISKUTIL_OUTPUT_FILE: diskInfoPath,
    AIBENCH_MIN_AVAILABLE_BYTES: "1048576",
    AIBENCH_REQUIRED_PREFIX: `${base}/`,
    BENCH_ROOT: benchRoot,
  };
}

function verify(environment: Record<string, string>, fixtureMode = true) {
  try {
    const stdout = execFileSync("sh", fixtureMode ? [script, "--test-fixtures"] : [script], {
      cwd: repositoryRoot,
      encoding: "utf8",
      env: { ...process.env, ...environment },
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { status: 0, output: stdout };
  } catch (error) {
    const failure = error as { status?: number; stderr?: string };
    return { status: failure.status ?? 1, output: failure.stderr ?? "" };
  }
}

describe("verify-storage.sh", () => {
  test("accepts a mounted, writable APFS volume with enough space", () => {
    const result = verify(fixture());
    expect(result.status).toBe(0);
    expect(result.output).toContain("storage_status=ok");
    expect(result.output).toContain("filesystem=APFS");
  });

  test("rejects a missing benchmark root", () => {
    const result = verify(fixture({ rootExists: false }));
    expect(result.status).not.toBe(0);
    expect(result.output).toContain("does not exist");
  });

  test("rejects a read-only volume", () => {
    const result = verify(fixture({
      diskInfo: [
        "   File System Personality:   APFS",
        "   Read-Only Volume:          Yes",
      ].join("\n"),
    }));
    expect(result.status).not.toBe(0);
    expect(result.output).toContain("read-only");
  });

  test("rejects a root resolved on another mount", () => {
    const environment = fixture({ mountPoint: "/" });
    const result = verify(environment);
    expect(result.status).not.toBe(0);
    expect(result.output).toContain("unexpected mount");
  });

  test("rejects insufficient free space", () => {
    const result = verify(fixture({ availableKilobytes: 1 }));
    expect(result.status).not.toBe(0);
    expect(result.output).toContain("insufficient space");
  });

  test("does not honor fixture overrides in production mode", () => {
    const result = verify(fixture(), false);
    expect(result.status).not.toBe(0);
    expect(result.output).toContain("required prefix");
  });

  test.skipIf(process.platform !== "darwin")("archives files, symlinks, empty directories and metadata without deleting the source", () => {
    const environment = fixture();
    const source = join(environment.AIBENCH_REQUIRED_PREFIX, "legacy-source");
    mkdirSync(join(source, "empty"), { recursive: true });
    writeFileSync(join(source, "data.txt"), "legacy\n");
    symlinkSync("data.txt", join(source, "data-link"));
    environment.AIBENCH_LEGACY_SOURCE = source;

    execFileSync("sh", [archiveScript, "--test-fixtures"], {
      cwd: repositoryRoot,
      encoding: "utf8",
      env: { ...process.env, ...environment },
    });

    const report = JSON.parse(readFileSync(
      join(environment.BENCH_ROOT, "legacy/inventory.json"),
      "utf8",
    )) as Record<string, unknown>;
    expect(report).toMatchObject({
      verified: true,
      sourceStable: true,
      metadataVerified: true,
      extendedAttributesVerified: true,
      aclVerified: true,
      sourceRemoved: false,
    });
  });
});
