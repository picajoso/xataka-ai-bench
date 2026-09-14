import { describe, expect, test } from "vitest";
import { validateOpenCodeConfigModel, validateOpenCodeIdentity, validatePrivateOpenCodeConfig } from "../src/opencode-config.js";

const valid = JSON.stringify({
  provider: {
    ninfer: {
      options: { baseURL: "http://inference.local:8080/v1", apiKey: "{env:NINFER_API_KEY}" },
    },
  },
});

describe("private OpenCode configuration", () => {
  test("accepts the isolated endpoint and environment credential reference", () => {
    expect(validatePrivateOpenCodeConfig(valid)).toBeUndefined();
  });

  test.each([
    ["http://192.168.1.50:8080/v1", /inference\.local/],
    ["https://inference.local:8080/v1", /http/],
    ["http://inference.local:1234/v1", /8080/],
  ])("rejects an unsafe baseURL %s", (baseURL, message) => {
    expect(() => validatePrivateOpenCodeConfig(valid.replace("http://inference.local:8080/v1", baseURL))).toThrow(message);
  });

  test("rejects a missing baseURL and a literal credential", () => {
    expect(() => validatePrivateOpenCodeConfig(JSON.stringify({ provider: { ninfer: { options: { apiKey: "{env:NINFER_API_KEY}" } } } }))).toThrow(/baseURL/);
    expect(() => validatePrivateOpenCodeConfig(valid.replace("{env:NINFER_API_KEY}", "literal-secret"))).toThrow(/apiKey/);
  });
});

describe("OpenCode execution identity", () => {
  const system = { inference: { parameters: { opencodeModel: "ninfer/qwen3.8-27b-nvfp4" }, reasoning: "medium" as const } };
  const profile = { model: "ninfer/qwen3.8-27b-nvfp4", variant: "medium" };

  test("accepts a public slug identity matched by model and reasoning variant", () => {
    expect(validateOpenCodeIdentity(profile, system)).toBeUndefined();
  });

  test("rejects a divergent private model", () => {
    expect(() => validateOpenCodeIdentity({ ...profile, model: "ninfer/other-model" }, system)).toThrow(/model/i);
  });

  test("rejects a public system without an OpenCode model declaration", () => {
    expect(() => validateOpenCodeIdentity(profile, { inference: { parameters: {}, reasoning: "unknown" } })).toThrow(/opencodeModel/);
  });

  test("rejects a divergent or absent private variant", () => {
    expect(() => validateOpenCodeIdentity({ ...profile, variant: "off" }, system)).toThrow(/variant/i);
    expect(() => validateOpenCodeIdentity({ ...profile, variant: null }, system)).toThrow(/variant/i);
  });
});

describe("OpenCode config model identity", () => {
  const configWithPlaceholderModel = JSON.stringify({
    provider: {
      ninfer: {
        options: { baseURL: "http://inference.local:8080/v1", apiKey: "{env:NINFER_API_KEY}" },
        models: { "replace-with-model-id": {} },
      },
    },
  });

  test("requires the private config to expose the exact selected provider/model", () => {
    expect(() => validateOpenCodeConfigModel("ninfer/qwen3.8-27b-nvfp4", configWithPlaceholderModel)).toThrow(/model/i);
    expect(validateOpenCodeConfigModel("ninfer/qwen3.8-27b-nvfp4", configWithPlaceholderModel.replace("replace-with-model-id", "qwen3.8-27b-nvfp4"))).toBeUndefined();
  });
});
