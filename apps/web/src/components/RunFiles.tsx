import type { PublicationManifest } from "@aibench/contracts";
import { listPublicFiles, type Locale } from "../lib/content.js";

export function RunFiles({ run, locale }: Readonly<{ run: PublicationManifest; locale: Locale }>) {
  const files = listPublicFiles(run);
  const title = locale === "es" ? "Materiales aprobados" : "Approved materials";
  if (!files.length) return <section><h2>{title}</h2><p>{locale === "es" ? "No hay materiales públicos incluidos." : "No public materials are included."}</p></section>;
  return <section><h2>{title}</h2><ul>{files.map((file) => <li key={file.path}><a href={`/runs/${run.runId}/files/${file.path}`}>{file.path}</a>{file.kind === "evidence" ? ` (${locale === "es" ? "evidencia" : "evidence"})` : null}</li>)}</ul></section>;
}
