import type { IncomingMessage, ServerResponse } from "node:http";
import type { ConsoleRun } from "./model.js";
import { assertConsoleId } from "./model.js";
import { overviewPage, runPage } from "./html.js";
import type { OperatorActions } from "./actions.js";

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

async function readJson(request: IncomingMessage): Promise<unknown> {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 16_384) throw new Error("Request body too large");
  }
  try {
    const parsed: unknown = JSON.parse(body);
    if (parsed === null || Array.isArray(parsed) || typeof parsed !== "object") throw new Error("JSON object required");
    return parsed;
  } catch {
    throw new Error("Invalid JSON body");
  }
}

async function routeAction(pathname: string, request: IncomingMessage, response: ServerResponse, actions: OperatorActions | undefined): Promise<boolean> {
  if (!pathname.startsWith("/actions/")) return false;
  if (request.method !== "POST") {
    response.writeHead(405, { allow: "POST", "cache-control": "no-store" });
    response.end();
    return true;
  }
  if (!actions) return sendJson(response, 503, { error: "Console actions unavailable" }), true;
  try {
    const body = await readJson(request);
    if (pathname === "/actions/plan/preview") return sendJson(response, 200, actions.previewPlan(body)), true;
    if (pathname === "/actions/run/preview") return sendJson(response, 200, actions.previewRun(body)), true;
    if (pathname === "/actions/repair/preview") return sendJson(response, 200, await actions.previewRepair(body)), true;
    if (pathname === "/actions/review/preview") return sendJson(response, 200, await actions.previewReview(body)), true;
    const match = /^\/actions\/(plan|run|repair)\/confirm$/.exec(pathname);
    if (match) return sendJson(response, 200, await actions.confirm(match[1]! as "plan" | "run" | "repair", body)), true;
    return sendJson(response, 404, { error: "Not found" }), true;
  } catch (error) {
    return sendJson(response, 400, { error: error instanceof Error ? error.message : "Invalid action" }), true;
  }
}

function sendJson(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(`${JSON.stringify(value)}\n`);
}

function sendHtml(response: ServerResponse, status: number, value: string): void {
  response.writeHead(status, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
  response.end(value);
}

export async function routeRequest(request: IncomingMessage, response: ServerResponse, dataSource: ConsoleDataSource, actions?: OperatorActions): Promise<void> {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  if (await routeAction(url.pathname, request, response, actions)) return;
  if (request.method !== "GET") {
    response.writeHead(405, { allow: "GET", "cache-control": "no-store" });
    response.end();
    return;
  }
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
