import { lstat, readFile, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

function localReference(reference: string): string | null {
  const value = reference.split(/[?#]/, 1)[0]!.trim();
  if (!value || value.startsWith("data:")) return null;
  if (/^(?:https?:)?\/\//i.test(value) || /^[a-z][a-z0-9+.-]*:/i.test(value) || isAbsolute(value)) return "";
  return value;
}

async function isSafeExistingPath(root: string, requested: string): Promise<boolean> {
  const candidate = resolve(root, requested);
  const relation = relative(root, candidate);
  if (!relation || relation === ".." || relation.startsWith("../") || isAbsolute(relation)) return false;
  try {
    const stat = await lstat(candidate);
    if (stat.isSymbolicLink() || !stat.isFile()) return false;
    const physicalRoot = await realpath(root);
    const physicalCandidate = await realpath(candidate);
    const physicalRelation = relative(physicalRoot, physicalCandidate);
    return physicalRelation !== ".." && !physicalRelation.startsWith("../") && !isAbsolute(physicalRelation);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

function referencedResources(html: string): string[] {
  const resources: string[] = [];
  const tags = /<(?:script|link)\b[^>]*>/gi;
  for (const tag of html.matchAll(tags)) {
    const attribute = /\b(?:src|href)\s*=\s*["']([^"']+)["']/i.exec(tag[0]);
    if (attribute?.[1]) resources.push(attribute[1]);
  }
  return resources;
}

export async function validateBrowserGameOutput(root: string): Promise<string | null> {
  if (!await isSafeExistingPath(root, "index.html")) return "Missing browser entrypoint: index.html";
  const html = await readFile(resolve(root, "index.html"), "utf8");
  for (const reference of referencedResources(html)) {
    const resource = localReference(reference);
    if (resource === null) continue;
    if (!resource) return `External or unsafe browser resource: ${reference}`;
    if (!await isSafeExistingPath(root, resource)) return `Missing local resource: ${resource}`;
  }
  return null;
}
