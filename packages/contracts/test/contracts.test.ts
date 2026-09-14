import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";
import { describe, expect, test } from "vitest";
import {
  BatchPlanSchema,
  RunEventSchema,
  parseBenchmark,
  parseEvaluationReport,
  parsePublicationManifest,
  parseRunManifest,
  parseSystemProfile,
} from "../src/index.js";

const fixtures = resolve(import.meta.dirname, "fixtures");

function yamlFixture(name: string): unknown {
  return parse(readFileSync(resolve(fixtures, name), "utf8"));
}

function jsonFixture(name: string): unknown {
  return JSON.parse(readFileSync(resolve(fixtures, name), "utf8"));
}

describe("core contracts", () => {
  test("accepts a local-endpoint-only network policy", () => {
    const benchmark = yamlFixture("benchmark.valid.yaml") as Record<string, unknown>;
    const network = benchmark.network as Record<string, unknown>;
    expect(parseBenchmark({ ...benchmark, network: { ...network, policy: "local-endpoint" } }).network.policy).toBe("local-endpoint");
  });

  test("accepts representative benchmark, system, run, evaluation and publication records", () => {
    expect(parseBenchmark(yamlFixture("benchmark.valid.yaml")).slug).toBe("smoke-text");
    expect(parseSystemProfile(yamlFixture("system.valid.yaml")).agent.name).toBe("OpenCode");
    expect(parseRunManifest(jsonFixture("run.valid.json")).status).toBe("READY_FOR_REVIEW");
    expect(parseEvaluationReport(jsonFixture("evaluation.valid.json")).score).toBeUndefined();
    expect(parsePublicationManifest(jsonFixture("publication.valid.json")).official).toBe(true);
  });

  test("rejects invalid semantic versions, slugs, prompt paths and unknown keys", () => {
    const benchmark = yamlFixture("benchmark.valid.yaml") as Record<string, unknown>;
    expect(() => parseBenchmark({ ...benchmark, version: "latest" })).toThrow();
    expect(() => parseBenchmark({ ...benchmark, slug: "Smoke Test" })).toThrow();
    const prompts = benchmark.prompts as { canonical: Record<string, unknown>; translations: unknown[] };
    expect(() => parseBenchmark({
      ...benchmark,
      prompts: { ...prompts, canonical: { ...prompts.canonical, path: "../prompt.md" } },
    })).toThrow();
    expect(() => parseBenchmark({ ...benchmark, surprise: true })).toThrow();
  });

  test("requires explicit network, time-budget, evaluation and public-input declarations", () => {
    const benchmark = yamlFixture("benchmark.valid.yaml") as Record<string, unknown>;
    for (const field of ["network", "limits", "evaluation", "inputs"]) {
      const incomplete = { ...benchmark };
      delete incomplete[field];
      expect(() => parseBenchmark(incomplete)).toThrow();
    }
  });

  test("separates translated prompts from the canonical prompt hash", () => {
    const benchmark = yamlFixture("benchmark.valid.yaml") as Record<string, unknown>;
    const prompts = benchmark.prompts as {
      canonical: { sha256: string };
      translations: Array<Record<string, unknown>>;
    };
    expect(() => parseBenchmark({
      ...benchmark,
      prompts: {
        ...prompts,
        translations: [{ ...prompts.translations[0], sha256: prompts.canonical.sha256 }],
      },
    })).toThrow(/canonical hash/i);
  });

  test("requires agent/backend identity and environment-variable names instead of secret values", () => {
    const system = yamlFixture("system.valid.yaml") as Record<string, unknown>;
    const agent = system.agent as Record<string, unknown>;
    expect(() => parseSystemProfile({ ...system, agent: { ...agent, version: "" } })).toThrow();
    const credentials = system.credentials as Record<string, unknown>;
    expect(() => parseSystemProfile({
      ...system,
      credentials: { ...credentials, environmentVariables: ["sk-secret-value"] },
    })).toThrow();
  });

  test("accepts the documented OpenCode local and historical system profiles", () => {
    const repositoryRoot = resolve(import.meta.dirname, "../../..");
    for (const slug of [
      "opencode-qwen38-lmstudio-max",
      "opencode-qwen38-ninfer-off",
      "opencode-qwen38-ninfer-medium",
      "opencode-glm53-oxalpha",
      "codex-gpt56-sol-agentrouter",
    ]) {
      const profile = parse(readFileSync(resolve(repositoryRoot, `systems/${slug}/system.yaml`), "utf8"));
      expect(parseSystemProfile(profile).slug).toBe(slug);
    }
  });

  test("records the nInfer medium model identifier served by the local endpoint", () => {
    const repositoryRoot = resolve(import.meta.dirname, "../../..");
    const profile = parseSystemProfile(parse(readFileSync(resolve(repositoryRoot, "systems/opencode-qwen38-ninfer-medium/system.yaml"), "utf8")));
    expect(profile.version).toBe("1.1.0");
    expect(profile.inference.parameters.opencodeModel).toBe("ninfer/qwen3.8-27b");
  });

  test("requires immutable sortable run and technical-attempt identifiers", () => {
    const run = jsonFixture("run.valid.json") as Record<string, unknown>;
    expect(() => parseRunManifest({ ...run, runId: "run-1" })).toThrow();
    expect(() => parseRunManifest({ ...run, technicalAttemptId: "1" })).toThrow();
  });

  test("requires a parent for repair and forbids one for first-shot", () => {
    const run = jsonFixture("run.valid.json") as Record<string, unknown>;
    expect(() => parseRunManifest({ ...run, attempt: { kind: "repair", parent: null } })).toThrow();
    expect(() => parseRunManifest({
      ...run,
      attempt: {
        kind: "first-shot",
        parent: {
          runId: "20260911T140000Z-parent-system-a1b2c3",
          attemptKind: "first-shot",
          manifestHash: "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
        },
      },
    })).toThrow();
    expect(() => parseRunManifest({
      ...run,
      attempt: {
        kind: "repair",
        parent: {
          runId: "20260911T140000Z-parent-system-a1b2c3",
          attemptKind: "repair",
          manifestHash: "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
        },
      },
    })).toThrow();
    expect(parseRunManifest({
      ...run,
      attempt: {
        kind: "repair",
        parent: {
          runId: "20260911T140000Z-parent-system-a1b2c3",
          attemptKind: "first-shot",
          manifestHash: "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
        },
      },
    }).attempt.kind).toBe("repair");
  });

  test("enforces status-dependent failure, timing and publication invariants", () => {
    const run = jsonFixture("run.valid.json") as Record<string, unknown>;
    expect(() => parseRunManifest({ ...run, status: "FAILED", failure: null })).toThrow();
    expect(() => parseRunManifest({
      ...run,
      status: "FAILED",
      failure: { classification: "TIMEOUT", summary: "wrong state" },
    })).toThrow();
    expect(() => parseRunManifest({ ...run, status: "RUNNING", finishedAt: "2026-09-11T14:49:10Z" })).toThrow();
    expect(() => parseRunManifest({ ...run, status: "PUBLISHED", publicationStatus: "private" })).toThrow();
    expect(() => parseRunManifest({
      ...run,
      createdAt: "2026-09-11T14:45:00Z",
      startedAt: "2026-09-11T14:50:00Z",
      finishedAt: "2026-09-11T14:49:10Z",
    })).toThrow();
  });

  test("rejects invalid numeric score ranges", () => {
    const evaluation = jsonFixture("evaluation.valid.json") as Record<string, unknown>;
    expect(() => parseEvaluationReport({
      ...evaluation,
      score: { value: 11, minimum: 0, maximum: 10, method: "objective checks" },
    })).toThrow();
    expect(() => parseEvaluationReport({
      ...evaluation,
      score: { value: 5, minimum: 10, maximum: 0, method: "objective checks" },
    })).toThrow();
  });

  test("rejects official publication of private or non-redistributable inputs", () => {
    const publication = jsonFixture("publication.valid.json") as Record<string, unknown>;
    expect(() => parsePublicationManifest({
      ...publication,
      sourceInputs: { visibility: "private", redistributable: false },
    })).toThrow(/official publication/i);
  });

  test("validates batch plans and append-only run events", () => {
    expect(BatchPlanSchema.parse({
      schemaVersion: "1.0.0",
      planId: "plan-20260911-a1b2c3",
      createdAt: "2026-09-11T14:00:00Z",
      official: true,
      confirmedAt: "2026-09-11T14:01:00Z",
      runs: [{
        benchmarkSlug: "smoke-text",
        benchmarkVersion: "1.0.0",
        benchmarkHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        systemSlug: "opencode-qwen38-ninfer-medium",
        systemVersion: "1.0.0",
        systemHash: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      }],
    }).runs).toHaveLength(1);

    expect(RunEventSchema.parse({
      schemaVersion: "1.0.0",
      runId: "20260911T144500Z-smoke-text-opencode-qwen38-a1b2c3",
      sequence: 1,
      timestamp: "2026-09-11T14:45:02Z",
      type: "status",
      payload: { status: "RUNNING" },
    }).sequence).toBe(1);
  });
});
