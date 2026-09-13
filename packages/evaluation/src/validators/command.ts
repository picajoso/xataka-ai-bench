import { type EvaluationContext, type ValidationResult, type Validator } from "../types.js";

export class CommandValidator implements Validator {
  constructor(
    private readonly command: { executable: string; args: string[]; cwd?: string; env?: Record<string, string> },
    private readonly options: { outputLimitBytes: number },
  ) {}

  async run(context: EvaluationContext): Promise<ValidationResult> {
    const now = new Date().toISOString();
    if (!context.workspace) {
      return { validator: { id: "command", version: "1.0.0", method: "isolated-process" }, status: "unavailable", startedAt: now, finishedAt: now, observations: ["No isolated workspace was supplied."], privateRawOutputRef: null, publicSummary: "Validation command could not be run in isolation." };
    }
    let stdout = 0;
    let stderr = 0;
    let stdoutTruncated = false;
    let stderrTruncated = false;
    let exitCode: number | null = null;
    for await (const event of context.workspace.exec(this.command)) {
      if (event.type === "exit") exitCode = event.exitCode;
      if (event.type === "stdout") {
        stdout += Buffer.byteLength(event.data);
        stdoutTruncated ||= stdout > this.options.outputLimitBytes;
      }
      if (event.type === "stderr") {
        stderr += Buffer.byteLength(event.data);
        stderrTruncated ||= stderr > this.options.outputLimitBytes;
      }
    }
    const observations = [`Exit code: ${exitCode ?? "none"}`];
    if (stdoutTruncated) observations.push(`Standard output truncated after ${this.options.outputLimitBytes} bytes.`);
    if (stderrTruncated) observations.push(`Standard error truncated after ${this.options.outputLimitBytes} bytes.`);
    const passed = exitCode === 0;
    return { validator: { id: "command", version: "1.0.0", method: "isolated-process" }, status: passed ? "passed" : "failed", startedAt: now, finishedAt: new Date().toISOString(), observations, privateRawOutputRef: null, publicSummary: passed ? "Validation command completed successfully." : `Validation command failed with exit code ${exitCode ?? "none"}.` };
  }
}
