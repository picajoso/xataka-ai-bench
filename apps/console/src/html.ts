import type { ConsoleRun } from "./model.js";
import type { ConsoleOverview } from "./routes.js";

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]!);
}

export function overviewPage(overview: ConsoleOverview, runs: ConsoleRun[]): string {
  const rows = runs.map((run) => `<tr><td><a href="/runs/${encodeURIComponent(run.runId)}">${escapeHtml(run.runId)}</a></td><td>${escapeHtml(run.status)}</td><td>${escapeHtml(run.benchmarkSlug)}</td><td>${escapeHtml(run.systemSlug)}</td></tr>`).join("");
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Xataka AI Bench — consola local</title></head><body><main><h1>Xataka AI Bench — consola local</h1><p>Escucha solo en 127.0.0.1.</p><dl><dt>SSD disponible</dt><dd>${overview.storageAvailable ? "sí" : "no"}</dd><dt>Docker disponible</dt><dd>${overview.dockerAvailable ? "sí" : "no"}</dd><dt>Variables necesarias</dt><dd>${overview.requiredEnvironmentVariables.map(escapeHtml).join(", ") || "ninguna"}</dd></dl><h2>Ejecuciones</h2><table><thead><tr><th>Id</th><th>Estado</th><th>Prueba</th><th>Sistema</th></tr></thead><tbody>${rows}</tbody></table></main></body></html>`;
}

export function runPage(run: ConsoleRun): string {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${escapeHtml(run.runId)}</title></head><body><main><p><a href="/">Volver</a></p><h1>${escapeHtml(run.runId)}</h1><dl><dt>Estado</dt><dd>${escapeHtml(run.status)}</dd><dt>Prueba</dt><dd>${escapeHtml(run.benchmarkSlug)}</dd><dt>Sistema</dt><dd>${escapeHtml(run.systemSlug)}</dd><dt>Resumen de fallo</dt><dd>${escapeHtml(run.failureSummary ?? "—")}</dd></dl></main></body></html>`;
}
