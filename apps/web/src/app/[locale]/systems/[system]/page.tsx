import { notFound } from "next/navigation.js";
import { getLocalizedSummary, getPublicRunContext, listRunsForSystem, loadPublicCatalog, type Locale } from "../../../../lib/content.js";

function publishedRoot() { return process.env.AIBENCH_PUBLISHED_ROOT ?? "../../published"; }

export async function generateStaticParams() {
  const catalog = await loadPublicCatalog(publishedRoot());
  return ["es", "en"].flatMap((locale) => [...new Set(catalog.index.runs.map((run) => run.system.slug))].map((system) => ({ locale, system })));
}

export default async function SystemPage({ params }: Readonly<{ params: Promise<{ locale: Locale; system: string }> }>) {
  const { locale, system } = await params;
  if (locale !== "es" && locale !== "en") notFound();
  const catalog = await loadPublicCatalog(publishedRoot());
  const runs = listRunsForSystem(catalog, system);
  const context = catalog.index.runs.find((run) => run.system.slug === system);
  if (!context || !runs.length) notFound();
  return <main><p className="eyebrow">{locale === "es" ? "Sistema" : "System"}</p><h1>{context.system.displayName}</h1><p>{locale === "es" ? "Resultados publicados de este sistema." : "Published results from this system."}</p><section><h2>{locale === "es" ? "Ejecuciones disponibles" : "Available runs"}</h2><ul>{runs.map((run) => <li key={run.runId}><a href={`/${locale}/runs/${run.runId}`}>{getPublicRunContext(catalog, run.runId)?.benchmark.title[locale] ?? run.runId}</a><br />{getLocalizedSummary(run, locale)}</li>)}</ul></section></main>;
}
