import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { EmptyList, RepoList } from "@/components/RepoList";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { rich } from "@/i18n/format";
import { LIST_LIMIT, loadList } from "@/lib/lists";

export async function generateMetadata({ params }: PageProps<"/[lang]/scammer">): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const t = getDictionary(lang).scammer;
  return { title: t.metaTitle, description: t.metaDescription };
}

// Rebuilt at most once a minute, so the database is not queried on every visit
// (and the free Neon database can sleep when nobody is looking).
export const revalidate = 60;

export default async function ScammerPage({ params }: PageProps<"/[lang]/scammer">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const dict = getDictionary(lang);
  const t = dict.scammer;
  const { items, configured, failed } = await loadList("dangerous");
  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <p className="inline-flex items-center gap-2 rounded-full bg-dangerous/10 px-3 py-1 text-sm font-medium text-dangerous ring-1 ring-dangerous/25">
        <span className="h-2 w-2 rounded-full bg-dangerous" />
        {t.eyebrow}
      </p>
      <h1 className="mt-4 text-3xl font-bold tracking-tight text-fg sm:text-4xl">{t.title}</h1>
      <p className="mt-3 text-muted">
        {rich(t.intro, { n: LIST_LIMIT, score: <strong className="text-dangerous">{t.score}</strong> })}
      </p>
      {/* This warning and the report link must stay: the list is a heuristic, not a person's judgement. */}
      <p className="mt-4 rounded-2xl border border-dangerous/25 bg-dangerous/5 px-4 py-3 text-sm text-fg/90">
        {rich(t.warning, {
          link: (
            <a
              href="https://github.com/Dorukkino/GitRay/issues/new"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent underline"
            >
              {t.report}
            </a>
          ),
        })}
      </p>
      <div className="mt-8">
        {failed ? (
          <EmptyList configured dict={dict}>
            {dict.lists.failed}
          </EmptyList>
        ) : items.length === 0 ? (
          <EmptyList configured={configured} dict={dict}>
            {t.empty}
          </EmptyList>
        ) : (
          <RepoList items={items} showReasons locale={lang} dict={dict} />
        )}
      </div>
    </div>
  );
}
