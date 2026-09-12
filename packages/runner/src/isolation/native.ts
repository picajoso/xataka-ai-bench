import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { assertRequestPathsWithinStorageRoot, type IsolationProvider, type IsolatedWorkspace, type IsolationRequest, type ProcessCommand, type ProcessEvent } from "./types.js";

export class NativeIsolationProvider implements IsolationProvider {
  async prepare(request: IsolationRequest): Promise<IsolatedWorkspace> {
    if (request.executionClass !== "experimental-native") {
      throw new Error("Native isolation is only available with executionClass: experimental-native");
    }
    assertRequestPathsWithinStorageRoot(request);
    await Promise.all([mkdir(request.workspacePath, { recursive: true }), mkdir(request.outputPath, { recursive: true })]);
    return new NativeWorkspace(request);
  }
}

class NativeWorkspace implements IsolatedWorkspace {
  #disposed = false;
  readonly #children = new Map<ChildProcess, Promise<void>>();

  constructor(readonly request: IsolationRequest) {}

  readonly executionClass = "experimental-native" as const;

  commandFor(command: ProcessCommand): string[] {
    this.#assertActive();
    return [command.executable, ...command.args];
  }

  async *exec(command: ProcessCommand): AsyncIterable<ProcessEvent> {
    this.#assertActive();
    const child = spawn(command.executable, command.args, {
      cwd: command.cwd ?? this.request.workspacePath,
      env: { ...process.env, ...command.env },
      detached: process.platform !== "win32",
    });
    const exit = new Promise<number | null>((resolve, reject) => {
      child.once("error", reject);
      child.once("close", resolve);
    });
    const settled = exit.then(() => undefined, () => undefined);
    this.#children.set(child, settled);
    void settled.finally(() => this.#children.delete(child));
    for await (const data of child.stdout ?? []) yield { type: "stdout", data: data.toString() };
    for await (const data of child.stderr ?? []) yield { type: "stderr", data: data.toString() };
    yield { type: "exit", exitCode: await exit };
  }

  async dispose(): Promise<void> {
    this.#disposed = true;
    await terminateChildren(this.#children);
    await rm(this.request.workspacePath, { recursive: true, force: true });
  }

  #assertActive(): void {
    if (this.#disposed) throw new Error("isolated workspace has been disposed");
  }
}

async function terminateChildren(children: Map<ChildProcess, Promise<void>>): Promise<void> {
  for (const child of children.keys()) signalProcessTree(child, "SIGTERM");
  await Promise.race([Promise.all(children.values()), delay(100)]);
  for (const child of children.keys()) signalProcessTree(child, "SIGKILL");
  await Promise.all(children.values());
}

function signalProcessTree(child: ChildProcess, signal: NodeJS.Signals): void {
  if (child.pid === undefined) return;
  try {
    if (process.platform === "win32") child.kill(signal);
    else process.kill(-child.pid, signal);
  } catch {
    child.kill(signal);
  }
}
