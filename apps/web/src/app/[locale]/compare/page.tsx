import { loadPublicCatalog } from "../../../lib/content.js";

export default async function ComparePage() {
  const catalog = await loadPublicCatalog(process.env.AIBENCH_PUBLISHED_ROOT ?? "../../published");
  return <main><p className="eyebrow">Comparar</p><h1>Matriz de cobertura</h1><p>Esta vista muestra qué resultados existen. No calcula una clasificación global: la lectura y los criterios dependen de cada prueba.</p><section><h2>Disponibilidad</h2><p>{catalog.runs.length} resultados públicos preparados.</p></section></main>;
}
