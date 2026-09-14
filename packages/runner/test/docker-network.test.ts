import { describe, expect, test } from "vitest";
import { DockerNetworkProvisioner, parsePrivateEndpoint } from "../src/index.js";

describe("per-run Docker network leases", () => {
  test("does not create any network resource for a blocked run", async () => {
    const commands: string[][] = [];
    const provisioner = new DockerNetworkProvisioner({ proxyImage: "aibench/network-proxy:1.0.0", execute: async (args) => { commands.push(args); } });

    await expect(provisioner.create({ runId: "20260914T120000Z-space-station-fps-opencode-qwen38-ninfer-medium-a1b2c3", policy: "blocked", endpoints: [] })).resolves.toBeNull();
    expect(commands).toEqual([]);
  });

  test("attaches the agent-facing proxy only to an internal per-run network and removes it first", async () => {
    const commands: string[][] = [];
    const provisioner = new DockerNetworkProvisioner({ proxyImage: "aibench/network-proxy:1.0.0", execute: async (args) => { commands.push(args); } });
    const endpoint = parsePrivateEndpoint({ alias: "inference.local", host: "192.168.1.50", port: 1234 });

    const lease = await provisioner.create({ runId: "20260914T120000Z-space-station-fps-opencode-qwen38-ninfer-medium-a1b2c3", policy: "package-registries-and-local-endpoint", endpoints: [endpoint] });
    await lease!.dispose();

    expect(commands[0]).toEqual(expect.arrayContaining(["network", "create", "--internal"]));
    expect(commands[1]).toEqual(expect.arrayContaining(["run", "-d", "--network", "bridge", "--env", "AIBENCH_PROXY_DESTINATION_HOST"]));
    expect(commands[2]).toEqual(expect.arrayContaining(["network", "connect", "--alias", "inference.local"]));
    expect(commands.at(-2)).toEqual(expect.arrayContaining(["rm", "-f"]));
    expect(commands.at(-1)).toEqual(expect.arrayContaining(["network", "rm"]));
    expect(commands.flat().join(" ")).not.toContain("192.168.1.50");
  });
});
