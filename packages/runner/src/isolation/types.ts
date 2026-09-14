import type { PrivateEndpoint } from "../network/types.js";

export type ExecutionClass = "official-container" | "experimental-native";

export type NetworkPolicy = "blocked" | "local-endpoint" | "package-registries" | "package-registries-and-local-endpoint";

export interface ResourceLimits {
  cpu: number;
  memoryMb: number;
  pids: number;
}

export interface IsolationRequest {
  runId: string;
  executionClass: ExecutionClass;
  storageRoot: string;
  fixturesPath: string;
  workspacePath: string;
  outputPath: string;
  privateConfigPath?: string;
  networkPolicy: NetworkPolicy;
  privateEndpoints?: PrivateEndpoint[];
  proxyVersion?: string;
  limits: ResourceLimits;
}

export interface ProcessCommand {
  executable: string;
  args: string[];
  cwd?: string;
  env?: Record<string, string>;
}

export type ProcessEvent =
  | { type: "stdout"; data: string }
  | { type: "stderr"; data: string }
  | { type: "exit"; exitCode: number | null };

export interface IsolatedWorkspace {
  readonly request: IsolationRequest;
  readonly executionClass: ExecutionClass;
  commandFor(command: ProcessCommand): string[];
  exec(command: ProcessCommand): AsyncIterable<ProcessEvent>;
  dispose(): Promise<void>;
}

export interface IsolationProvider {
  prepare(request: IsolationRequest): Promise<IsolatedWorkspace>;
}

export function assertRequestPathsWithinStorageRoot(request: IsolationRequest): void {
  for (const path of [request.fixturesPath, request.workspacePath, request.outputPath, request.privateConfigPath].filter((path): path is string => Boolean(path))) {
    const relation = relative(resolve(request.storageRoot), resolve(path));
    if (relation === "" || relation.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) || isAbsolute(relation)) {
      throw new Error("Isolation paths must be contained by the benchmark storage root");
    }
  }
}
import { isAbsolute, relative, resolve } from "node:path";
