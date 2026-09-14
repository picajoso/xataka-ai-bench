import { spawn, type ChildProcess } from "node:child_process";
import { cp, mkdir, readdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { assertRequestPathsWithinStorageRoot, type IsolationProvider, type IsolatedWorkspace, type IsolationRequest, type ProcessCommand, type ProcessEvent } from "./types.js";
import { DockerNetworkProvisioner, type DockerCommandExecutor, type NetworkLease, type NetworkProvisioner } from "../network/docker-network.js";

export interface DockerIsolationOptions {
  image: string;
  dockerExecutable?: string;
  proxyImage?: string;
  networkProvisioner?: NetworkProvisioner;
}

export class DockerIsolationProvider implements IsolationProvider {
  readonly #image: string;
  readonly #dockerExecutable: string;
  readonly #networkProvisioner: NetworkProvisioner;

  constructor(options: DockerIsolationOptions) {
    this.#image = options.image;
    this.#dockerExecutable = options.dockerExecutable ?? "docker";
    this.#networkProvisioner = options.networkProvisioner ?? new DockerNetworkProvisioner({
      proxyImage: options.proxyImage ?? "aibench/network-proxy:1.0.1",
      execute: this.#dockerCommandExecutor(),
    });
  }

  async prepare(request: IsolationRequest): Promise<IsolatedWorkspace> {
    if (request.executionClass !== "official-container") {
      throw new Error("Docker isolation requires executionClass: official-container");
    }
    assertRequestPathsWithinStorageRoot(request);
    await Promise.all([mkdir(request.workspacePath, { recursive: true }), mkdir(request.outputPath, { recursive: true })]);
    const networkLease = await this.#networkProvisioner.create({
      runId: request.runId,
      policy: request.networkPolicy,
      endpoints: request.privateEndpoints ?? [],
    });
    return new DockerWorkspace(request, this.#image, this.#dockerExecutable, networkLease);
  }

  #dockerCommandExecutor(): DockerCommandExecutor {
    return async (args, environment) => new Promise<void>((resolve, reject) => {
      const child = spawn(this.#dockerExecutable, args, { stdio: "ignore", env: { ...process.env, ...environment } });
      child.once("error", reject);
      child.once("close", (exitCode) => exitCode === 0 ? resolve() : reject(new Error("Docker network resource command failed")));
    });
  }
}

class DockerWorkspace implements IsolatedWorkspace {
  #disposed = false;
  readonly #children = new Set<ChildProcess>();
  readonly #image: string;
  readonly #dockerExecutable: string;
  readonly #networkLease: NetworkLease | null;

  constructor(
    readonly request: IsolationRequest,
    image: string,
    dockerExecutable: string,
    networkLease: NetworkLease | null,
  ) {
    this.#image = image;
    this.#dockerExecutable = dockerExecutable;
    this.#networkLease = networkLease;
  }

  readonly executionClass = "official-container" as const;

  commandFor(command: ProcessCommand): string[] {
    this.#assertActive();
    const passedEnvironment = Object.keys(command.env ?? {}).sort().flatMap((name) => ["--env", name]);
    return [
      this.#dockerExecutable, "run", "--rm", "--read-only",
      "--user", "10001:10001",
      "--pids-limit", String(this.request.limits.pids),
      "--cpus", String(this.request.limits.cpu),
      "--memory", `${this.request.limits.memoryMb}m`,
      "--network", this.#networkLease?.agentNetwork ?? "none",
      "--mount", `type=bind,src=${this.request.fixturesPath},dst=/fixtures,readonly`,
      "--mount", `type=bind,src=${this.request.workspacePath},dst=/workspace`,
      "--mount", `type=bind,src=${this.request.outputPath},dst=/output`,
      "--workdir", "/workspace",
      ...passedEnvironment,
      this.#image,
      command.executable,
      ...command.args,
    ];
  }

  async *exec(command: ProcessCommand): AsyncIterable<ProcessEvent> {
    const args = this.commandFor(command);
    const [executable, ...dockerArgs] = args;
    if (executable === undefined) throw new Error("Docker command is missing its executable");
    const child = spawn(executable, dockerArgs, { cwd: command.cwd, env: { ...process.env, ...command.env } });
    this.#children.add(child);
    const exit = new Promise<number | null>((resolve, reject) => {
      child.once("error", reject);
      child.once("close", resolve);
    });
    try {
      for await (const data of child.stdout ?? []) yield { type: "stdout", data: data.toString() };
      for await (const data of child.stderr ?? []) yield { type: "stderr", data: data.toString() };
      yield { type: "exit", exitCode: await exit };
    } finally {
      this.#children.delete(child);
    }
  }

  async dispose(): Promise<void> {
    this.#disposed = true;
    for (const child of this.#children) child.kill("SIGTERM");
    await this.#networkLease?.dispose();
    await this.#preserveWorkspace();
    await rm(this.request.workspacePath, { recursive: true, force: true });
  }

  async #preserveWorkspace(): Promise<void> {
    const entries = await readdir(this.request.workspacePath);
    await Promise.all(entries.map(async (entry) => cp(
      resolve(this.request.workspacePath, entry),
      resolve(this.request.outputPath, entry),
      { recursive: true, force: true },
    )));
  }

  #assertActive(): void {
    if (this.#disposed) throw new Error("isolated workspace has been disposed");
  }
}
