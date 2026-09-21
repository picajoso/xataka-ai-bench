import { getMessages, getPublicRunContext, loadPublicCatalog, type Locale } from "../../../lib/content.js";

export default async function ComparePage({ params }: Readonly<{ params: Promise<{ locale: Locale }> }>) {
  const { locale } = await params;
  const copy = getMessages(locale);
  const catalog = await loadPublicCatalog(process.env.AIBENCH_PUBLISHED_ROOT ?? "../../published");
  return <main><p className="eyebrow">{copy.compareEyebrow}</p><h1>{copy.compareTitle}</h1><p>{copy.compareIntro}</p><section><h2>{copy.availability}</h2><p>{copy.preparedResults(catalog.runs.length)}</p><ul>{catalog.runs.map((run) => <li key={run.runId}><a href={`/${locale}/runs/${run.runId}`}>{getPublicRunContext(catalog, run.runId)?.benchmark.title[locale] ?? run.runId}</a></li>)}</ul></section></main>;
}
