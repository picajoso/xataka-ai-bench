import { getMessages, loadPublicCatalog, type Locale } from "../../../lib/content.js";

export default async function SystemsPage({ params }: Readonly<{ params: Promise<{ locale: Locale }> }>) {
  const { locale } = await params;
  const copy = getMessages(locale);
  const catalog = await loadPublicCatalog(process.env.AIBENCH_PUBLISHED_ROOT ?? "../../published");
  const systems = [...new Map(catalog.index.runs.map((run) => [run.system.slug, run.system])).entries()];
  return <main><p className="eyebrow">{copy.systemsEyebrow}</p><h1>{copy.systemsTitle}</h1><p>{copy.systemsIntro}</p>{systems.length ? <ul>{systems.map(([slug, system]) => <li key={slug}><a href={`/${locale}/systems/${slug}`}>{system.displayName}</a></li>)}</ul> : <p>{copy.noSystems}</p>}</main>;
}
