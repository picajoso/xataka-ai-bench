import { createHash } from "node:crypto";
import { lstat, readFile, readdir, readlink, realpath } from "node:fs/promises";
import { basename, extname, isAbsolute, relative, resolve, sep } from "node:path";

const textExtensions = new Set([
  ".c", ".conf", ".cpp", ".cs", ".css", ".csv", ".go", ".h", ".hpp", ".html",
  ".ini", ".java", ".js", ".json", ".jsx", ".kt", ".lua", ".md", ".mjs",
  ".php", ".properties", ".py", ".rb", ".rs", ".sh", ".sql", ".svelte",
  ".svg", ".swift", ".toml", ".ts", ".tsx", ".txt", ".vue", ".xml",
  ".yaml", ".yml",
]);
const textBasenames = new Set([
  ".gitignore", ".node-version", ".npmrc", ".nvmrc", "COPYING", "Dockerfile", "LICENSE", "Makefile", "README",
]);
const binaryExtensions = new Set([
  ".7z", ".bin", ".bmp", ".bz2", ".class", ".dmg", ".doc", ".docx", ".eot",
  ".gif", ".gz", ".ico", ".jar", ".jpeg", ".jpg", ".mov", ".mp3", ".mp4",
  ".otf", ".pdf", ".png", ".ppt", ".pptx", ".tar", ".tif", ".tiff", ".ttf",
  ".wasm", ".webm", ".webp", ".woff", ".woff2", ".xls", ".xlsx", ".xz", ".zip",
]);

function digest(content: string | Buffer): string {
  return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}

function decodesAsPlainText(content: Buffer): boolean {
  try {
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(content);
    return !Array.from(decoded).some((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint <= 8 || codePoint === 11 || codePoint === 12 || (codePoint >= 14 && codePoint <= 31);
    });
  } catch {
    return false;
  }
}

function mediaClass(path: string, content: Buffer): "text" | "binary" {
  const extension = extname(path).toLowerCase();
  if (textExtensions.has(extension) || textBasenames.has(basename(path))) return "text";
  if (binaryExtensions.has(extension)) return "binary";
  return decodesAsPlainText(content) ? "text" : "binary";
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

export async function hashFile(path: string, declaredMediaClass?: "text" | "binary"): Promise<string> {
  const metadata = await lstat(path);
  if (!metadata.isFile()) throw new Error(`Cannot hash non-file path: ${path}`);
  const content = await readFile(path);
  const classification = declaredMediaClass ?? mediaClass(path, content);
  return digest(classification === "text" ? normalizedText(content) : content);
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
        const content = await readFile(absolutePath);
        entries.push({
          path: relativePath,
          mediaClass: mediaClass(absolutePath, content),
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
