import { getMessages, type Locale } from "../../../lib/content.js";

export default async function Methodology({ params }: Readonly<{ params: Promise<{ locale: Locale }> }>) {
  const { locale } = await params;
  const copy = getMessages(locale);
  return <main><p className="eyebrow">{copy.methodology}</p><h1>{copy.methodologyTitle}</h1><p>{copy.methodologySystem}</p><p>{copy.methodologyRepair}</p></main>;
}
