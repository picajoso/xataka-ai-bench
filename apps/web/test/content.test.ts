import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { getLocalizedSummary, getMessages, getPublicRun, getPublicRunContext, loadPublicCatalog } from "../src/lib/content.js";

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));

describe("public portal content", () => {
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
});
