import { describe, expect, test } from "vitest";
import { assertTransition } from "../src/index.js";

const allowed: Record<string, string[]> = {
  PENDING: ["PREFLIGHT"],
  PREFLIGHT: ["RUNNING", "INFRA_ERROR"],
  RUNNING: ["VALIDATING", "FAILED", "TIMEOUT", "PARTIAL", "INFRA_ERROR"],
  VALIDATING: ["READY_FOR_REVIEW", "FAILED", "PARTIAL", "INFRA_ERROR"],
  READY_FOR_REVIEW: ["PUBLISHED", "REJECTED_FOR_PUBLICATION"],
  INFRA_ERROR: ["PREFLIGHT"],
  PUBLISHED: [],
  FAILED: [],
  TIMEOUT: [],
  PARTIAL: [],
  REJECTED_FOR_PUBLICATION: [],
};

describe("run state machine", () => {
  test("accepts every declared forward transition", () => {
    for (const [current, nextStates] of Object.entries(allowed)) {
      for (const next of nextStates) {
        expect(() => assertTransition(current, next)).not.toThrow();
      }
    }
  });

  test("rejects regressions and mutation of terminal model outcomes", () => {
    for (const [current, nextStates] of Object.entries(allowed)) {
      for (const candidate of Object.keys(allowed)) {
        if (!nextStates.includes(candidate)) {
          expect(() => assertTransition(current, candidate)).toThrow(/transition/i);
        }
      }
    }
  });
});
