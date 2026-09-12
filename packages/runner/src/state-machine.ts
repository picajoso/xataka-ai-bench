import { type RunManifest } from "@aibench/contracts";

export type RunStatus = RunManifest["status"];

const transitions: Readonly<Record<RunStatus, readonly RunStatus[]>> = {
  PENDING: ["PREFLIGHT"],
  PREFLIGHT: ["RUNNING", "INFRA_ERROR"],
  RUNNING: ["VALIDATING", "FAILED", "TIMEOUT", "PARTIAL", "INFRA_ERROR"],
  VALIDATING: ["READY_FOR_REVIEW", "FAILED", "PARTIAL", "INFRA_ERROR"],
  READY_FOR_REVIEW: ["PUBLISHED", "REJECTED_FOR_PUBLICATION"],
  PUBLISHED: [],
  FAILED: [],
  TIMEOUT: [],
  PARTIAL: [],
  REJECTED_FOR_PUBLICATION: [],
  INFRA_ERROR: ["PREFLIGHT"],
};

export function assertTransition(current: string, next: string): asserts next is RunStatus {
  const allowed = transitions[current as RunStatus];
  if (!allowed?.includes(next as RunStatus)) {
    throw new Error(`Invalid run transition: ${current} -> ${next}`);
  }
}
