import { readdir, readFile, realpath, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import {
  parsePublicCatalogIndex,
  parsePublicationManifest,
  RelativePathSchema,
  type PublicCatalogIndex,
  type PublicRunContext,
  type PublicationManifest,
} from "@aibench/contracts";

const emptyIndex: PublicCatalogIndex = { schemaVersion: "1.0.0", runs: [] };

export type PublicCatalog = { runs: PublicationManifest[]; index: PublicCatalogIndex };
export type PublicFile = { path: string; kind: "source" | "evidence" };
export type Locale = "es" | "en";

const messages = {
  es: {
    methodology: "Metodología", emptyCatalog: "Todavía no hay resultados publicados.", homeTitle: "Pruebas prácticas para sistemas de IA",
    homeIntro: "Resultados reproducibles y contexto técnico para comparar el sistema completo: modelo, agente, configuración y entorno.",
    publishedResults: "Resultados publicados", testsEyebrow: "Pruebas", testsTitle: "Resultados por prueba",
    testsIntro: "Cada prueba reúne las ejecuciones disponibles sin convertir resultados expositivos en una puntuación artificial.",
    noTests: "No hay pruebas con resultados publicados todavía.", compareEyebrow: "Comparar", compareTitle: "Matriz de cobertura",
    compareIntro: "Esta vista muestra qué resultados existen. No calcula una clasificación global: la lectura y los criterios dependen de cada prueba.",
    availability: "Disponibilidad", preparedResults: (count: number) => `${count} resultados públicos preparados.`,
    systemsEyebrow: "Sistemas", systemsTitle: "Sistemas con resultados públicos",
    systemsIntro: "Un sistema representa la combinación versionada de agente, modelo, backend y configuración utilizada en una ejecución.",
    noSystems: "Todavía no hay sistemas publicados.", publishedRuns: (count: number) => `${count} ejecuciones publicadas disponibles para revisar.`,
    methodologyTitle: "Qué se compara", methodologySystem: "La unidad de comparación es un sistema completo: agente, modelo, backend, hardware, versiones y parámetros. Los resultados expositivos no reciben una nota artificial.",
    methodologyRepair: "Una reparación, cuando existe, queda separada del primer intento y se explica como tal.",
  },
  en: {
    methodology: "Methodology", emptyCatalog: "There are no published results yet.", homeTitle: "Practical tests for AI systems",
    homeIntro: "Reproducible results and technical context for comparing the full system: model, agent, configuration, and environment.",
    publishedResults: "Published results", testsEyebrow: "Tests", testsTitle: "Results by test",
    testsIntro: "Each test brings together the available runs without turning exhibitive results into an artificial score.",
    noTests: "There are no tests with published results yet.", compareEyebrow: "Compare", compareTitle: "Coverage matrix",
    compareIntro: "This view shows which results exist. It does not calculate a global ranking: interpretation and criteria depend on each test.",
    availability: "Availability", preparedResults: (count: number) => `${count} public results prepared.`,
    systemsEyebrow: "Systems", systemsTitle: "Systems with public results",
    systemsIntro: "A system represents the versioned combination of agent, model, backend, and configuration used in a run.",
    noSystems: "There are no published systems yet.", publishedRuns: (count: number) => `${count} published runs available for review.`,
    methodologyTitle: "What is compared", methodologySystem: "The unit of comparison is a complete system: agent, model, backend, hardware, versions, and parameters. Exhibitive results do not receive an artificial score.",
    methodologyRepair: "When a repair exists, it remains separate from the first attempt and is explained as such.",
  },
} as const;

export function getMessages(locale: Locale): typeof messages[Locale] {
  return messages[locale];
}

export function getLocalizedSummary(run: PublicationManifest, locale: Locale): string {
  return run.summary[locale];
}

export async function loadPublicCatalog(publishedRoot: string): Promise<PublicCatalog> {
  const runsRoot = join(publishedRoot, "runs");
  let entries: Array<{ name: string; isDirectory(): boolean }>;
  try {
    entries = await readdir(runsRoot, { withFileTypes: true, encoding: "utf8" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { runs: [], index: await loadPublicCatalogIndex(publishedRoot) };
    throw error;
  }
  const runs = await Promise.all(entries.filter((entry) => entry.isDirectory()).map(async (entry) => {
    const contents = await readFile(join(runsRoot, entry.name, "publication.json"), "utf8");
    return parsePublicationManifest(JSON.parse(contents) as unknown);
  }));
  return { runs: runs.sort((left, right) => left.runId.localeCompare(right.runId)), index: await loadPublicCatalogIndex(publishedRoot) };
}

async function loadPublicCatalogIndex(publishedRoot: string): Promise<PublicCatalogIndex> {
  try {
    return parsePublicCatalogIndex(JSON.parse(await readFile(join(publishedRoot, "catalog.json"), "utf8")) as unknown);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyIndex;
    throw error;
  }
}

export async function getPublicRun(publishedRoot: string, runId: string): Promise<PublicationManifest | null> {
  return (await loadPublicCatalog(publishedRoot)).runs.find((run) => run.runId === runId) ?? null;
}

export function getPublicRunContext(catalog: PublicCatalog, runId: string): PublicRunContext | null {
  if (!catalog.runs.some((run) => run.runId === runId)) return null;
  return catalog.index.runs.find((context) => context.runId === runId) ?? null;
}

export function listRunsForBenchmark(catalog: PublicCatalog, slug: string): PublicationManifest[] {
  const indexedRunIds = new Set(catalog.index.runs.filter((context) => context.benchmark.slug === slug).map((context) => context.runId));
  return catalog.runs.filter((run) => indexedRunIds.has(run.runId));
}

export function listRunsForSystem(catalog: PublicCatalog, slug: string): PublicationManifest[] {
  const indexedRunIds = new Set(catalog.index.runs.filter((context) => context.system.slug === slug).map((context) => context.runId));
  return catalog.runs.filter((run) => indexedRunIds.has(run.runId));
}

export function listPublicFiles(run: PublicationManifest): PublicFile[] {
  return [
    ...run.includedPaths.map((path) => ({ path, kind: "source" as const })),
    ...run.evidencePaths.map((path) => ({ path, kind: "evidence" as const })),
  ].sort((left, right) => left.path.localeCompare(right.path));
}

export async function readPublicTextFile(publishedRoot: string, runId: string, relativePath: string): Promise<string | null> {
  if (!RelativePathSchema.safeParse(relativePath).success) return null;

  const run = await getPublicRun(publishedRoot, runId);
  if (!run || !listPublicFiles(run).some((file) => file.path === relativePath)) return null;

  try {
    const runRoot = join(publishedRoot, "runs", run.runId);
    const candidate = join(runRoot, relativePath);
    const [realRunRoot, realCandidate] = await Promise.all([realpath(runRoot), realpath(candidate)]);
    const location = relative(realRunRoot, realCandidate);
    if (location === "" || location === ".." || location.startsWith(`..${sep}`) || location.startsWith("../")) return null;

    const metadata = await stat(realCandidate);
    if (!metadata.isFile() || metadata.size > 256 * 1024) return null;

    return new TextDecoder("utf-8", { fatal: true }).decode(await readFile(realCandidate));
  } catch {
    return null;
  }
}
