import { notFound } from "next/navigation.js";
import { getLocalizedSummary, getPublicRunContext, listRunsForBenchmark, loadPublicCatalog, type Locale } from "../../../../lib/content.js";

function publishedRoot() { return process.env.AIBENCH_PUBLISHED_ROOT ?? "../../published"; }

export async function generateStaticParams() {
  const catalog = await loadPublicCatalog(publishedRoot());
  return ["es", "en"].flatMap((locale) => [...new Set(catalog.index.runs.map((run) => run.benchmark.slug))].map((benchmark) => ({ locale, benchmark })));
}

export default async function BenchmarkPage({ params }: Readonly<{ params: Promise<{ locale: Locale; benchmark: string }> }>) {
  const { locale, benchmark } = await params;
  if (locale !== "es" && locale !== "en") notFound();
  const catalog = await loadPublicCatalog(publishedRoot());
  const runs = listRunsForBenchmark(catalog, benchmark);
  const context = catalog.index.runs.find((run) => run.benchmark.slug === benchmark);
  if (!context || !runs.length) notFound();
  return <main><p className="eyebrow">{locale === "es" ? "Prueba" : "Test"}</p><h1>{context.benchmark.title[locale]}</h1><p>{locale === "es" ? "Resultados publicados para esta prueba." : "Published results for this test."}</p><section><h2>{locale === "es" ? "Ejecuciones disponibles" : "Available runs"}</h2><ul>{runs.map((run) => <li key={run.runId}><a href={`/${locale}/runs/${run.runId}`}>{getPublicRunContext(catalog, run.runId)?.system.displayName ?? run.runId}</a><br />{getLocalizedSummary(run, locale)}</li>)}</ul></section></main>;
}
