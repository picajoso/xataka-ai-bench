import type { ProcessCommand, ProcessEvent, NetworkPolicy } from "../isolation/types.js";
import { createNetworkEvidence, type NetworkEvidence, type PrivateEndpoint } from "./types.js";

const proxyPort = 8080;
const forbiddenHost = "aibench-control.invalid";

export type NetworkPreflightInput = {
  policy: NetworkPolicy;
  endpoints: PrivateEndpoint[];
  proxyVersion: string;
  execute(command: ProcessCommand): AsyncIterable<ProcessEvent>;
};

function probeCommand(host: string): ProcessCommand {
  return {
    executable: "node",
    args: ["-e", "const net=require('node:net');const s=net.connect({host:process.argv[1],port:Number(process.argv[2])});s.setTimeout(3000);s.once('connect',()=>process.exit(0));s.once('error',()=>process.exit(1));s.once('timeout',()=>process.exit(1));", host, String(proxyPort)],
  };
}

async function exitCode(execute: NetworkPreflightInput["execute"], command: ProcessCommand): Promise<number | null> {
  let result: number | null | undefined;
  for await (const event of execute(command)) {
    if (event.type === "exit") result = event.exitCode;
  }
  return result ?? null;
}

export async function verifyNetworkIsolation(input: NetworkPreflightInput): Promise<NetworkEvidence> {
  if (input.policy === "blocked") return createNetworkEvidence({ policy: "blocked", proxyVersion: input.proxyVersion });
  if (input.endpoints.length === 0) throw new Error("Network preflight requires private endpoints");
  for (const endpoint of input.endpoints) {
    if (await exitCode(input.execute, probeCommand(endpoint.alias)) !== 0) {
      throw new Error("Permitted endpoint is unavailable through the official proxy");
    }
  }
  if (await exitCode(input.execute, probeCommand(forbiddenHost)) === 0) {
    throw new Error("Forbidden control hostname is reachable from the official container");
  }
  const firstEndpoint = input.endpoints[0];
  if (!firstEndpoint) throw new Error("Network preflight requires private endpoints");
  return createNetworkEvidence({
    policy: input.policy,
    endpoint: firstEndpoint,
    proxyVersion: input.proxyVersion,
  });
}
