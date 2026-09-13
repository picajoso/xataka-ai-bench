import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { parsePublicationManifest, type PublicationManifest } from "@aibench/contracts";

export type PublicCatalog = { runs: PublicationManifest[] };
export type Locale = "es" | "en";

const messages = {
  es: { methodology: "Metodología", emptyCatalog: "Todavía no hay resultados publicados." },
  en: { methodology: "Methodology", emptyCatalog: "There are no published results yet." },
} as const;

export function getMessages(locale: Locale): typeof messages[Locale] {
  return messages[locale];
}

export async function loadPublicCatalog(publishedRoot: string): Promise<PublicCatalog> {
  const runsRoot = join(publishedRoot, "runs");
  let entries: Array<{ name: string; isDirectory(): boolean }>;
  try {
    entries = await readdir(runsRoot, { withFileTypes: true, encoding: "utf8" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { runs: [] };
    throw error;
  }
  const runs = await Promise.all(entries.filter((entry) => entry.isDirectory()).map(async (entry) => {
    const contents = await readFile(join(runsRoot, entry.name, "publication.json"), "utf8");
    return parsePublicationManifest(JSON.parse(contents) as unknown);
  }));
  return { runs: runs.sort((left, right) => left.runId.localeCompare(right.runId)) };
}
