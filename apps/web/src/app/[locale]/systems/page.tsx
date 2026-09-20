import { getMessages, loadPublicCatalog, type Locale } from "../../../lib/content.js";

export default async function SystemsPage({ params }: Readonly<{ params: Promise<{ locale: Locale }> }>) {
  const { locale } = await params;
  const copy = getMessages(locale);
  const catalog = await loadPublicCatalog(process.env.AIBENCH_PUBLISHED_ROOT ?? "../../published");
  return <main><p className="eyebrow">{copy.systemsEyebrow}</p><h1>{copy.systemsTitle}</h1><p>{copy.systemsIntro}</p><p>{catalog.runs.length === 0 ? copy.noSystems : copy.publishedRuns(catalog.runs.length)}</p></main>;
}
