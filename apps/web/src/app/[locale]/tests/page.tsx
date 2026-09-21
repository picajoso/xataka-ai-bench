import { getMessages, loadPublicCatalog, type Locale } from "../../../lib/content.js";

export default async function TestsPage({ params }: Readonly<{ params: Promise<{ locale: Locale }> }>) {
  const { locale } = await params;
  const copy = getMessages(locale);
  const catalog = await loadPublicCatalog(process.env.AIBENCH_PUBLISHED_ROOT ?? "../../published");
  const tests = [...new Map(catalog.index.runs.map((run) => [run.benchmark.slug, run.benchmark])).entries()];
  return <main><p className="eyebrow">{copy.testsEyebrow}</p><h1>{copy.testsTitle}</h1><p>{copy.testsIntro}</p>{tests.length ? <ul>{tests.map(([slug, test]) => <li key={slug}><a href={`/${locale}/tests/${slug}`}>{test.title[locale]}</a></li>)}</ul> : <p>{copy.noTests}</p>}</main>;
}
