import { once } from "node:events";
import { request as httpRequest } from "node:http";
import { afterEach, describe, expect, test } from "vitest";
import { createOperatorActions } from "../src/actions.js";
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

async function request(server: Awaited<ReturnType<typeof startConsole>>, path: string, payload?: unknown): Promise<{ status: number; body: string }> {
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("server did not expose a TCP address");
  return new Promise((resolve, reject) => {
    const client = httpRequest({ host: "127.0.0.1", port: address.port, path, method: payload === undefined ? "GET" : "POST", headers: payload === undefined ? undefined : { "content-type": "application/json" } }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { body += chunk; });
      response.on("end", () => resolve({ status: response.statusCode ?? 0, body }));
    });
    client.once("error", reject);
    client.end(payload === undefined ? undefined : JSON.stringify(payload));
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

  test("renders only fixed preview routes for operator actions", async () => {
    const actions = createOperatorActions({ benchmarks: ["safe-benchmark"], systems: ["safe-system"], run: async () => null, cli: async () => ({ exitCode: 0, output: "{}\n" }) });
    const server = await startConsole({ port: 0, dataSource, actions });
    servers.push(server);
    const page = await request(server, "/");
    expect(page.body).toContain('data-action="plan"');
    expect(page.body).toContain('data-action="run"');
    expect(page.body).not.toContain("NINFER_API_KEY=");
  });

  test("does not create a plan before confirmation and uses a fixed command after it", async () => {
    const cliCalls: string[][] = [];
    const actions = createOperatorActions({
      benchmarks: ["safe-benchmark"], systems: ["safe-system"],
      run: async () => null,
      cli: async (args) => { cliCalls.push(args); return { exitCode: 0, output: "{\"planId\":\"plan-20260921-a1b2c3\"}\n" }; },
    });
    const server = await startConsole({ port: 0, dataSource, actions });
    servers.push(server);
    const preview = await request(server, "/actions/plan/preview", { benchmark: "safe-benchmark", system: "safe-system" });
    expect(cliCalls).toEqual([]);
    const token = (JSON.parse(preview.body) as { token: string }).token;
    await request(server, "/actions/plan/confirm", { token });
    expect(cliCalls).toEqual([["plan", "--benchmark", "safe-benchmark", "--system", "safe-system", "--confirm", "--json"]]);
    expect((await request(server, "/actions/plan/confirm", { token })).status).toBe(400);
    expect(cliCalls).toHaveLength(1);
  });

  test("fixes every run invocation to the official OpenCode adapter", async () => {
    const cliCalls: string[][] = [];
    const actions = createOperatorActions({
      benchmarks: [], systems: [], run: async () => null,
      cli: async (args) => { cliCalls.push(args); return { exitCode: 0, output: "{}\n" }; },
    });
    const server = await startConsole({ port: 0, dataSource, actions });
    servers.push(server);
    const preview = await request(server, "/actions/run/preview", { plan: "plan-20260921-a1b2c3", adapter: "anything-else" });
    await request(server, "/actions/run/confirm", { token: (JSON.parse(preview.body) as { token: string }).token });
    expect(cliCalls).toEqual([["run", "--plan", "plan-20260921-a1b2c3", "--adapter", "opencode", "--confirm", "--json"]]);
  });

  test("review preparation never passes approval or publication arguments", async () => {
    const cliCalls: string[][] = [];
    const actions = createOperatorActions({
      benchmarks: [], systems: [], run: async () => null,
      cli: async (args) => { cliCalls.push(args); return { exitCode: 0, output: "{}\n" }; },
    });
    const server = await startConsole({ port: 0, dataSource, actions });
    servers.push(server);
    await request(server, "/actions/review/preview", { candidate: "candidate-1" });
    expect(cliCalls).toEqual([["review", "candidate-1", "--json"]]);
  });
});
