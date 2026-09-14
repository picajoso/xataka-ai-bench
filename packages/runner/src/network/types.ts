import { createHash } from "node:crypto";
import type { BenchmarkDefinition } from "@aibench/contracts";

export type PrivateEndpoint = {
  alias: string;
  host: string;
  port: number;
};

export type NetworkEvidence = {
  proxyVersion: string;
  allowListHash: string;
};

export type NetworkEvidenceInput = {
  policy: BenchmarkDefinition["network"]["policy"];
  endpoint?: PrivateEndpoint;
  proxyVersion: string;
};

function isSafeHost(host: string): boolean {
  return /^[A-Za-z0-9.-]+$/.test(host) && !host.includes("..") && !host.startsWith(".") && !host.endsWith(".") && !host.includes("://");
}

export function parsePrivateEndpoint(input: unknown): PrivateEndpoint {
  if (!input || typeof input !== "object") throw new Error("Private endpoint must be an object");
  const endpoint = input as Record<string, unknown>;
  if (typeof endpoint.alias !== "string" || !/^[a-z0-9-]+\.local$/.test(endpoint.alias)) {
    throw new Error("Private endpoint alias must use the synthetic .local namespace");
  }
  if (typeof endpoint.host !== "string" || !isSafeHost(endpoint.host)) {
    throw new Error("Private endpoint host must be a plain hostname or IP address");
  }
  if (typeof endpoint.port !== "number" || !Number.isInteger(endpoint.port) || endpoint.port < 1 || endpoint.port > 65535) {
    throw new Error("Private endpoint port must be a valid TCP port");
  }
  return { alias: endpoint.alias, host: endpoint.host, port: endpoint.port };
}

export function createNetworkEvidence(input: NetworkEvidenceInput): NetworkEvidence {
  if (!input.proxyVersion.trim()) throw new Error("Proxy version is required");
  if (input.policy === "package-registries-and-local-endpoint" && !input.endpoint) {
    throw new Error("A local-endpoint policy requires a private endpoint");
  }
  const allowList = input.endpoint
    ? `${input.policy}\n${input.endpoint.alias}\n${input.endpoint.host}\n${input.endpoint.port}`
    : input.policy;
  return {
    proxyVersion: input.proxyVersion,
    allowListHash: `sha256:${createHash("sha256").update(allowList).digest("hex")}`,
  };
}
