export type ApprovalInput = {
  candidateId: string;
  packageHash: string;
  reviewer: string;
  approvedAt: string;
  approvedPackageHash?: string;
};

export type ApprovalRecord = Required<ApprovalInput>;

export function approveCandidate(input: ApprovalInput): ApprovalRecord {
  if (input.approvedPackageHash && input.packageHash !== input.approvedPackageHash) {
    throw new Error("An approval is immutable and cannot be reused after a package digest changes");
  }
  return { ...input, approvedPackageHash: input.packageHash };
}
