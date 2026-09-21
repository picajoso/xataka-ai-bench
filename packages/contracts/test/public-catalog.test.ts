import { describe, expect, test } from "vitest";
import { parsePublicCatalogIndex } from "../src/index.js";

const runId = "20260915T111513Z-space-station-fps-opencode-qwen38-ninfer-medium-2bbbf0";

describe("public catalog index", () => {
  test("accepts a context only for a run present in the public catalog", () => {
    expect(() => parsePublicCatalogIndex({
      schemaVersion: "1.0.0",
      runs: [{
        runId,
        benchmark: { slug: "space-station-fps", title: { es: "Estación espacial", en: "Space station" } },
        system: { slug: "opencode-qwen38-ninfer-medium", displayName: "OpenCode + Qwen" },
        status: "validation-failure",
        canonicalPrompt: { locale: "es", text: "Prompt público." },
      }],
    })).not.toThrow();
  });

  test("rejects duplicate run identities and path-like slugs", () => {
    const context = {
      runId,
      benchmark: { slug: "space-station-fps", title: { es: "Estación espacial", en: "Space station" } },
      system: { slug: "opencode-qwen38-ninfer-medium", displayName: "OpenCode + Qwen" },
      status: "validation-failure",
      canonicalPrompt: { locale: "es", text: "Prompt público." },
    };

    expect(() => parsePublicCatalogIndex({ schemaVersion: "1.0.0", runs: [context, context] })).toThrow();
    expect(() => parsePublicCatalogIndex({
      schemaVersion: "1.0.0",
      runs: [{ ...context, benchmark: { ...context.benchmark, slug: "../outside" } }],
    })).toThrow();
  });
});
