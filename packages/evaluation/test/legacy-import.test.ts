import { describe, expect, test } from "vitest";
import { buildLegacyCandidate } from "../src/index.js";

describe("legacy candidate generation", () => {
  test("keeps only source and evidence and marks every imported result unverified", () => {
    const candidate = buildLegacyCandidate("01-space-game/qwen", {
      entries: [
        { path: "app.js", classification: "source" },
        { path: "shot.png", classification: "evidence" },
        { path: "node_modules", classification: "generated" },
        { path: ".git", classification: "repositoryMetadata" },
      ],
      counts: { generated: 1, repositoryMetadata: 1, evidence: 1, source: 1, unknown: 0 },
    });
    expect(candidate).toEqual({
      source: "01-space-game/qwen",
      status: "legacy-unverified",
      includedPaths: ["app.js", "shot.png"],
      excludedPaths: [".git", "node_modules"],
      unknownMetadata: ["duration", "cost", "agentVersion"],
    });
  });
});
