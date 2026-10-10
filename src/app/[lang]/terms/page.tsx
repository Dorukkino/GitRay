import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LegalPage, legalLink } from "@/components/LegalPage";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { ISSUES_URL, REPO_URL, SECURITY_POLICY_URL, pageAlternates } from "@/lib/site";

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
      nodes={{
        issues: legalLink(ISSUES_URL, "GitHub Issues"),
        security: legalLink(SECURITY_POLICY_URL, "SECURITY.md"),
        source: legalLink(REPO_URL, "GitHub"),
      }}
    />
  );
}
