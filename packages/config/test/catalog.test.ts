import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { stringify } from "yaml";
import { afterEach, describe, expect, test } from "vitest";
import { hashDirectory, hashFile } from "../../contracts/src/hash.js";
import { loadBenchmark } from "../src/catalog.js";
import { parseStorageIdentity, resolveBenchPaths } from "../src/paths.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "aibench-catalog-"));
  temporaryDirectories.push(directory);
  return directory;
}

describe("canonical hashing", () => {
  test("normalizes text line endings but preserves binary bytes", async () => {
    const root = temporaryDirectory();
    const lf = join(root, "lf.txt");
    const crlf = join(root, "crlf.txt");
    const binaryA = join(root, "a.bin");
    const binaryB = join(root, "b.bin");
    writeFileSync(lf, "one\ntwo\n");
    writeFileSync(crlf, "one\r\ntwo\r\n");
    writeFileSync(binaryA, Buffer.from([0, 13, 10, 255]));
    writeFileSync(binaryB, Buffer.from([0, 10, 255]));

    await expect(hashFile(lf)).resolves.toBe(await hashFile(crlf));
    await expect(hashFile(binaryA)).resolves.not.toBe(await hashFile(binaryB));
  });

  test("hashes directory entries in stable path order", async () => {
    const first = temporaryDirectory();
    const second = temporaryDirectory();
    mkdirSync(join(first, "nested"));
    mkdirSync(join(second, "nested"));
    writeFileSync(join(first, "z.txt"), "z\n");
    writeFileSync(join(first, "nested/a.txt"), "a\n");
    writeFileSync(join(second, "nested/a.txt"), "a\r\n");
    writeFileSync(join(second, "z.txt"), "z\r\n");

    await expect(hashDirectory(first)).resolves.toBe(await hashDirectory(second));
  });

  test("refuses symlinks that resolve outside the hashed directory", async () => {
    const root = temporaryDirectory();
    const outside = join(temporaryDirectory(), "private.txt");
    writeFileSync(outside, "private");
    symlinkSync(outside, join(root, "escape.txt"));
    await expect(hashDirectory(root)).rejects.toThrow(/outside/i);
  });

  test("rejects invalid UTF-8 in declared text and normalizes common source formats", async () => {
    const root = temporaryDirectory();
    const invalid = join(root, "invalid.txt");
    const lf = join(root, "script-lf.py");
    const crlf = join(root, "script-crlf.py");
    const readmeLf = join(root, "README");
    const readmeCrlf = join(root, "COPYING");
    const binaryLf = join(root, "lf.bin");
    const binaryCrlf = join(root, "crlf.bin");
    const ambiguousCr = join(root, "cr.dat");
    const ambiguousLf = join(root, "lf.dat");
    writeFileSync(invalid, Buffer.from([0x80]));
    writeFileSync(lf, "print('ok')\n");
    writeFileSync(crlf, "print('ok')\r\n");
    writeFileSync(readmeLf, "plain text\n");
    writeFileSync(readmeCrlf, "plain text\r\n");
    writeFileSync(binaryLf, Buffer.from("binary\n"));
    writeFileSync(binaryCrlf, Buffer.from("binary\r\n"));
    writeFileSync(ambiguousCr, Buffer.from("A\rB"));
    writeFileSync(ambiguousLf, Buffer.from("A\nB"));
    await expect(hashFile(invalid)).rejects.toThrow(/UTF-8/i);
    await expect(hashFile(lf)).resolves.toBe(await hashFile(crlf));
    await expect(hashFile(readmeLf)).resolves.toBe(await hashFile(readmeCrlf));
    await expect(hashFile(binaryLf)).resolves.not.toBe(await hashFile(binaryCrlf));
    await expect(hashFile(ambiguousCr)).resolves.not.toBe(await hashFile(ambiguousLf));
  });
});

