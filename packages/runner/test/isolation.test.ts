import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
  DockerIsolationProvider,
  NativeIsolationProvider,
  parsePrivateEndpoint,
  type IsolationRequest,
} from "../src/index.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function request(overrides: Partial<IsolationRequest> = {}): IsolationRequest {
  const root = mkdtempSync(join(tmpdir(), "aibench-isolation-"));
  temporaryDirectories.push(root);
  mkdirSync(join(root, "fixtures"));
  return {
    runId: "20260911T150000000Z-test",
    executionClass: "official-container",
    storageRoot: root,
    fixturesPath: join(root, "fixtures"),
    workspacePath: join(root, "workspace"),
    outputPath: join(root, "output"),
    networkPolicy: "blocked",
    limits: { cpu: 2, memoryMb: 4096, pids: 256 },
    ...overrides,
  };
}

describe("Docker isolation contract", () => {
  test("creates a constrained command with read-only fixtures and writable output", async () => {
    const isolation = new DockerIsolationProvider({ image: "aibench/agent-runner:test" });
    const workspace = await isolation.prepare(request());
    const command = workspace.commandFor({ executable: "agent", args: ["run"] });

    expect(command).toContain("--read-only");
    expect(command).toContain("--user");
    expect(command).toContain("10001:10001");
    expect(command).toContain("--pids-limit");
    expect(command).toContain("256");
    expect(command).toContain("--cpus");
    expect(command).toContain("2");
    expect(command).toContain("--memory");
    expect(command).toContain("4096m");
    expect(command).toContain(`type=bind,src=${workspace.request.fixturesPath},dst=/fixtures,readonly`);
    expect(command).toContain(`type=bind,src=${workspace.request.outputPath},dst=/output`);
    expect(command.join(" ")).not.toContain("docker.sock");
  });

  test("translates the blocked policy to Docker's no-network mode", async () => {
    const isolation = new DockerIsolationProvider({ image: "aibench/agent-runner:test" });
    const workspace = await isolation.prepare(request({ networkPolicy: "blocked" }));

    expect(workspace.commandFor({ executable: "agent", args: [] })).toContain("none");
  });

  test("refuses an outbound policy until its private destinations are configured", async () => {
    const isolation = new DockerIsolationProvider({ image: "aibench/agent-runner:test" });

    await expect(isolation.prepare(request({ networkPolicy: "package-registries" }))).rejects.toThrow(/private endpoints/i);
  });

  test("uses a per-run internal lease for an official endpoint and disposes it with the workspace", async () => {
    let disposed = false;
    const isolation = new DockerIsolationProvider({
      image: "aibench/agent-runner:test",
      networkProvisioner: {
        async create() {
          return { agentNetwork: "aibench-run-test", async dispose() { disposed = true; } };
        },
      },
    });
    const workspace = await isolation.prepare(request({
      networkPolicy: "package-registries-and-local-endpoint",
      privateEndpoints: [parsePrivateEndpoint({ alias: "inference.local", host: "192.168.1.50", port: 1234 })],
    }));

    expect(workspace.commandFor({ executable: "agent", args: [] })).toContain("aibench-run-test");
    await workspace.dispose();
    expect(disposed).toBe(true);
  });

  test("passes only credential names to Docker and never their values", async () => {
    const isolation = new DockerIsolationProvider({ image: "aibench/agent-runner:test" });
    const workspace = await isolation.prepare(request());

    const command = workspace.commandFor({
      executable: "agent",
      args: ["run"],
      env: { NINFER_API_KEY: "secret-value-must-not-appear" },
    });

    expect(command).toContain("--env");
    expect(command).toContain("NINFER_API_KEY");
    expect(command.join(" ")).not.toContain("secret-value-must-not-appear");
  });

  test("preserves the final private workspace in the run output before cleanup", async () => {
    const isolation = new DockerIsolationProvider({ image: "aibench/agent-runner:test" });
    const workspace = await isolation.prepare(request());
    writeFileSync(join(workspace.request.workspacePath, "result.txt"), "private result\n");

    await workspace.dispose();

    expect(readFileSync(join(workspace.request.outputPath, "result.txt"), "utf8")).toBe("private result\n");
    expect(existsSync(workspace.request.workspacePath)).toBe(false);
  });

  test("rejects paths outside the benchmark storage root", async () => {
    const isolation = new DockerIsolationProvider({ image: "aibench/agent-runner:test" });

    await expect(isolation.prepare(request({ fixturesPath: "/tmp/not-aibench-fixtures" }))).rejects.toThrow(/storage root/i);
  });

  test.runIf(process.env.AIBENCH_DOCKER_TESTS === "1")("runs a harmless fixture only when Docker tests are explicitly enabled", async () => {
    const isolation = new DockerIsolationProvider({
      image: process.env.AIBENCH_DOCKER_IMAGE ?? "aibench/agent-runner:local",
    });
    const workspace = await isolation.prepare(request());
    const fixture = join(workspace.request.fixturesPath, "input.txt");
    writeFileSync(fixture, "fixture stays unchanged\n");

    const events = [];
    for await (const event of workspace.exec({
      executable: "sh",
      args: ["-c", "test -r /fixtures/input.txt && test ! -w /fixtures && printf ok > /output/result.txt"],
    })) events.push(event);
    await workspace.dispose();

    expect(events).toContainEqual({ type: "exit", exitCode: 0 });
    expect(readFileSync(fixture, "utf8")).toBe("fixture stays unchanged\n");
    expect(readFileSync(join(workspace.request.outputPath, "result.txt"), "utf8")).toBe("ok");
    expect(existsSync(workspace.request.workspacePath)).toBe(false);
  });
});

describe("native isolation contract", () => {
  test("rejects an official run", async () => {
    const isolation = new NativeIsolationProvider();

    await expect(isolation.prepare(request())).rejects.toThrow(/experimental-native/i);
  });

  test("labels every native workspace as experimental and disposes it", async () => {
    const isolation = new NativeIsolationProvider();
    const workspace = await isolation.prepare(request({ executionClass: "experimental-native" }));

    expect(workspace.executionClass).toBe("experimental-native");
    await workspace.dispose();
    const execution = workspace.exec({ executable: "true", args: [] })[Symbol.asyncIterator]();
    await expect(execution.next()).rejects.toThrow(/disposed/i);
  });

  test("terminates a native child when its workspace is disposed", async () => {
    const isolation = new NativeIsolationProvider();
    const workspace = await isolation.prepare(request({ executionClass: "experimental-native" }));
    const execution = workspace.exec({ executable: "sh", args: ["-c", "printf ready; sleep 30"] })[Symbol.asyncIterator]();

    await expect(execution.next()).resolves.toMatchObject({ value: { type: "stdout", data: "ready" } });
    await workspace.dispose();

    const stopped = await Promise.race([
      execution.next(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("child was not terminated")), 500)),
    ]);
    expect(stopped).toMatchObject({ value: { type: "exit" } });
  });
});
