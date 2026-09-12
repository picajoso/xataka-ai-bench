import { mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { FakeAdapter } from "@aibench/adapters";
import { loadBenchmark, resolveBenchPaths } from "@aibench/config";
import { DockerIsolationProvider, RunStore, executeRun } from "@aibench/runner";

export type CliResult = { exitCode: number; output: string };
export type CliDependencies = { doctor?: () => unknown; list?: () => string[]; plan?: () => string; run?: () => string | Promise<string>; status?: (runId: string) => unknown | Promise<unknown> };

async function runFakeSmoke(): Promise<string> {
  const paths = resolveBenchPaths();
  await Promise.all([mkdir(paths.runsRoot, { recursive: true }), mkdir(paths.workspaceRoot, { recursive: true }), mkdir(paths.reviewRoot, { recursive: true })]);
  const loaded = await loadBenchmark(join(paths.repoRoot, "examples", "smoke-benchmark", "benchmark.yaml"));
  const prompt = await readFile(join(loaded.directory, loaded.definition.prompts.canonical.path), "utf8");
  const store = new RunStore({ runsRoot: paths.runsRoot });
  const run = await store.createRun({
    benchmark: { slug: loaded.definition.slug, version: loaded.definition.version, definitionHash: loaded.definitionHash, promptHash: loaded.promptHashes.es!, promptLocale: "es", inputsPublic: false },
    system: { slug: "fake", version: "1.0.0", profileHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
    attempt: { kind: "first-shot", parent: null }, executionClass: "official-container",
  });
  await executeRun({ store, run, prompt, timeoutMs: loaded.definition.limits.firstShotSeconds * 1000,
    adapter: new FakeAdapter({ events: [{ type: "session.started", sessionId: "fake" }, { type: "session.finished", outcome: "success", exitCode: 0 }] }),
    isolation: new DockerIsolationProvider({ image: "aibench/agent-runner:local" }),
    isolationRequest: { runId: run.runId, executionClass: "official-container", storageRoot: dirname(paths.dataRoot), fixturesPath: loaded.directory, workspacePath: join(paths.workspaceRoot, run.runId), outputPath: join(paths.reviewRoot, run.runId), networkPolicy: "blocked", limits: { cpu: 1, memoryMb: 512, pids: 32 } },
  });
  return run.runId;
}

export async function runCli(args: string[], dependencies: CliDependencies = {}): Promise<CliResult> {
  const [command, ...flags] = args;
  if (command === "list") {
    const benchmarks = (dependencies.list ?? (() => ["smoke-benchmark"]))();
    return { exitCode: 0, output: flags.includes("--json") ? `${JSON.stringify({ benchmarks })}\n` : `${benchmarks.join("\n")}\n` };
  }
  if (command === "plan") {
    if (!flags.includes("--confirm")) return { exitCode: 2, output: "plan: --confirm is required for an official plan\n" };
    const planId = (dependencies.plan ?? (() => "plan-smoke-benchmark-fake"))();
    return { exitCode: 0, output: flags.includes("--json") ? `${JSON.stringify({ planId })}\n` : `plan: ${planId}\n` };
  }
  if (command === "run") {
    const adapter = flags[flags.indexOf("--adapter") + 1] ?? "fake";
    if (adapter !== "fake" && !flags.includes("--confirm")) return { exitCode: 2, output: "run: --confirm is required for a real adapter\n" };
    const runId = await (dependencies.run ?? runFakeSmoke)();
    return { exitCode: 0, output: flags.includes("--json") ? `${JSON.stringify({ runId })}\n` : `run: ${runId}\n` };
  }
  if (command === "status") {
    const runId = flags.find((flag) => !flag.startsWith("--"));
    if (!runId) return { exitCode: 2, output: "status: run id is required\n" };
    const result = await (dependencies.status ?? (async (id: string) => {
      const paths = resolveBenchPaths();
      return new RunStore({ runsRoot: paths.runsRoot }).loadRun(id);
    }))(runId);
    return { exitCode: 0, output: flags.includes("--json") ? `${JSON.stringify(result)}\n` : `${JSON.stringify(result)}\n` };
  }
  if (command !== "doctor") return { exitCode: 2, output: "Usage: aibench doctor|list [--json]\n" };
  try {
    const result = (dependencies.doctor ?? (() => {
      const paths = resolveBenchPaths();
      return { ok: true, home: paths.dataRoot.replace(/\/state$/, "") };
    }))();
    return { exitCode: 0, output: flags.includes("--json") ? `${JSON.stringify(result)}\n` : "doctor: external storage is available\n" };
  } catch (error) {
    return { exitCode: 1, output: `doctor: ${error instanceof Error ? error.message : "unknown error"}\n` };
  }
}
