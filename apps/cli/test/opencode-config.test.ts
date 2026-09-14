import { describe, expect, test } from "vitest";
import { validatePrivateOpenCodeConfig } from "../src/opencode-config.js";

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
