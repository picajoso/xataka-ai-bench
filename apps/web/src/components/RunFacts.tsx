import type { PublicRunContext, PublicationManifest } from "@aibench/contracts";
import type { Locale } from "../lib/content.js";

const copy = {
  es: { official: "Ejecución oficial", published: "Publicado", benchmark: "Prueba", system: "Sistema", status: "Estado", package: "Huella del paquete" },
  en: { official: "Official run", published: "Published", benchmark: "Test", system: "System", status: "Status", package: "Package hash" },
} as const;

export function RunFacts({ run, context, locale, statusLabel }: Readonly<{
  run: PublicationManifest;
  context: PublicRunContext | null;
  locale: Locale;
  statusLabel: string;
}>) {
  const labels = copy[locale];
  return <section aria-label={locale === "es" ? "Ficha de ejecución" : "Run facts"}>
    <dl className="run-facts">
      <div><dt>{labels.official}</dt><dd>{run.official ? "✓" : "—"}</dd></div>
      <div><dt>{labels.published}</dt><dd>{new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "UTC" }).format(new Date(run.publishedAt))}</dd></div>
      {context ? <><div><dt>{labels.benchmark}</dt><dd>{context.benchmark.title[locale]}</dd></div><div><dt>{labels.system}</dt><dd>{context.system.displayName}</dd></div><div><dt>{labels.status}</dt><dd>{statusLabel}</dd></div></> : null}
      <div><dt>{labels.package}</dt><dd><code>{run.packageHash}</code></dd></div>
    </dl>
  </section>;
}
