import { notFound } from "next/navigation.js";
import { RunDemo } from "../../../../components/RunDemo.js";
import { RunFacts } from "../../../../components/RunFacts.js";
import { RunFiles } from "../../../../components/RunFiles.js";
import { getLocalizedSummary, getPublicRunContext, loadPublicCatalog, type Locale } from "../../../../lib/content.js";

const statuses = {
  es: {
    completed: "Resultado oficial completado", "validation-failure": "Resultado oficial fallido", "infra-error": "Error de infraestructura", incomplete: "Resultado incompleto", "legacy-unverified": "Resultado histórico sin verificar",
    prompt: "Prompt canónico", summary: "Resumen público", unindexed: "Este resultado no tiene asociación pública declarada de prueba o sistema.",
  },
  en: {
    completed: "Official completed result", "validation-failure": "Official failed result", "infra-error": "Infrastructure error", incomplete: "Incomplete result", "legacy-unverified": "Unverified historical result",
    prompt: "Canonical prompt", summary: "Public summary", unindexed: "This result has no declared public test or system association.",
  },
} as const;

function publishedRoot() { return process.env.AIBENCH_PUBLISHED_ROOT ?? "../../published"; }

export async function generateStaticParams() {
  const catalog = await loadPublicCatalog(publishedRoot());
  return ["es", "en"].flatMap((locale) => catalog.runs.map((run) => ({ locale, run: run.runId })));
}

export default async function RunPage({ params }: Readonly<{ params: Promise<{ locale: Locale; run: string }> }>) {
  const { locale, run: runId } = await params;
  if (locale !== "es" && locale !== "en") notFound();
  const catalog = await loadPublicCatalog(publishedRoot());
  const run = catalog.runs.find((candidate) => candidate.runId === runId);
  if (!run) notFound();
  const context = getPublicRunContext(catalog, runId);
  const labels = statuses[locale];
  const statusLabel = context ? labels[context.status] : labels.unindexed;
  const demoUrl = run.demo?.kind === "static" ? `/runs/${run.runId}/files/${run.demo.path}` : undefined;

  return <main>
    <p className="eyebrow">Xataka AI Bench</p>
    <h1>{context ? context.benchmark.title[locale] : run.runId}</h1>
    <p className="status">{statusLabel}</p>
    <RunFacts run={run} context={context} locale={locale} statusLabel={statusLabel} />
    <section><h2>{labels.summary}</h2><p>{getLocalizedSummary(run, locale)}</p></section>
    {context ? <section><h2>{labels.prompt}</h2><pre>{context.canonicalPrompt.text}</pre></section> : null}
    <RunDemo demo={run.demo} locale={locale} {...(demoUrl ? { demoUrl } : {})} />
    <RunFiles run={run} locale={locale} />
  </main>;
}
