import { z } from "zod";

const timestamp = z.iso.datetime({ offset: true });

export const AdapterEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("session.started"), timestamp, sessionId: z.string().min(1) }).strict(),
  z.object({ type: z.literal("message.delta"), timestamp, text: z.string() }).strict(),
  z.object({
    type: z.literal("tool.started"),
    timestamp,
    toolCallId: z.string().min(1),
    name: z.string().min(1),
    inputSummary: z.string(),
  }).strict(),
  z.object({
    type: z.literal("tool.finished"),
    timestamp,
    toolCallId: z.string().min(1),
    status: z.enum(["ok", "error"]),
    outputSummary: z.string(),
  }).strict(),
  z.object({
    type: z.literal("usage"),
    timestamp,
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    costUsd: z.number().nonnegative().nullable(),
  }).strict(),
  z.object({
    type: z.literal("diagnostic"),
    timestamp,
    stream: z.enum(["stderr", "system"]),
    level: z.enum(["info", "warning", "error"]),
    message: z.string(),
  }).strict(),
  z.object({
    type: z.literal("session.finished"),
    timestamp,
    outcome: z.enum(["success", "failed", "cancelled"]),
    exitCode: z.number().int().nullable(),
  }).strict(),
  z.object({
    type: z.literal("adapter.error"),
    timestamp,
    classification: z.enum(["malformed-event", "process-error", "cancelled", "timeout", "preflight"]),
    message: z.string().min(1),
  }).strict(),
]);

export type AdapterEvent = z.infer<typeof AdapterEventSchema>;

export type AdapterContext = {
  runId: string;
  prompt: string;
  workspaceRoot: string;
  environment: Readonly<Record<string, string>>;
  commandExecutor?: (command: { executable: string; args: string[]; cwd?: string; env?: Record<string, string> }) => AsyncIterable<
    { type: "stdout" | "stderr"; data: string } | { type: "exit"; exitCode: number | null }
  >;
  cancelExecution?: () => Promise<void>;
  rawEventSink?: (event: unknown) => Promise<void>;
};

export type PreflightReport = {
  ok: boolean;
  adapter: string;
  version: string;
  diagnostics: string[];
};

export interface AgentAdapter {
  readonly name: string;
  preflight(context: AdapterContext): Promise<PreflightReport>;
  start(context: AdapterContext): AsyncIterable<AdapterEvent>;
  cancel(reason: string): Promise<void>;
}
