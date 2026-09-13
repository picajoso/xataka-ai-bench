import { loadPublicCatalog } from "../../../lib/content.js";

export default async function SystemsPage() {
  const catalog = await loadPublicCatalog(process.env.AIBENCH_PUBLISHED_ROOT ?? "../../published");
  return <main><p className="eyebrow">Sistemas</p><h1>Sistemas con resultados públicos</h1><p>Un sistema representa la combinación versionada de agente, modelo, backend y configuración utilizada en una ejecución.</p><p>{catalog.runs.length === 0 ? "Todavía no hay sistemas publicados." : `${catalog.runs.length} ejecuciones publicadas disponibles para revisar.`}</p></main>;
}
