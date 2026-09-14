import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ApprovalRecord } from "./approval.js";

function parseApprovalRecord(input: unknown): ApprovalRecord {
  if (!input || typeof input !== "object") throw new Error("Invalid approval record");
  const record = input as Record<string, unknown>;
  const fields = ["candidateId", "packageHash", "approvedPackageHash", "reviewer", "approvedAt"] as const;
  if (!fields.every((field) => typeof record[field] === "string" && record[field].length > 0)) {
    throw new Error("Invalid approval record");
  }
  if (record.packageHash !== record.approvedPackageHash) {
    throw new Error("Approval record does not match its approved package digest");
  }
  return {
    candidateId: record.candidateId as string,
    packageHash: record.packageHash as string,
    approvedPackageHash: record.approvedPackageHash as string,
    reviewer: record.reviewer as string,
    approvedAt: record.approvedAt as string,
  };
}

export async function saveApprovalRecord(candidateRoot: string, approval: ApprovalRecord): Promise<void> {
  await mkdir(candidateRoot, { recursive: true });
  await writeFile(join(candidateRoot, "approval.json"), `${JSON.stringify(parseApprovalRecord(approval), null, 2)}\n`, { flag: "wx" });
}

export async function loadApprovalRecord(candidateRoot: string): Promise<ApprovalRecord> {
  return parseApprovalRecord(JSON.parse(await readFile(join(candidateRoot, "approval.json"), "utf8")));
}
