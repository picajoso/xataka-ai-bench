import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { inventoryLegacyTree } from "../src/index.js";

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));

describe("legacy inventory", () => {
  test("classifies generated files, evidence, repository metadata, source and unknown files without reading them", async () => {
    const root = mkdtempSync(join(tmpdir(), "aibench-legacy-"));
    roots.push(root);
    mkdirSync(join(root, "node_modules", "library"), { recursive: true });
    mkdirSync(join(root, ".git"), { recursive: true });
    mkdirSync(join(root, "shots"), { recursive: true });
    writeFileSync(join(root, "node_modules", "library", "index.js"), "generated");
    writeFileSync(join(root, ".git", "HEAD"), "metadata");
    writeFileSync(join(root, "shots", "frame.png"), "png");
    writeFileSync(join(root, "RESULTS.md"), "report");
    writeFileSync(join(root, "app.js"), "source");
    writeFileSync(join(root, "mystery.dat"), "unknown");

    const report = await inventoryLegacyTree(root);

    expect(report.counts).toEqual({ generated: 1, repositoryMetadata: 1, evidence: 2, source: 1, unknown: 1 });
    expect(report.entries.map((entry) => `${entry.path}:${entry.classification}`)).toEqual([
      ".git/HEAD:repositoryMetadata", "RESULTS.md:evidence", "app.js:source", "mystery.dat:unknown", "node_modules/library/index.js:generated", "shots/frame.png:evidence",
    ]);
  });
});
