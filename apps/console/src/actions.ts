import { randomBytes } from "node:crypto";
import type { CliResult } from "@aibench/cli";
import { RunIdSchema } from "@aibench/contracts";
import { assertConsoleId } from "./model.js";

type ActionKind = "plan" | "run" | "repair" | "review";
type PendingAction = Readonly<{ token: string; kind: ActionKind; args: string[]; expiresAt: number }>;
type ActionRun = Readonly<{ attemptKind: "first-shot" | "repair" | "assisted"; status: string; failureClassification: string | null }>;
type CliRunner = (args: string[]) => Promise<CliResult>;

export type OperatorActionSources = Readonly<{
  benchmarks: readonly string[];
  systems: readonly string[];
  run(runId: string): Promise<ActionRun | null>;
  cli: CliRunner;
}>;

export class ConfirmationStore {
  readonly #pending = new Map<string, PendingAction>();

  create(kind: ActionKind, args: string[]): PendingAction {
    const pending: PendingAction = { token: randomBytes(18).toString("base64url"), kind, args: [...args], expiresAt: Date.now() + 5 * 60_000 };
    this.#pending.set(pending.token, pending);
    return pending;
  }

  consume(token: string, kind: ActionKind): PendingAction | null {
    const pending = this.#pending.get(token);
    this.#pending.delete(token);
    return pending?.kind === kind && pending.expiresAt >= Date.now() ? pending : null;
  }
}

function stringField(value: unknown, field: string): string {
  if (typeof value !== "string") throw new Error(`${field} is required`);
  return value;
}

function planId(value: string): string {
  if (!/^plan-20\d{6}-[a-f0-9]{6}$/.test(value)) throw new Error("Invalid plan identifier");
  return value;
}

function safeResult(result: CliResult): { exitCode: number; status: "completed" | "failed" } {
  return { exitCode: result.exitCode, status: result.exitCode === 0 ? "completed" : "failed" };
}

export function createOperatorActions(sources: OperatorActionSources, confirmations = new ConfirmationStore()) {
  const allowedBenchmarks = new Set(sources.benchmarks);
  const allowedSystems = new Set(sources.systems);
  const previewPlan = (body: unknown) => {
    const value = body as Record<string, unknown>;
    const benchmark = stringField(value.benchmark, "benchmark");
    const system = stringField(value.system, "system");
    if (!allowedBenchmarks.has(benchmark) || !allowedSystems.has(system)) throw new Error("Unknown benchmark or system");
    return confirmations.create("plan", ["plan", "--benchmark", benchmark, "--system", system, "--confirm", "--json"]);
  };
  const previewRun = (body: unknown) => confirmations.create("run", ["run", "--plan", planId(stringField((body as Record<string, unknown>).plan, "plan")), "--adapter", "opencode", "--confirm", "--json"]);
  const previewRepair = async (body: unknown) => {
    const runId = RunIdSchema.parse(stringField((body as Record<string, unknown>).run, "run"));
    const run = await sources.run(runId);
    if (run?.attemptKind !== "first-shot" || run.status !== "FAILED" || run.failureClassification !== "VALIDATION_FAILURE") {
      throw new Error("Run is not eligible for repair");
    }
    return confirmations.create("repair", ["repair", runId, "--adapter", "opencode", "--confirm", "--json"]);
  };
  const previewReview = async (body: unknown) => {
    const candidate = assertConsoleId(stringField((body as Record<string, unknown>).candidate, "candidate"), "candidate");
    return safeResult(await sources.cli(["review", candidate, "--json"]));
  };
  const confirm = async (kind: Exclude<ActionKind, "review">, body: unknown) => {
    const token = stringField((body as Record<string, unknown>).token, "token");
    const pending = confirmations.consume(token, kind);
    if (pending === null) throw new Error("Confirmation expired or invalid");
    return safeResult(await sources.cli(pending.args));
  };
  return { previewPlan, previewRun, previewRepair, previewReview, confirm };
}

export type OperatorActions = ReturnType<typeof createOperatorActions>;
