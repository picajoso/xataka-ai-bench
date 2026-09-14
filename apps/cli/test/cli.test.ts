import { describe, expect, test } from "vitest";
import { runCli } from "../src/main.js";

describe("aibench doctor", () => {
  test("reports an available external workspace as JSON", async () => {
    const result = await runCli(["doctor", "--json"], {
      doctor: () => ({ ok: true, home: "/Volumes/MacOS_VMs/xataka-ai-bench" }),
    });
    expect(result).toEqual({ exitCode: 0, output: '{"ok":true,"home":"/Volumes/MacOS_VMs/xataka-ai-bench"}\n' });
  });

  test("returns a non-zero result when the storage guard fails", async () => {
    const result = await runCli(["doctor"], { doctor: () => { throw new Error("External SSD is not mounted"); } });
    expect(result).toEqual({ exitCode: 1, output: "doctor: External SSD is not mounted\n" });
  });
});

describe("aibench list", () => {
  test("prints the available benchmark slugs as JSON", async () => {
    const result = await runCli(["list", "--json"], { list: () => ["smoke-benchmark"] });
    expect(result).toEqual({ exitCode: 0, output: '{"benchmarks":["smoke-benchmark"]}\n' });
  });
});

describe("aibench plan", () => {
  test("requires a benchmark and system selection before creating an official plan", async () => {
    const result = await runCli(["plan", "--confirm"], { plan: () => "never" });
    expect(result).toEqual({ exitCode: 2, output: "plan: --benchmark and --system are required\n" });
  });

  test("requires explicit confirmation for an official plan", async () => {
    const result = await runCli(["plan", "--benchmark", "smoke-benchmark", "--system", "fake"], { plan: () => "plan-1" });
    expect(result).toEqual({ exitCode: 2, output: "plan: --confirm is required for an official plan\n" });
  });

  test("emits a confirmed plan identifier", async () => {
    const result = await runCli(["plan", "--benchmark", "smoke-benchmark", "--system", "fake", "--confirm", "--json"], { plan: () => "plan-1" });
    expect(result).toEqual({ exitCode: 0, output: '{"planId":"plan-1"}\n' });
  });
});

describe("aibench run and status", () => {
  test("requires a persisted plan identifier before a run can start", async () => {
    const result = await runCli(["run", "--adapter", "fake"], { run: () => "never" });
    expect(result).toEqual({ exitCode: 2, output: "run: --plan is required\n" });
  });

  test("only runs the fake adapter without an additional real-adapter confirmation", async () => {
    const result = await runCli(["run", "--plan", "plan-1", "--adapter", "fake", "--json"], { run: () => "run-1" });
    expect(result).toEqual({ exitCode: 0, output: '{"runId":"run-1"}\n' });
  });

  test("requires confirmation before a real adapter can run", async () => {
    const result = await runCli(["run", "--plan", "plan-1", "--adapter", "codex"], { run: () => "never" });
    expect(result).toEqual({ exitCode: 2, output: "run: --confirm is required for a real adapter\n" });
  });

  test("refuses a confirmed real adapter until its execution profile is configured", async () => {
    const result = await runCli(["run", "--plan", "plan-1", "--adapter", "opencode", "--confirm"], {
      run: () => { throw new Error("a real adapter must not fall back to the smoke runner"); },
    });

    expect(result).toEqual({ exitCode: 2, output: "run: real adapter execution is not configured yet\n" });
  });

  test("reads an immutable run status", async () => {
    const result = await runCli(["status", "run-1", "--json"], { status: (runId) => ({ runId, status: "READY_FOR_REVIEW" }) });
    expect(result).toEqual({ exitCode: 0, output: '{"runId":"run-1","status":"READY_FOR_REVIEW"}\n' });
  });
});

describe("aibench review", () => {
  test("requires a candidate identifier and reports only the review result", async () => {
    await expect(runCli(["review"])).resolves.toEqual({ exitCode: 2, output: "review: candidate id is required\n" });
    await expect(runCli(["review", "candidate-1", "--json"], {
      review: (candidateId) => ({ candidateId, blocked: false }),
    })).resolves.toEqual({ exitCode: 0, output: '{"candidateId":"candidate-1","blocked":false}\n' });
  });

  test("requires a named reviewer for an explicit approval", async () => {
    await expect(runCli(["review", "candidate-1", "--approve"])).resolves.toEqual({
      exitCode: 2,
      output: "review: --reviewer is required with --approve\n",
    });
  });
});

describe("aibench publish", () => {
  test("requires stage-only mode and a candidate identifier", async () => {
    await expect(runCli(["publish", "candidate-1"])).resolves.toEqual({ exitCode: 2, output: "publish: --stage-only is required\n" });
    await expect(runCli(["publish", "--stage-only"])).resolves.toEqual({ exitCode: 2, output: "publish: candidate id is required\n" });
    await expect(runCli(["publish", "candidate-1", "--stage-only", "--json"], { publish: (candidateId) => ({ candidateId, staged: true }) })).resolves.toEqual({ exitCode: 0, output: '{"candidateId":"candidate-1","staged":true}\n' });
  });
});
