import type { Metadata } from "next";
import "../../styles/globals.css";

export const metadata: Metadata = { title: "Xataka AI Bench", description: "Banco reproducible de pruebas para sistemas de IA." };

export function generateStaticParams() { return [{ locale: "es" }, { locale: "en" }]; }

export default async function LocaleLayout({ children, params }: Readonly<{ children: React.ReactNode; params: Promise<{ locale: string }> }>) {
  const { locale } = await params;
  const otherLocale = locale === "es" ? "en" : "es";
  return <html lang={locale}><body><header><a href={`/${locale}`}>Xataka AI Bench</a><nav><a href={`/${locale}/tests`}>{locale === "es" ? "Pruebas" : "Tests"}</a><a href={`/${locale}/systems`}>{locale === "es" ? "Sistemas" : "Systems"}</a><a href={`/${locale}/compare`}>{locale === "es" ? "Comparar" : "Compare"}</a><a href={`/${locale}/methodology`}>{locale === "es" ? "Metodología" : "Methodology"}</a><a href={`/${otherLocale}`}>{otherLocale.toUpperCase()}</a></nav></header>{children}</body></html>;
}
