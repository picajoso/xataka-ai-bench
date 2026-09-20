import { getLocalizedSummary, getMessages, loadPublicCatalog, type Locale } from "../../lib/content.js";

export default async function Home({ params }: Readonly<{ params: Promise<{ locale: Locale }> }>) {
  const { locale } = await params;
  const copy = getMessages(locale);
  const catalog = await loadPublicCatalog(process.env.AIBENCH_PUBLISHED_ROOT ?? "../../published");
  return <main><p className="eyebrow">Xataka AI Bench</p><h1>{copy.homeTitle}</h1><p>{copy.homeIntro}</p><section><h2>{copy.publishedResults}</h2>{catalog.runs.length === 0 ? <p>{copy.emptyCatalog}</p> : <ul>{catalog.runs.map((run) => <li key={run.runId}>{getLocalizedSummary(run, locale)}</li>)}</ul>}</section></main>;
}
