import type { Server } from "node:net";

export const proxyVersion: string;

export function parseProxyConfiguration(environment: Record<string, string | undefined>): {
  host: string;
  port: number;
};

export function startProxy(
  configuration: { host: string; port: number },
  options?: { listenPort?: number; listenHost?: string },
): Promise<Server>;
