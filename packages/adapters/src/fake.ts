import { lstat, mkdir, realpath, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { AdapterEventSchema, type AdapterContext, type AdapterEvent, type AgentAdapter, type PreflightReport } from "./types.js";

type FileChange = {
  path: string;
  content: string | Uint8Array;
};

export type FakeAdapterOptions = {
  events: unknown[];
  fileChanges?: FileChange[];
  clock?: () => Date;
  preflight?: PreflightReport;
};

function isContained(root: string, candidate: string): boolean {
  const pathFromRoot = relative(root, candidate);
  return pathFromRoot !== ".." && !pathFromRoot.startsWith(`..${sep}`) && !isAbsolute(pathFromRoot);
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ENOENT" ? Promise.reject(error) : false;
  }
}

async function writeConfined(rootPath: string, change: FileChange): Promise<void> {
  const root = await realpath(rootPath);
  const destination = resolve(root, change.path);
  if (!isContained(root, destination) || destination === root) {
    throw new Error(`File change is outside workspace: ${change.path}`);
  }

  const parentRelative = relative(root, dirname(destination));
  let current = root;
  for (const segment of parentRelative.split(sep).filter(Boolean)) {
    current = resolve(current, segment);
    if (await pathExists(current)) {
      const metadata = await lstat(current);
      if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
        throw new Error(`File change crosses an unsafe path: ${change.path}`);
      }
    } else {
      await mkdir(current);
    }
  }

  if (await pathExists(destination)) {
    const metadata = await lstat(destination);
    if (!metadata.isFile() || metadata.isSymbolicLink()) {
      throw new Error(`File change targets an unsafe path: ${change.path}`);
    }
  }
  await writeFile(destination, change.content);
}

function delayed(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (milliseconds <= 0) return Promise.resolve();
  return new Promise((resolveDelay, rejectDelay) => {
    const timer = setTimeout(resolveDelay, milliseconds);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      rejectDelay(signal.reason);
    }, { once: true });
  });
}

export class FakeAdapter implements AgentAdapter {
  readonly name = "fake";
  readonly #options: FakeAdapterOptions;
  #controller: AbortController | undefined;
  #cancelReason = "cancelled";

  constructor(options: FakeAdapterOptions) {
    this.#options = options;
  }

  async preflight(context: AdapterContext): Promise<PreflightReport> {
    void context;
    return this.#options.preflight ?? {
      ok: true,
      adapter: this.name,
      version: "1.0.0",
      diagnostics: [],
    };
  }

  async *start(context: AdapterContext): AsyncIterable<AdapterEvent> {
    if (this.#controller) throw new Error("Fake adapter is already running");
    this.#controller = new AbortController();
    const controller = this.#controller;
    const now = this.#options.clock ?? (() => new Date());

    try {
      for (const change of this.#options.fileChanges ?? []) await writeConfined(context.workspaceRoot, change);

      for (const scripted of this.#options.events) {
        const record = typeof scripted === "object" && scripted !== null
          ? scripted as Record<string, unknown>
          : {};
        const { afterMs, ...eventFields } = record;
        await delayed(typeof afterMs === "number" ? afterMs : 0, controller.signal);
        const eventTimestamp = now().toISOString();
        const parsed = AdapterEventSchema.safeParse({ ...eventFields, timestamp: eventTimestamp });
        if (!parsed.success) {
          yield {
            type: "adapter.error",
            timestamp: eventTimestamp,
            classification: "malformed-event",
            message: "Fake adapter received a malformed scripted event",
          };
          continue;
        }
        yield parsed.data;
      }
    } catch (error) {
      if (!controller.signal.aborted) throw error;
      yield {
        type: "adapter.error",
        timestamp: now().toISOString(),
        classification: "cancelled",
        message: this.#cancelReason,
      };
      yield {
        type: "session.finished",
        timestamp: now().toISOString(),
        outcome: "cancelled",
        exitCode: null,
      };
    } finally {
      if (this.#controller === controller) this.#controller = undefined;
    }
  }

  async cancel(reason: string): Promise<void> {
    this.#cancelReason = reason;
    this.#controller?.abort(new Error(reason));
  }
}
