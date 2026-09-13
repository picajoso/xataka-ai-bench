export type LocalPathMatch = { byteStart: number; byteEnd: number; excerpt: string };

export function findLocalPaths(text: string): LocalPathMatch[] {
  return [...text.matchAll(/\/Users\/[^\s"']+/g)].map((match) => ({
    byteStart: Buffer.byteLength(text.slice(0, match.index)),
    byteEnd: Buffer.byteLength(text.slice(0, (match.index ?? 0) + match[0].length)),
    excerpt: text.replace(match[0], "[REDACTED_LOCAL_PATH]").trimEnd(),
  }));
}
