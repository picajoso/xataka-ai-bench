import { describe, expect, test } from "vitest";
import { createNetworkEvidence, parsePrivateEndpoint } from "../src/index.js";

describe("official network contracts", () => {
  test("creates safe, stable evidence for a single private endpoint", () => {
    const endpoint = parsePrivateEndpoint({ alias: "inference.local", host: "192.168.1.50", port: 1234 });

    const first = createNetworkEvidence({ policy: "package-registries-and-local-endpoint", endpoint, proxyVersion: "1.0.0" });
    const second = createNetworkEvidence({ policy: "package-registries-and-local-endpoint", endpoint, proxyVersion: "1.0.0" });

    expect(first).toEqual(second);
    expect(first).toEqual({ proxyVersion: "1.0.0", allowListHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/) });
    expect(JSON.stringify(first)).not.toContain("192.168.1.50");
  });

  test("rejects URL-shaped hosts and aliases outside the synthetic namespace", () => {
    expect(() => parsePrivateEndpoint({ alias: "lmstudio.local", host: "http://192.168.1.50", port: 1234 })).toThrow(/host/i);
    expect(() => parsePrivateEndpoint({ alias: "inference.example.com", host: "192.168.1.50", port: 1234 })).toThrow(/alias/i);
  });
});
