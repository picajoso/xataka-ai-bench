import { getLocalizedSummary, getMessages, loadPublicCatalog, type Locale } from "../../../lib/content.js";

export default async function TestsPage({ params }: Readonly<{ params: Promise<{ locale: Locale }> }>) {
  const { locale } = await params;
  const copy = getMessages(locale);
  const catalog = await loadPublicCatalog(process.env.AIBENCH_PUBLISHED_ROOT ?? "../../published");
  return <main><p className="eyebrow">{copy.testsEyebrow}</p><h1>{copy.testsTitle}</h1><p>{copy.testsIntro}</p>{catalog.runs.length ? <ul>{catalog.runs.map((run) => <li key={run.runId}><strong>{run.runId}</strong><br />{getLocalizedSummary(run, locale)}</li>)}</ul> : <p>{copy.noTests}</p>}</main>;
}
