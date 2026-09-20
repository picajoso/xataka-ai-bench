import { readdir, realpath } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";

export type LegacyClassification = "generated" | "repositoryMetadata" | "evidence" | "source" | "unknown";
export type LegacyInventory = { entries: Array<{ path: string; classification: LegacyClassification }>; counts: Record<LegacyClassification, number> };

const generatedDirectories = new Set(["node_modules", ".next", ".venv", ".gradle", "dist", "build"]);
const evidenceNames = new Set(["RESULTS.md"]);
const evidenceExtensions = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".mp4", ".webm"]);
const sourceExtensions = new Set([".js", ".mjs", ".cjs", ".ts", ".tsx", ".html", ".css", ".json", ".yaml", ".yml", ".md", ".gradle", ".properties", ".xml", ".kt", ".java", ".sh"]);

function classify(path: string): LegacyClassification {
  const parts = path.split("/");
  if (parts.includes(".git")) return "repositoryMetadata";
  if (parts.some((part) => generatedDirectories.has(part))) return "generated";
  if (evidenceNames.has(parts.at(-1) ?? "") || evidenceExtensions.has(extname(path).toLowerCase())) return "evidence";
  if (sourceExtensions.has(extname(path).toLowerCase()) || ["package-lock.json", "pnpm-lock.yaml", "README"].includes(parts.at(-1) ?? "")) return "source";
  return "unknown";
}

export async function inventoryLegacyTree(rootPath: string): Promise<LegacyInventory> {
  const root = await realpath(rootPath);
  const entries: LegacyInventory["entries"] = [];
  async function visit(directory: string): Promise<void> {
    for (const child of (await readdir(directory, { withFileTypes: true })).sort((a, b) => Buffer.compare(Buffer.from(a.name), Buffer.from(b.name)))) {
      const path = resolve(directory, child.name);
      if (child.isSymbolicLink()) continue;
      const relativePath = relative(root, path).split("/").join("/");
      const classification = classify(relativePath);
      if (child.isDirectory() && (classification === "generated" || classification === "repositoryMetadata")) {
        entries.push({ path: relativePath, classification });
      } else if (child.isDirectory()) await visit(path);
      else if (child.isFile()) entries.push({ path: relativePath, classification });
    }
  }
  await visit(root);
  entries.sort((a, b) => Buffer.compare(Buffer.from(a.path), Buffer.from(b.path)));
  const counts: LegacyInventory["counts"] = { generated: 0, repositoryMetadata: 0, evidence: 0, source: 0, unknown: 0 };
  for (const entry of entries) counts[entry.classification]++;
  return { entries, counts };
}
