import { createHash } from "node:crypto";
import type { BenchmarkDefinition } from "@aibench/contracts";
import type { PrivateEndpoint } from "./types.js";

export type DockerCommandExecutor = (args: string[], environment?: Record<string, string>) => Promise<void>;

export type NetworkLease = {
  agentNetwork: string;
  dispose(): Promise<void>;
};

export type NetworkProvisioningInput = {
  runId: string;
  policy: BenchmarkDefinition["network"]["policy"];
  endpoints: PrivateEndpoint[];
};

export type DockerNetworkProvisionerOptions = {
  proxyImage: string;
  execute: DockerCommandExecutor;
};

export interface NetworkProvisioner {
  create(input: NetworkProvisioningInput): Promise<NetworkLease | null>;
}

function runToken(runId: string): string {
  return createHash("sha256").update(runId).digest("hex").slice(0, 12);
}

function assertEndpoints(input: NetworkProvisioningInput): void {
  if (input.policy === "blocked") return;
  if (input.policy === "custom") throw new Error("Custom network policies are not available for official runs");
  if (input.endpoints.length === 0) throw new Error("An outbound network policy requires one or more private endpoints");
  if (["local-endpoint", "package-registries-and-local-endpoint"].includes(input.policy) && input.endpoints.length !== 1) {
    throw new Error("The local-endpoint policy requires exactly one private endpoint");
  }
}

export class DockerNetworkProvisioner implements NetworkProvisioner {
  readonly #proxyImage: string;
  readonly #execute: DockerCommandExecutor;

  constructor(options: DockerNetworkProvisionerOptions) {
    this.#proxyImage = options.proxyImage;
    this.#execute = options.execute;
  }

  async create(input: NetworkProvisioningInput): Promise<NetworkLease | null> {
    assertEndpoints(input);
    if (input.policy === "blocked") return null;

    const token = runToken(input.runId);
    const agentNetwork = `aibench-run-${token}`;
    const proxyNames = input.endpoints.map((_, index) => `aibench-proxy-${token}-${index + 1}`);
    await this.#execute(["network", "create", "--internal", agentNetwork]);
    try {
      for (const [index, endpoint] of input.endpoints.entries()) {
        const proxyName = proxyNames[index]!;
        await this.#execute([
          "run", "-d", "--rm", "--name", proxyName,
          "--network", "bridge",
          "--env", "AIBENCH_PROXY_DESTINATION_HOST",
          "--env", "AIBENCH_PROXY_DESTINATION_PORT",
          this.#proxyImage,
        ], {
          AIBENCH_PROXY_DESTINATION_HOST: endpoint.host,
          AIBENCH_PROXY_DESTINATION_PORT: String(endpoint.port),
        });
        await this.#execute(["network", "connect", "--alias", endpoint.alias, agentNetwork, proxyName]);
      }
    } catch (error) {
      await this.#dispose(proxyNames, agentNetwork);
      throw error;
    }

    let disposed = false;
    return {
      agentNetwork,
      dispose: async () => {
        if (disposed) return;
        disposed = true;
        await this.#dispose(proxyNames, agentNetwork);
      },
    };
  }

  async #dispose(proxyNames: string[], agentNetwork: string): Promise<void> {
    await Promise.all(proxyNames.map(async (proxyName) => this.#execute(["rm", "-f", proxyName]).catch(() => undefined)));
    await this.#execute(["network", "rm", agentNetwork]).catch(() => undefined);
  }
}
