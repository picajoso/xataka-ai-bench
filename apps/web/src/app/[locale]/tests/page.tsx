import { loadPublicCatalog } from "../../../lib/content.js";

export default async function TestsPage() {
  const catalog = await loadPublicCatalog(process.env.AIBENCH_PUBLISHED_ROOT ?? "../../published");
  return <main><p className="eyebrow">Pruebas</p><h1>Resultados por prueba</h1><p>Cada prueba reúne las ejecuciones disponibles sin convertir resultados expositivos en una puntuación artificial.</p>{catalog.runs.length ? <ul>{catalog.runs.map((run) => <li key={run.runId}><strong>{run.runId}</strong><br />{run.summary.es}</li>)}</ul> : <p>No hay pruebas con resultados publicados todavía.</p>}</main>;
}
