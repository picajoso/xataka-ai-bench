import { createHash } from "node:crypto";
import { lstat, readFile, readdir, readlink, realpath } from "node:fs/promises";
import { basename, extname, isAbsolute, relative, resolve, sep } from "node:path";

const textExtensions = new Set([
  ".c", ".conf", ".cpp", ".css", ".csv", ".go", ".h", ".hpp", ".html",
  ".ini", ".java", ".js", ".json", ".jsx", ".md", ".mjs", ".php",
  ".properties", ".py", ".rb", ".rs", ".sh", ".sql", ".svelte", ".svg",
  ".toml", ".ts", ".tsx", ".txt", ".vue", ".xml", ".yaml", ".yml",
]);
const textBasenames = new Set([
  ".gitignore", ".node-version", ".npmrc", ".nvmrc", "Dockerfile", "LICENSE", "Makefile",
]);

function digest(content: string | Buffer): string {
  return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}

function mediaClass(path: string): "text" | "binary" {
  return textExtensions.has(extname(path).toLowerCase()) || textBasenames.has(basename(path))
    ? "text"
    : "binary";
}

function normalizedText(content: Buffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(content).replace(/\r\n?/g, "\n");
  } catch {
    throw new Error("Declared text file contains invalid UTF-8");
  }
}

function compareUtf8(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left), Buffer.from(right));
}

export async function hashFile(path: string): Promise<string> {
  const metadata = await lstat(path);
  if (!metadata.isFile()) throw new Error(`Cannot hash non-file path: ${path}`);
  const content = await readFile(path);
  return digest(mediaClass(path) === "text" ? normalizedText(content) : content);
}

type HashEntry = {
  path: string;
  mediaClass: "text" | "binary" | "symlink";
  sha256: string;
};

export async function hashDirectory(path: string): Promise<string> {
  const root = await realpath(path);
  const entries: HashEntry[] = [];

  async function walk(directory: string): Promise<void> {
    const children = (await readdir(directory, { withFileTypes: true }))
      .sort((left, right) => compareUtf8(left.name, right.name));

    for (const child of children) {
      const absolutePath = resolve(directory, child.name);
      const relativePath = relative(root, absolutePath).split(sep).join("/");
      if (child.isDirectory()) {
        await walk(absolutePath);
      } else if (child.isFile()) {
        entries.push({
          path: relativePath,
          mediaClass: mediaClass(absolutePath),
          sha256: await hashFile(absolutePath),
        });
      } else if (child.isSymbolicLink()) {
        const resolvedTarget = await realpath(absolutePath);
        const targetRelativeToRoot = relative(root, resolvedTarget);
        if (targetRelativeToRoot.startsWith(`..${sep}`) || targetRelativeToRoot === ".." || isAbsolute(targetRelativeToRoot)) {
          throw new Error(`Symlink resolves outside hashed directory: ${relativePath}`);
        }
        entries.push({
          path: relativePath,
          mediaClass: "symlink",
          sha256: digest(await readlink(absolutePath)),
        });
      } else {
        throw new Error(`Unsupported directory entry: ${relativePath}`);
      }
    }
  }

  await walk(root);
  entries.sort((left, right) => compareUtf8(left.path, right.path));
  return digest(JSON.stringify({ schemaVersion: "1.0.0", entries }));
}
