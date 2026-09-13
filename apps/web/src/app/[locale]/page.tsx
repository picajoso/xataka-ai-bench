import { loadPublicCatalog } from "../../lib/content.js";

export default async function Home() {
  const catalog = await loadPublicCatalog(process.env.AIBENCH_PUBLISHED_ROOT ?? "../../published");
  return <main><p className="eyebrow">Xataka AI Bench</p><h1>Pruebas prácticas para sistemas de IA</h1><p>Resultados reproducibles y contexto técnico para comparar el sistema completo: modelo, agente, configuración y entorno.</p><section><h2>Resultados publicados</h2>{catalog.runs.length === 0 ? <p>Todavía no hay resultados publicados.</p> : <ul>{catalog.runs.map((run) => <li key={run.runId}>{run.summary.es}</li>)}</ul>}</section></main>;
}
