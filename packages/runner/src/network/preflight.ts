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

export function buildNetworkProbeCommand(host: string, port = proxyPort): ProcessCommand {
  return {
    executable: "node",
    args: ["-e", "const net=require('node:net');let done=false;const end=c=>{if(!done){done=true;process.exit(c)}};setTimeout(()=>end(1),3100);const s=net.connect({host:process.argv[1],port:Number(process.argv[2])});s.setTimeout(3000);s.once('connect',()=>s.write('AIBENCH-PROBE\\n'));s.once('data',d=>end(d.toString()==='AIBENCH-OK\\n'?0:1));s.once('error',()=>end(1));s.once('timeout',()=>end(1));s.once('close',()=>end(1));", host, String(port)],
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
    if (await exitCode(input.execute, buildNetworkProbeCommand(endpoint.alias)) !== 0) {
      throw new Error("Permitted endpoint is unavailable through the official proxy");
    }
  }
  if (await exitCode(input.execute, buildNetworkProbeCommand(forbiddenHost)) === 0) {
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
