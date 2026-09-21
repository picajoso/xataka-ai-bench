import type { PublicationManifest } from "@aibench/contracts";

export function RunDemo({ demo, demoUrl, locale }: Readonly<{
  demo: PublicationManifest["demo"];
  demoUrl?: string;
  locale?: "es" | "en";
}>) {
  const currentLocale = locale ?? "en";
  if (!demo) return <section><h2>{currentLocale === "es" ? "Demostración" : "Demo"}</h2><p>{currentLocale === "es" ? "No hay una demostración aprobada para este resultado." : "There is no approved demo for this result."}</p></section>;
  if (demo.kind === "external") return <section><h2>{currentLocale === "es" ? "Demostración" : "Demo"}</h2><a href={demo.url} rel="noreferrer">{currentLocale === "es" ? "Abrir demostración aprobada" : "Open approved demo"}</a></section>;
  return <section><h2>{currentLocale === "es" ? "Demostración" : "Demo"}</h2><iframe src={demoUrl ?? demo.path} title="Approved result demo" sandbox="" /></section>;
}
