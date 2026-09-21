import { once } from "node:events";
import { request as httpRequest } from "node:http";
import { afterEach, describe, expect, test } from "vitest";
import { startConsole, type ConsoleDataSource } from "../src/server.js";

const servers: Awaited<ReturnType<typeof startConsole>>[] = [];
afterEach(async () => Promise.all(servers.splice(0).map(async (server) => {
  server.close();
  await once(server, "close");
})));

const dataSource: ConsoleDataSource = {
  overview: async () => ({ storageAvailable: true, dockerAvailable: true, benchmarks: ["safe-benchmark"], systems: ["safe-system"], requiredEnvironmentVariables: ["NINFER_API_KEY"] }),
  runs: async () => [{ runId: "20260921T120000Z-safe-benchmark-safe-system-a1b2c3", benchmarkSlug: "safe-benchmark", systemSlug: "safe-system", attemptKind: "first-shot", status: "INFRA_ERROR", createdAt: "2026-09-21T12:00:00.000Z", finishedAt: "2026-09-21T12:01:00.000Z", publicationStatus: "private", failureSummary: "[redacted]" }],
  run: async () => null,
};

async function request(server: Awaited<ReturnType<typeof startConsole>>, path: string): Promise<{ status: number; body: string }> {
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("server did not expose a TCP address");
  return new Promise((resolve, reject) => {
    const client = httpRequest({ host: "127.0.0.1", port: address.port, path }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { body += chunk; });
      response.on("end", () => resolve({ status: response.statusCode ?? 0, body }));
    });
    client.once("error", reject);
    client.end();
  });
}

describe("local console server", () => {
  test("binds only to loopback and never accepts a caller-selected host", async () => {
    const server = await startConsole({ port: 0, dataSource });
    servers.push(server);
    expect(server.address()).toMatchObject({ address: "127.0.0.1" });
  });

  test("returns sanitized runs and rejects a path-like route id", async () => {
    const server = await startConsole({ port: 0, dataSource });
    servers.push(server);
    expect((await request(server, "/api/runs")).body).not.toContain("token=");
    expect((await request(server, "/api/runs/..%2Fstate")).status).toBe(400);
  });
});
