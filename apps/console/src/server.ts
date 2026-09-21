import { spawnSync } from "node:child_process";
import { createServer, type Server } from "node:http";
import { readdir } from "node:fs/promises";
import { once } from "node:events";
import { join } from "node:path";
import { loadBenchmark, loadExecutionProfiles, loadSystemProfile, resolveBenchPaths, type BenchPaths } from "@aibench/config";
import { runCli } from "@aibench/cli";
import { RunStore } from "@aibench/runner";
import { toConsoleRun } from "./model.js";
import { routeRequest, type ConsoleDataSource, type ConsoleOverview } from "./routes.js";
import { createOperatorActions, type OperatorActions } from "./actions.js";

export type { ConsoleDataSource } from "./routes.js";

const slugPattern = /^[a-z][a-z0-9-]*$/;

async function catalogSlugs(directory: string, file: string, load: (path: string) => Promise<unknown>): Promise<string[]> {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    const slugs = await Promise.all(entries.flatMap((entry) => {
      if (!entry.isDirectory() || !slugPattern.test(entry.name)) return [];
      return [load(join(directory, entry.name, file)).then(() => entry.name).catch(() => null)];
    }));
    return slugs.filter((slug): slug is string => slug !== null).sort();
  } catch {
    return [];
  }
}

async function createBenchDataSource(paths: BenchPaths): Promise<ConsoleDataSource> {
  const store = new RunStore({ runsRoot: paths.runsRoot });
  const overview = async (): Promise<ConsoleOverview> => {
    const profiles = await loadExecutionProfiles(join(paths.dataRoot, "execution-profiles.yaml")).catch(() => []);
    return {
      storageAvailable: true,
      dockerAvailable: spawnSync("docker", ["info"], { stdio: "ignore" }).status === 0,
      benchmarks: await catalogSlugs(join(paths.repoRoot, "benchmarks"), "benchmark.yaml", loadBenchmark),
      systems: await catalogSlugs(join(paths.repoRoot, "systems"), "system.yaml", loadSystemProfile),
      requiredEnvironmentVariables: [...new Set(profiles.flatMap((profile) => profile.environmentVariables))].sort(),
    };
  };
  return {
    overview,
    runs: async () => (await store.listRuns()).map(toConsoleRun),
    run: async (runId) => store.loadRun(runId).then(toConsoleRun).catch(() => null),
  };
}

function createBenchActions(paths: BenchPaths, overview: ConsoleOverview): OperatorActions {
  const store = new RunStore({ runsRoot: paths.runsRoot });
  return createOperatorActions({
    benchmarks: overview.benchmarks,
    systems: overview.systems,
    run: async (runId) => store.loadRun(runId).then((run) => ({ attemptKind: run.attempt.kind, status: run.status, failureClassification: run.failure?.classification ?? null })).catch(() => null),
    cli: runCli,
  });
}

export function createConsoleServer(dataSource: ConsoleDataSource, actions?: OperatorActions): Server {
  return createServer((request, response) => {
    void routeRequest(request, response, dataSource, actions).catch(() => {
      response.writeHead(500, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
      response.end('{"error":"Console read failed"}\n');
    });
  });
}

export async function startConsole({ port = 3847, dataSource, actions }: { port?: number; dataSource?: ConsoleDataSource; actions?: OperatorActions } = {}): Promise<Server> {
  if (dataSource) {
    const server = createConsoleServer(dataSource, actions);
    server.listen(port, "127.0.0.1");
    await once(server, "listening");
    return server;
  }
  const paths = resolveBenchPaths();
  const source = await createBenchDataSource(paths);
  const server = createConsoleServer(source, actions ?? createBenchActions(paths, await source.overview()));
  server.listen(port, "127.0.0.1");
  await once(server, "listening");
  return server;
}