describe("benchmark catalog", () => {
  test("loads YAML, validates paths and verifies separate prompt hashes", async () => {
    const root = temporaryDirectory();
    const canonicalPath = join(root, "prompt.es.md");
    const translationPath = join(root, "prompt.en.md");
    writeFileSync(canonicalPath, "Devuelve hola.\n");
    writeFileSync(translationPath, "Return hello.\n");
    const canonicalHash = await hashFile(canonicalPath);
    const translationHash = await hashFile(translationPath);
    writeFileSync(join(root, "benchmark.yaml"), stringify({
      schemaVersion: "1.0.0",
      slug: "hello-world",
      version: "1.0.0",
      state: "draft",
      category: "coding",
      title: { es: "Hola", en: "Hello" },
      prompts: {
        canonical: { locale: "es", path: "prompt.es.md", sha256: canonicalHash },
        translations: [{ locale: "en", path: "prompt.en.md", sha256: translationHash }],
      },
      network: { policy: "blocked", allowedHosts: [] },
      limits: { firstShotSeconds: 1800, repairSeconds: 900 },
      evaluation: { type: "exhibitive", validators: [] },
      inputs: { visibility: "public", redistributable: true, fixtures: [] },
      capture: { mode: "none" },
      publication: { eligible: false },
    }));

    const loaded = await loadBenchmark(join(root, "benchmark.yaml"));
    expect(loaded.definition.slug).toBe("hello-world");
    expect(loaded.promptHashes).toEqual({ es: canonicalHash, en: translationHash });
  });

  test("rejects a prompt path escaping the benchmark directory", async () => {
    const root = temporaryDirectory();
    writeFileSync(join(root, "benchmark.yaml"), stringify({
      schemaVersion: "1.0.0",
      slug: "escape-test",
      version: "1.0.0",
      state: "draft",
      category: "coding",
      title: { es: "Escape", en: "Escape" },
      prompts: {
        canonical: {
          locale: "es",
          path: "../outside.md",
          sha256: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        },
        translations: [],
      },
      network: { policy: "blocked", allowedHosts: [] },
      limits: { firstShotSeconds: 1800, repairSeconds: 900 },
      evaluation: { type: "exhibitive", validators: [] },
      inputs: { visibility: "public", redistributable: true, fixtures: [] },
      capture: { mode: "none" },
      publication: { eligible: false },
    }));
    await expect(loadBenchmark(join(root, "benchmark.yaml"))).rejects.toThrow();
  });

  test("rejects a benchmark manifest symlink escaping its lexical directory", async () => {
    const root = temporaryDirectory();
    const outside = temporaryDirectory();
    writeFileSync(join(outside, "benchmark.yaml"), "schemaVersion: 1.0.0\n");
    symlinkSync(join(outside, "benchmark.yaml"), join(root, "benchmark.yaml"));
    await expect(loadBenchmark(join(root, "benchmark.yaml"))).rejects.toThrow(/escapes/i);
  });

  test("resolves public and private roots only from the required external home", () => {
    const paths = resolveBenchPaths({ AIBENCH_HOME: "/Volumes/MacOS_VMs/xataka-ai-bench" });
    expect(paths.repoRoot).toBe("/Volumes/MacOS_VMs/xataka-ai-bench/platform");
    expect(paths.runsRoot).toBe("/Volumes/MacOS_VMs/xataka-ai-bench/state/runs");
    expect(() => resolveBenchPaths({})).toThrow(/AIBENCH_HOME/);
    expect(() => resolveBenchPaths({ AIBENCH_HOME: resolve("/") })).toThrow(/external SSD/i);
  });

  test("requires mounted, writable APFS disk identity", () => {
    expect(parseStorageIdentity([
      "Mounted: Yes",
      "Mount Point: /Volumes/MacOS_VMs",
      "File System Personality: APFS",
      "Volume Read-Only: No",
    ].join("\n"))).toEqual({ mounted: true, mountPoint: "/Volumes/MacOS_VMs", filesystem: "APFS", readOnly: false });
    expect(() => parseStorageIdentity([
      "Mounted: No",
      "Mount Point: Not applicable (no file system)",
      "File System Personality: APFS",
      "Volume Read-Only: No",
    ].join("\n"))).toThrow(/mounted/i);
    expect(() => parseStorageIdentity([
      "Mounted: Yes",
      "Mount Point: /Volumes/MacOS_VMs",
      "File System Personality: Mac OS Extended",
      "Volume Read-Only: No",
    ].join("\n"))).toThrow(/APFS/i);
    expect(() => parseStorageIdentity([
      "Mounted: Yes",
      "Mount Point: /Volumes/MacOS_VMs",
      "File System Personality: APFS",
      "Volume Read-Only: Yes",
    ].join("\n"))).toThrow(/read-only/i);
  });

  test("keeps the internal smoke benchmark valid but non-public", async () => {
    const repositoryRoot = resolve(import.meta.dirname, "../../..");
    const loaded = await loadBenchmark(resolve(repositoryRoot, "examples/smoke-benchmark/benchmark.yaml"));
    expect(loaded.definition.slug).toBe("smoke-benchmark");
    expect(loaded.definition.inputs.visibility).toBe("private");
    expect(loaded.definition.publication.eligible).toBe(false);
  });
});
