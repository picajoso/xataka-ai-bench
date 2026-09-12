import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { assertRequestPathsWithinStorageRoot, type IsolationProvider, type IsolatedWorkspace, type IsolationRequest, type ProcessCommand, type ProcessEvent } from "./types.js";

export interface DockerIsolationOptions {
  image: string;
  dockerExecutable?: string;
}

const networkNames = {
  blocked: "none",
  "package-registries": "aibench-package-registry",
  "package-registries-and-local-endpoint": "aibench-package-registry-and-local",
} as const;

export class DockerIsolationProvider implements IsolationProvider {
  readonly #image: string;
  readonly #dockerExecutable: string;

  constructor(options: DockerIsolationOptions) {
    this.#image = options.image;
    this.#dockerExecutable = options.dockerExecutable ?? "docker";
  }

  async prepare(request: IsolationRequest): Promise<IsolatedWorkspace> {
    if (request.executionClass !== "official-container") {
      throw new Error("Docker isolation requires executionClass: official-container");
    }
    assertRequestPathsWithinStorageRoot(request);
    await Promise.all([mkdir(request.workspacePath, { recursive: true }), mkdir(request.outputPath, { recursive: true })]);
    return new DockerWorkspace(request, this.#image, this.#dockerExecutable);
  }
}

class DockerWorkspace implements IsolatedWorkspace {
  #disposed = false;
  readonly #children = new Set<ChildProcess>();
  readonly #image: string;
  readonly #dockerExecutable: string;

  constructor(
    readonly request: IsolationRequest,
    image: string,
    dockerExecutable: string,
  ) {
    this.#image = image;
    this.#dockerExecutable = dockerExecutable;
  }

  readonly executionClass = "official-container" as const;

  commandFor(command: ProcessCommand): string[] {
    this.#assertActive();
    return [
      this.#dockerExecutable, "run", "--rm", "--read-only",
      "--user", "10001:10001",
      "--pids-limit", String(this.request.limits.pids),
      "--cpus", String(this.request.limits.cpu),
      "--memory", `${this.request.limits.memoryMb}m`,
      "--network", networkNames[this.request.networkPolicy],
      "--mount", `type=bind,src=${this.request.fixturesPath},dst=/fixtures,readonly`,
      "--mount", `type=bind,src=${this.request.workspacePath},dst=/workspace`,
      "--mount", `type=bind,src=${this.request.outputPath},dst=/output`,
      "--workdir", "/workspace",
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
    await rm(this.request.workspacePath, { recursive: true, force: true });
  }

  #assertActive(): void {
    if (this.#disposed) throw new Error("isolated workspace has been disposed");
  }
}
