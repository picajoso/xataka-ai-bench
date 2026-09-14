import { describe, expect, test } from "vitest";
import { parsePrivateEndpoint, verifyNetworkIsolation } from "../src/index.js";

describe("official network preflight", () => {
  test("records only safe evidence when the proxy alias works and the forbidden control fails", async () => {
    const commands: string[][] = [];
    const evidence = await verifyNetworkIsolation({
      policy: "package-registries-and-local-endpoint",
      endpoints: [parsePrivateEndpoint({ alias: "inference.local", host: "192.168.1.50", port: 1234 })],
      proxyVersion: "1.0.0",
      execute: async function* (command) {
        commands.push(command.args);
        yield { type: "exit", exitCode: commands.length === 1 ? 0 : 1 };
      },
    });

    expect(evidence).toMatchObject({ proxyVersion: "1.0.0", allowListHash: expect.stringMatching(/^sha256:/) });
    expect(JSON.stringify(evidence)).not.toContain("192.168.1.50");
    expect(commands).toHaveLength(2);
    expect(commands.flat().join(" ")).toContain("inference.local");
    expect(commands.flat().join(" ")).toContain("aibench-control.invalid");
  });

  test("rejects a preflight when a forbidden hostname can be reached", async () => {
    await expect(verifyNetworkIsolation({
      policy: "package-registries-and-local-endpoint",
      endpoints: [parsePrivateEndpoint({ alias: "inference.local", host: "192.168.1.50", port: 1234 })],
      proxyVersion: "1.0.0",
      execute: async function* () { yield { type: "exit", exitCode: 0 }; },
    })).rejects.toThrow(/forbidden/i);
  });
});
