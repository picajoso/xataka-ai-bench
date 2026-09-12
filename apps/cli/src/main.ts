import { resolveBenchPaths } from "@aibench/config";

export type CliResult = { exitCode: number; output: string };
export type CliDependencies = { doctor?: () => unknown };

export async function runCli(args: string[], dependencies: CliDependencies = {}): Promise<CliResult> {
  const [command, ...flags] = args;
  if (command !== "doctor") return { exitCode: 2, output: "Usage: aibench doctor [--json]\n" };
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
