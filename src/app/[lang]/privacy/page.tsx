import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LegalPage, legalCode, legalLink } from "@/components/LegalPage";
import { LOCALE_COOKIE, isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { CONSENT_KEY, THEME_KEY, pageAlternates } from "@/lib/site";

export async function generateMetadata({ params }: PageProps<"/[lang]/privacy">): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const t = getDictionary(lang).privacy;
  return { title: t.metaTitle, description: t.metaDescription, alternates: pageAlternates(lang, "/privacy") };
}

export default async function PrivacyPage({ params }: PageProps<"/[lang]/privacy">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  return (
    <LegalPage
      text={getDictionary(lang).privacy}
      locale={lang}
      nodes={{
        lang: legalCode(LOCALE_COOKIE),
        theme: legalCode(THEME_KEY),
        consent: legalCode(CONSENT_KEY),
        ga: legalCode("_ga, _ga_*"),
        google: legalLink("https://policies.google.com/privacy", "Google"),
        vercel: legalLink("https://vercel.com/legal/privacy-policy", "Vercel"),
        neon: legalLink("https://neon.com/privacy-policy", "Neon"),
      }}
    />
  );
}
