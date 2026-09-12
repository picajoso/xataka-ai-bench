import { randomBytes as secureRandomBytes } from "node:crypto";
import { mkdir, open, readFile, rename } from "node:fs/promises";
import { join } from "node:path";
import {
  parseRunManifest,
  RunEventSchema,
  type RunEvent,
  type RunManifest,
} from "@aibench/contracts";
import { createRunId, createTechnicalAttemptId, type RandomBytes } from "./ids.js";
import { assertTransition, type RunStatus } from "./state-machine.js";

export type CreateRunPlan = Pick<RunManifest, "benchmark" | "system" | "attempt" | "executionClass">;

export type RunHandle = {
  runId: string;
  directory: string;
  manifest: RunManifest;
};

export type TransitionReason = NonNullable<RunManifest["failure"]>;

export type RunStoreOptions = {
  runsRoot: string;
  clock?: () => Date;
  randomBytes?: RandomBytes;
};

type EventInput = Pick<RunEvent, "type" | "payload">;

function needsFailure(status: RunStatus): boolean {
  return ["FAILED", "TIMEOUT", "PARTIAL", "INFRA_ERROR"].includes(status);
}

function isTerminal(status: RunStatus): boolean {
  return ["READY_FOR_REVIEW", "PUBLISHED", "FAILED", "TIMEOUT", "PARTIAL", "REJECTED_FOR_PUBLICATION", "INFRA_ERROR"].includes(status);
}

export class RunStore {
  readonly #runsRoot: string;
  readonly #clock: () => Date;
  readonly #randomBytes: RandomBytes;
  readonly #queues = new Map<string, Promise<unknown>>();

  constructor(options: RunStoreOptions) {
    this.#runsRoot = options.runsRoot;
    this.#clock = options.clock ?? (() => new Date());
    this.#randomBytes = options.randomBytes ?? secureRandomBytes;
  }

  async createRun(plan: CreateRunPlan): Promise<RunHandle> {
    const now = this.#clock();
    const runId = createRunId(now, plan.benchmark.slug, plan.system.slug, this.#randomBytes);
    const directory = join(this.#runsRoot, runId);
    await mkdir(directory, { recursive: false });
    const manifest = parseRunManifest({
      schemaVersion: "1.0.0",
      runId,
      technicalAttemptId: createTechnicalAttemptId(this.#randomBytes),
      createdAt: now.toISOString(),
      benchmark: plan.benchmark,
      system: plan.system,
      attempt: plan.attempt,
      executionClass: plan.executionClass,
      status: "PENDING",
      startedAt: null,
      finishedAt: null,
      failure: null,
      publicationStatus: "private",
    });
    await this.#writeManifest(directory, manifest);
    await this.appendEvent(runId, { type: "status", payload: { status: "PENDING" } });
    return { runId, directory, manifest };
  }

  async loadRun(runId: string): Promise<RunManifest> {
    const contents = await readFile(this.#manifestPath(runId), "utf8");
    return parseRunManifest(JSON.parse(contents));
  }

  async appendEvent(runId: string, event: EventInput): Promise<void> {
    await this.#serialize(runId, () => this.#appendEvent(runId, event));
  }

  async transition(runId: string, nextStatus: RunStatus, reason?: TransitionReason): Promise<RunManifest> {
    return this.#serialize(runId, async () => {
      const current = await this.loadRun(runId);
      assertTransition(current.status, nextStatus);
      if (needsFailure(nextStatus) && !reason) {
        throw new Error(`Transition to ${nextStatus} requires a failure classification`);
      }
      if (!needsFailure(nextStatus) && reason) {
        throw new Error(`Transition to ${nextStatus} cannot include a failure classification`);
      }
      const now = this.#clock().toISOString();
      const retriedInfrastructure = current.status === "INFRA_ERROR" && nextStatus === "PREFLIGHT";
      const next = parseRunManifest({
        ...current,
        technicalAttemptId: retriedInfrastructure ? createTechnicalAttemptId(this.#randomBytes) : current.technicalAttemptId,
        status: nextStatus,
        startedAt: nextStatus === "PREFLIGHT" ? now : current.startedAt,
        finishedAt: isTerminal(nextStatus) ? now : null,
        failure: needsFailure(nextStatus) ? reason : null,
        publicationStatus: nextStatus === "PUBLISHED"
          ? "published"
          : nextStatus === "REJECTED_FOR_PUBLICATION"
            ? "rejected"
            : current.publicationStatus,
      });
      await this.#writeManifest(this.#directory(runId), next);
      await this.#appendEvent(runId, { type: "status", payload: { from: current.status, to: nextStatus } });
      return next;
    });
  }

  async reconcile(runId: string): Promise<void> {
    const eventsPath = this.#eventsPath(runId);
    const contents = await readFile(eventsPath, "utf8");
    if (!contents.endsWith("\n")) {
      const handle = await open(eventsPath, "a");
      try {
        await handle.write("\n");
        await handle.sync();
      } finally {
        await handle.close();
      }
      await this.appendEvent(runId, {
        type: "terminal-correction",
        payload: { reason: "truncated JSONL line preserved during reconciliation" },
      });
    }
  }

  #directory(runId: string): string {
    return join(this.#runsRoot, runId);
  }

  #manifestPath(runId: string): string {
    return join(this.#directory(runId), "manifest.json");
  }

  #eventsPath(runId: string): string {
    return join(this.#directory(runId), "events.jsonl");
  }

  async #writeManifest(directory: string, manifest: RunManifest): Promise<void> {
    const temporaryPath = join(directory, `.manifest.${process.pid}.${this.#randomBytes(3).toString("hex")}.tmp`);
    const handle = await open(temporaryPath, "wx");
    try {
      await handle.writeFile(`${JSON.stringify(manifest, null, 2)}\n`);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporaryPath, join(directory, "manifest.json"));
  }

  async #appendEvent(runId: string, event: EventInput): Promise<void> {
    const eventsPath = this.#eventsPath(runId);
    const existing = await this.#readValidEvents(runId);
    const sequence = existing.length === 0 ? 0 : Math.max(...existing.map((entry) => entry.sequence)) + 1;
    const record: RunEvent = {
      schemaVersion: "1.0.0",
      runId,
      sequence,
      timestamp: this.#clock().toISOString(),
      type: event.type,
      payload: event.payload,
    };
    const handle = await open(eventsPath, "a");
    try {
      await handle.write(`${JSON.stringify(record)}\n`);
      await handle.sync();
    } finally {
      await handle.close();
    }
  }

  async #readValidEvents(runId: string): Promise<RunEvent[]> {
    try {
      const contents = await readFile(this.#eventsPath(runId), "utf8");
      return contents.split("\n").flatMap((line) => {
        if (!line.trim()) return [];
        try {
          const result = RunEventSchema.safeParse(JSON.parse(line) as unknown);
          return result.success ? [result.data] : [];
        } catch {
          return [];
        }
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
  }

  async #serialize<T>(runId: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.#queues.get(runId) ?? Promise.resolve();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const queued = previous.then(() => gate);
    this.#queues.set(runId, queued);
    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (this.#queues.get(runId) === queued) this.#queues.delete(runId);
    }
  }
}
