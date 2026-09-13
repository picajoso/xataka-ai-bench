export type FindingSeverity = "block" | "review";

export type ScanFinding = {
  ruleId: "secret.bearer" | "secret.api-key" | "file.environment" | "file.ssh-private-key" | "path.local";
  severity: FindingSeverity;
  file: string;
  byteStart: number;
  byteEnd: number;
  excerpt: string | null;
};

export type ScanReport = {
  blocked: boolean;
  findings: ScanFinding[];
};
