import type { IncomingMessage, ServerResponse } from "node:http";
import type { ConsoleRun } from "./model.js";
import { assertConsoleId } from "./model.js";
import { overviewPage, runPage } from "./html.js";

export type ConsoleOverview = Readonly<{
  storageAvailable: boolean;
  dockerAvailable: boolean;
  benchmarks: string[];
  systems: string[];
  requiredEnvironmentVariables: string[];
}>;

export type ConsoleDataSource = Readonly<{
  overview(): Promise<ConsoleOverview>;
  runs(): Promise<ConsoleRun[]>;
  run(runId: string): Promise<ConsoleRun | null>;
}>;

function sendJson(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(`${JSON.stringify(value)}\n`);
}

function sendHtml(response: ServerResponse, status: number, value: string): void {
  response.writeHead(status, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
  response.end(value);
}

export async function routeRequest(request: IncomingMessage, response: ServerResponse, dataSource: ConsoleDataSource): Promise<void> {
  if (request.method !== "GET") {
    response.writeHead(405, { allow: "GET", "cache-control": "no-store" });
    response.end();
    return;
  }
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  if (url.pathname === "/api/overview") return sendJson(response, 200, await dataSource.overview());
  if (url.pathname === "/api/runs") return sendJson(response, 200, await dataSource.runs());
  if (url.pathname === "/") return sendHtml(response, 200, overviewPage(await dataSource.overview(), await dataSource.runs()));

  const match = /^\/(?:api\/)?runs\/(.+)$/.exec(url.pathname);
  if (!match) return sendJson(response, 404, { error: "Not found" });
  let runId: string;
  try {
    runId = assertConsoleId(decodeURIComponent(match[1]!), "run");
  } catch {
    return sendJson(response, 400, { error: "Invalid run identifier" });
  }
  const run = await dataSource.run(runId);
  if (run === null) return sendJson(response, 404, { error: "Run not found" });
  if (url.pathname.startsWith("/api/")) return sendJson(response, 200, run);
  return sendHtml(response, 200, runPage(run));
}
