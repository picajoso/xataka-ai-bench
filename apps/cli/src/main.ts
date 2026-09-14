import { mkdir, readFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { dirname, join } from "node:path";
import { FakeAdapter } from "@aibench/adapters";
import { loadBenchmark, loadSystemProfile, resolveBenchPaths } from "@aibench/config";
import { createBatchPlan, DockerIsolationProvider, PlanStore, RunStore, executeRun } from "@aibench/runner";
import { approveCandidate, buildReviewedCandidate, loadApprovalRecord, saveApprovalRecord, stageApprovedCandidate } from "@aibench/publisher";

export type CliResult = { exitCode: number; output: string };
export type CliDependencies = { doctor?: () => unknown; list?: () => string[]; plan?: () => string; run?: () => string | Promise<string>; status?: (runId: string) => unknown | Promise<unknown>; review?: (candidateId: string) => unknown | Promise<unknown>; publish?: (candidateId: string) => unknown | Promise<unknown> };

function flagValue(flags: string[], name: string): string | undefined {
  const index = flags.indexOf(name);
  return index === -1 ? undefined : flags[index + 1];
}

async function createOfficialPlan(benchmarkSlug: string, systemSlug: string): Promise<string> {
  const paths = resolveBenchPaths();
  const benchmarkPath = benchmarkSlug === "smoke-benchmark"
    ? join(paths.repoRoot, "examples", "smoke-benchmark", "benchmark.yaml")
    : join(paths.repoRoot, "benchmarks", benchmarkSlug, "benchmark.yaml");
  const loaded = await loadBenchmark(benchmarkPath);
  const system = systemSlug === "fake"
    ? { slug: "fake", version: "1.0.0", profileHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }
    : await loadSystemProfile(join(paths.repoRoot, "systems", systemSlug, "system.yaml")).then((entry) => ({ slug: entry.profile.slug, version: entry.profile.version, profileHash: entry.profileHash }));
  const plan = createBatchPlan([{ slug: loaded.definition.slug, version: loaded.definition.version, hash: loaded.definitionHash }], [{
    slug: system.slug, version: system.version, hash: system.profileHash,
  }], { createdAt: new Date(), randomBytes, official: true, confirmedAt: new Date() });
  await new PlanStore({ plansRoot: paths.plansRoot }).save(plan);
  return plan.planId;
}

async function runFakeSmoke(planId: string): Promise<string> {
  const paths = resolveBenchPaths();
  const plan = await new PlanStore({ plansRoot: paths.plansRoot }).load(planId);
  if (plan.runs.length !== 1 || plan.runs[0]?.benchmarkSlug !== "smoke-benchmark" || plan.runs[0]?.systemSlug !== "fake") {
    throw new Error(`Plan ${planId} is not an executable fake smoke plan`);
  }
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

async function reviewPrivateCandidate(candidateId: string, approve: boolean, reviewer: string | undefined): Promise<unknown> {
  const paths = resolveBenchPaths();
  const reviewed = await buildReviewedCandidate(paths.reviewRoot, candidateId);
  if (!approve) {
    return { candidateId, runId: reviewed.record.runId, packageHash: reviewed.candidate.packageHash, status: "ready-for-approval" };
  }
  if (!reviewer) throw new Error("review: --reviewer is required with --approve");
  const approval = approveCandidate({
    candidateId,
    packageHash: reviewed.candidate.packageHash,
    reviewer,
    approvedAt: new Date().toISOString(),
  });
  await saveApprovalRecord(dirname(reviewed.record.packageRoot), approval);
  return { candidateId, runId: reviewed.record.runId, packageHash: reviewed.candidate.packageHash, status: "approved", approval };
}

async function stagePrivateCandidate(candidateId: string): Promise<unknown> {
  const paths = resolveBenchPaths();
  const reviewed = await buildReviewedCandidate(paths.reviewRoot, candidateId);
  const approval = await loadApprovalRecord(dirname(reviewed.record.packageRoot));
  if (approval.candidateId !== candidateId) throw new Error("Approval record does not belong to this candidate");
  const staged = await stageApprovedCandidate({
    source: reviewed.record.packageRoot,
    publishedRoot: join(paths.repoRoot, "published"),
    runId: reviewed.record.runId,
    packageHash: reviewed.candidate.packageHash,
    approvedPackageHash: approval.approvedPackageHash,
    includedPaths: reviewed.candidate.includedPaths,
    publication: reviewed.record.publication,
  });
  return { candidateId, runId: reviewed.record.runId, status: "staged", ...staged };
}

export async function runCli(args: string[], dependencies: CliDependencies = {}): Promise<CliResult> {
  const [command, ...flags] = args;
  if (command === "list") {
    const benchmarks = (dependencies.list ?? (() => ["smoke-benchmark"]))();
    return { exitCode: 0, output: flags.includes("--json") ? `${JSON.stringify({ benchmarks })}\n` : `${benchmarks.join("\n")}\n` };
  }
  if (command === "plan") {
    const benchmark = flagValue(flags, "--benchmark");
    const system = flagValue(flags, "--system");
    if (!benchmark || !system) return { exitCode: 2, output: "plan: --benchmark and --system are required\n" };
    if (!flags.includes("--confirm")) return { exitCode: 2, output: "plan: --confirm is required for an official plan\n" };
    const planId = await (dependencies.plan ?? (() => createOfficialPlan(benchmark, system)))();
    return { exitCode: 0, output: flags.includes("--json") ? `${JSON.stringify({ planId })}\n` : `plan: ${planId}\n` };
  }
  if (command === "run") {
    const planId = flagValue(flags, "--plan");
    if (!planId) return { exitCode: 2, output: "run: --plan is required\n" };
    const adapter = flagValue(flags, "--adapter") ?? "fake";
    if (adapter !== "fake" && !flags.includes("--confirm")) return { exitCode: 2, output: "run: --confirm is required for a real adapter\n" };
    if (adapter !== "fake") return { exitCode: 2, output: "run: real adapter execution is not configured yet\n" };
    const runId = await (dependencies.run ?? (() => runFakeSmoke(planId)))();
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
  if (command === "review") {
    const candidateId = flags.find((flag) => !flag.startsWith("--"));
    if (!candidateId) return { exitCode: 2, output: "review: candidate id is required\n" };
    const approve = flags.includes("--approve");
    const reviewer = flagValue(flags, "--reviewer");
    if (approve && !reviewer) return { exitCode: 2, output: "review: --reviewer is required with --approve\n" };
    const result = await (dependencies.review ?? ((id: string) => reviewPrivateCandidate(id, approve, reviewer)))(candidateId);
    return { exitCode: 0, output: flags.includes("--json") ? `${JSON.stringify(result)}\n` : `${JSON.stringify(result)}\n` };
  }
  if (command === "publish") {
    if (!flags.includes("--stage-only")) return { exitCode: 2, output: "publish: --stage-only is required\n" };
    const candidateId = flags.find((flag) => !flag.startsWith("--"));
    if (!candidateId) return { exitCode: 2, output: "publish: candidate id is required\n" };
    const result = await (dependencies.publish ?? stagePrivateCandidate)(candidateId);
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
