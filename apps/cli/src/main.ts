import { resolveBenchPaths } from "@aibench/config";

export type CliResult = { exitCode: number; output: string };
export type CliDependencies = { doctor?: () => unknown; list?: () => string[]; plan?: () => string; run?: () => string; status?: (runId: string) => unknown };

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
    const runId = (dependencies.run ?? (() => "run-smoke-benchmark-fake"))();
    return { exitCode: 0, output: flags.includes("--json") ? `${JSON.stringify({ runId })}\n` : `run: ${runId}\n` };
  }
  if (command === "status") {
    const runId = flags.find((flag) => !flag.startsWith("--"));
    if (!runId) return { exitCode: 2, output: "status: run id is required\n" };
    const result = (dependencies.status ?? ((id: string) => ({ runId: id, status: "UNKNOWN" })))(runId);
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
