import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LegalPage, contactLink } from "@/components/LegalPage";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { contactEmail, pageAlternates } from "@/lib/site";

export async function generateMetadata({ params }: PageProps<"/[lang]/terms">): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const t = getDictionary(lang).terms;
  return { title: t.metaTitle, description: t.metaDescription, alternates: pageAlternates(lang, "/terms") };
}

export default async function TermsPage({ params }: PageProps<"/[lang]/terms">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  return (
    <LegalPage
      text={getDictionary(lang).terms}
      locale={lang}
      nodes={{ contact: contactLink(contactEmail()) }}
    />
  );
}
