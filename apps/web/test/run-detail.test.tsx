import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, test } from "vitest";
import RunPage from "../src/app/[locale]/runs/[run]/page.js";
import { RunDemo } from "../src/components/RunDemo.js";

const roots: string[] = [];
const runId = "20260915T111513Z-space-station-fps-opencode-qwen38-ninfer-medium-2bbbf0";
const previousPublishedRoot = process.env.AIBENCH_PUBLISHED_ROOT;

afterEach(() => {
  roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true }));
  if (previousPublishedRoot === undefined) delete process.env.AIBENCH_PUBLISHED_ROOT;
  else process.env.AIBENCH_PUBLISHED_ROOT = previousPublishedRoot;
});

function writePublishedFailure(): string {
  const root = mkdtempSync(join(tmpdir(), "aibench-detail-"));
  roots.push(root);
  const run = join(root, "runs", runId);
  mkdirSync(run, { recursive: true });
  writeFileSync(join(run, "publication.json"), JSON.stringify({
    schemaVersion: "1.0.0", runId, publishedAt: "2026-09-20T16:20:00.000Z", official: true,
    sourceInputs: { visibility: "public", redistributable: true }, summary: { es: "Falló la validación.", en: "Validation failed." },
    includedPaths: ["summary.es.md"], evidencePaths: [], demo: null,
    packageHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  }));
  writeFileSync(join(run, "summary.es.md"), "# Resumen");
  writeFileSync(join(root, "catalog.json"), JSON.stringify({
    schemaVersion: "1.0.0",
    runs: [{
      runId,
      benchmark: { slug: "space-station-fps", title: { es: "Estación", en: "Station" } },
      system: { slug: "opencode-qwen38-ninfer-medium", displayName: "OpenCode + Qwen" },
      status: "validation-failure",
      canonicalPrompt: { locale: "es", text: "Prompt canónico." },
    }],
  }));
  return root;
}

describe("public run detail", () => {
  test("renders a validation failure without a score or iframe", async () => {
    process.env.AIBENCH_PUBLISHED_ROOT = writePublishedFailure();
    const page = await RunPage({ params: Promise.resolve({ locale: "es", run: runId }) });
    const html = renderToStaticMarkup(page);

    expect(html).toContain("Resultado oficial fallido");
    expect(html).toContain("Falló la validación.");
    expect(html).not.toContain("<iframe");
    expect(html).not.toContain("Puntuación");
  });

  test("sandboxes an approved static demo", () => {
    expect(renderToStaticMarkup(<RunDemo demo={{ kind: "static", path: "demo/index.html" }} />))
      .toContain('sandbox=""');
  });
});
