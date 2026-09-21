import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { getLocalizedSummary, getMessages, getPublicFileId, getPublicRun, getPublicRunContext, listRunsForBenchmark, listRunsForSystem, loadPublicCatalog, readPublicTextFile } from "../src/lib/content.js";
import { GET } from "../src/app/runs/[run]/files/[file]/route.js";

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));

describe("public portal content", () => {
  test("does not reference operator-console routes or private state", () => {
    const files = readdirSync("apps/web/src", { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => readFileSync(join(entry.parentPath, entry.name), "utf8"))
      .join("\n");
    expect(files).not.toContain("/api/runs");
    expect(files).not.toContain("/actions/");
    expect(files).not.toContain("/state/");
    expect(files).not.toContain("apps/console");
  });

  test("loads an empty catalog without consulting private state", async () => {
    const root = mkdtempSync(join(tmpdir(), "aibench-web-"));
    roots.push(root);

    await expect(loadPublicCatalog(root)).resolves.toEqual({ runs: [], index: { schemaVersion: "1.0.0", runs: [] } });
  });

  test("loads a validated exhibitive result and Spanish messages", async () => {
    const root = mkdtempSync(join(tmpdir(), "aibench-web-"));
    roots.push(root);
    const run = join(root, "runs", "20260913T180000Z-space-station-fps-opencode-qwen38-ninfer-medium-a1b2c3");
    mkdirSync(run, { recursive: true });
    writeFileSync(join(run, "publication.json"), JSON.stringify({
      schemaVersion: "1.0.0", runId: "20260913T180000Z-space-station-fps-opencode-qwen38-ninfer-medium-a1b2c3", publishedAt: "2026-09-13T18:00:00.000Z", official: true,
      sourceInputs: { visibility: "public", redistributable: true }, summary: { es: "Demo", en: "Demo EN" }, includedPaths: ["summary.md"], evidencePaths: [], demo: null,
      packageHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    }));

    const catalog = await loadPublicCatalog(root);

    expect(catalog.runs).toHaveLength(1);
    expect(catalog.runs[0]?.summary.es).toBe("Demo");
    expect(getLocalizedSummary(catalog.runs[0]!, "en")).toBe("Demo EN");
    expect(getMessages("es").methodology).toContain("Metodología");
    expect(getMessages("en").homeTitle).toContain("Practical");
    expect(getPublicRunContext(catalog, catalog.runs[0]!.runId)).toBeNull();
    await expect(getPublicRun(root, "20260913T180000Z-space-station-fps-opencode-qwen38-ninfer-medium-a1b2c3")).resolves.toMatchObject({ runId: "20260913T180000Z-space-station-fps-opencode-qwen38-ninfer-medium-a1b2c3" });
  });

  test("joins an explicit public index and rejects malformed catalog data", async () => {
    const root = mkdtempSync(join(tmpdir(), "aibench-web-"));
    roots.push(root);
    const runId = "20260913T180000Z-space-station-fps-opencode-qwen38-ninfer-medium-a1b2c3";
    const run = join(root, "runs", runId);
    mkdirSync(run, { recursive: true });
    writeFileSync(join(run, "publication.json"), JSON.stringify({
      schemaVersion: "1.0.0", runId, publishedAt: "2026-09-13T18:00:00.000Z", official: true,
      sourceInputs: { visibility: "public", redistributable: true }, summary: { es: "Demo", en: "Demo EN" }, includedPaths: [], evidencePaths: [], demo: null,
      packageHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    }));
    writeFileSync(join(root, "catalog.json"), JSON.stringify({
      schemaVersion: "1.0.0",
      runs: [{
        runId,
        benchmark: { slug: "space-station-fps", title: { es: "Estación", en: "Station" } },
        system: { slug: "opencode-qwen38-ninfer-medium", displayName: "OpenCode + Qwen" },
        status: "validation-failure",
        canonicalPrompt: { locale: "es", text: "Prompt" },
      }],
    }));

    const catalog = await loadPublicCatalog(root);
    expect(getPublicRunContext(catalog, runId)).toMatchObject({ status: "validation-failure" });

    writeFileSync(join(root, "catalog.json"), "{");
    await expect(loadPublicCatalog(root)).rejects.toThrow();
  });

  test("reads only declared UTF-8 files contained by the published run", async () => {
    const root = mkdtempSync(join(tmpdir(), "aibench-web-"));
    roots.push(root);
    const runId = "20260913T180000Z-space-station-fps-opencode-qwen38-ninfer-medium-a1b2c3";
    const run = join(root, "runs", runId);
    mkdirSync(join(run, "source"), { recursive: true });
    writeFileSync(join(run, "source", "index.html"), "<!doctype html><title>Inside</title>");
    writeFileSync(join(root, "private.txt"), "outside");
    symlinkSync(join(root, "private.txt"), join(run, "source", "escape.txt"));
    writeFileSync(join(run, "publication.json"), JSON.stringify({
      schemaVersion: "1.0.0", runId, publishedAt: "2026-09-13T18:00:00.000Z", official: true,
      sourceInputs: { visibility: "public", redistributable: true }, summary: { es: "Demo", en: "Demo EN" },
      includedPaths: ["source/index.html", "source/escape.txt"], evidencePaths: [], demo: null,
      packageHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    }));

    await expect(readPublicTextFile(root, runId, "source/index.html")).resolves.toContain("<!doctype");
    await expect(readPublicTextFile(root, runId, "../private.txt")).resolves.toBeNull();
    await expect(readPublicTextFile(root, runId, "raw.log")).resolves.toBeNull();
    await expect(readPublicTextFile(root, runId, "source/escape.txt")).resolves.toBeNull();
  });

  test("groups only indexed runs by benchmark and system", async () => {
    const root = mkdtempSync(join(tmpdir(), "aibench-web-"));
    roots.push(root);
    const runId = "20260913T180000Z-space-station-fps-opencode-qwen38-ninfer-medium-a1b2c3";
    const run = join(root, "runs", runId);
    mkdirSync(run, { recursive: true });
    writeFileSync(join(run, "publication.json"), JSON.stringify({
      schemaVersion: "1.0.0", runId, publishedAt: "2026-09-13T18:00:00.000Z", official: true,
      sourceInputs: { visibility: "public", redistributable: true }, summary: { es: "Demo", en: "Demo EN" }, includedPaths: [], evidencePaths: [], demo: null,
      packageHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    }));
    writeFileSync(join(root, "catalog.json"), JSON.stringify({ schemaVersion: "1.0.0", runs: [{
      runId, benchmark: { slug: "space-station-fps", title: { es: "Estación", en: "Station" } },
      system: { slug: "opencode-qwen38-ninfer-medium", displayName: "OpenCode + Qwen" }, status: "validation-failure",
      canonicalPrompt: { locale: "es", text: "Prompt" },
    }] }));
    const catalog = await loadPublicCatalog(root);

    expect(listRunsForBenchmark(catalog, "space-station-fps")).toHaveLength(1);
    expect(listRunsForSystem(catalog, "opencode-qwen38-ninfer-medium")).toHaveLength(1);
    expect(listRunsForBenchmark(catalog, "unknown")).toEqual([]);
  });

  test("serves only an allow-listed public text file", async () => {
    const root = mkdtempSync(join(tmpdir(), "aibench-web-"));
    roots.push(root);
    const runId = "20260913T180000Z-space-station-fps-opencode-qwen38-ninfer-medium-a1b2c3";
    const run = join(root, "runs", runId, "source");
    mkdirSync(run, { recursive: true });
    writeFileSync(join(run, "index.html"), "<!doctype html><title>Inside</title>");
    writeFileSync(join(root, "runs", runId, "publication.json"), JSON.stringify({
      schemaVersion: "1.0.0", runId, publishedAt: "2026-09-13T18:00:00.000Z", official: true,
      sourceInputs: { visibility: "public", redistributable: true }, summary: { es: "Demo", en: "Demo EN" }, includedPaths: ["source/index.html"], evidencePaths: [], demo: null,
      packageHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    }));
    process.env.AIBENCH_PUBLISHED_ROOT = root;

    const allowed = await GET(new Request("https://example.test"), { params: Promise.resolve({ run: runId, file: getPublicFileId("source/index.html") }) });
    const denied = await GET(new Request("https://example.test"), { params: Promise.resolve({ run: runId, file: getPublicFileId("raw.log") }) });
    expect(allowed.status).toBe(200);
    expect(allowed.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(denied.status).toBe(404);
  });
});
