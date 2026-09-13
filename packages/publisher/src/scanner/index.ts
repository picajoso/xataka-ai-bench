import { readdir, readFile } from "node:fs/promises";
import { basename, relative, resolve } from "node:path";
import { findLocalPaths } from "./paths.js";
import { findApiKeys, findBearerSecrets } from "./secrets.js";
import type { ScanFinding, ScanReport } from "./types.js";

const maximumTextBytes = 1024 * 1024;

function isEnvironmentFile(path: string): boolean {
  const name = basename(path);
  return name === ".env" || name.startsWith(".env.");
}

function isSshPrivateKeyFile(path: string): boolean {
  return new Set(["id_rsa", "id_ecdsa", "id_ed25519", "id_dsa"]).has(basename(path));
}

function isText(buffer: Buffer): boolean {
  return !buffer.includes(0);
}

async function filesUnder(root: string): Promise<string[]> {
  const files: string[] = [];
  async function visit(directory: string): Promise<void> {
    for (const child of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, child.name);
      if (child.isSymbolicLink()) continue;
      if (child.isDirectory()) await visit(path);
      if (child.isFile()) files.push(path);
    }
  }
  await visit(root);
  return files.sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right)));
}

export async function scanCandidate(rootPath: string): Promise<ScanReport> {
  const root = resolve(rootPath);
  const findings: ScanFinding[] = [];
  for (const filePath of await filesUnder(root)) {
    const file = relative(root, filePath).split("/").join("/");
    if (isEnvironmentFile(filePath)) {
      findings.push({ ruleId: "file.environment", severity: "block", file, byteStart: 0, byteEnd: 0, excerpt: null });
      continue;
    }
    if (isSshPrivateKeyFile(filePath)) {
      findings.push({ ruleId: "file.ssh-private-key", severity: "block", file, byteStart: 0, byteEnd: 0, excerpt: null });
      continue;
    }
    const content = await readFile(filePath);
    if (content.byteLength > maximumTextBytes || !isText(content)) continue;
    const text = content.toString("utf8");
    for (const match of findBearerSecrets(text)) {
      findings.push({ ruleId: "secret.bearer", severity: "block", file, ...match, excerpt: null });
    }
    for (const match of findApiKeys(text)) {
      findings.push({ ruleId: "secret.api-key", severity: "block", file, ...match, excerpt: null });
    }
    for (const match of findLocalPaths(text)) {
      findings.push({ ruleId: "path.local", severity: "review", file, ...match });
    }
  }
  return { blocked: findings.some((finding) => finding.severity === "block"), findings };
}
