import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { EmptyList, RepoList } from "@/components/RepoList";
import { isLocale, localePath } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { rich } from "@/i18n/format";
import { LIST_LIMIT, loadList } from "@/lib/lists";

export async function generateMetadata({ params }: PageProps<"/[lang]/safe-zone">): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const t = getDictionary(lang).safeZone;
  return { title: t.metaTitle, description: t.metaDescription };
}

// Rebuilt at most once a minute, so the database is not queried on every visit
// (and the free Neon database can sleep when nobody is looking).
export const revalidate = 60;

export default async function SafeZonePage({ params }: PageProps<"/[lang]/safe-zone">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const dict = getDictionary(lang);
  const t = dict.safeZone;
  const { items, configured, failed } = await loadList("clean");
  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <p className="inline-flex items-center gap-2 rounded-full bg-clean/10 px-3 py-1 text-sm font-medium text-clean ring-1 ring-clean/25">
        <span className="h-2 w-2 rounded-full bg-clean" />
        {t.eyebrow}
      </p>
      <h1 className="mt-4 text-3xl font-bold tracking-tight text-fg sm:text-4xl">{t.title}</h1>
      <p className="mt-3 text-muted">
        {rich(t.intro, { n: LIST_LIMIT, clean: <strong className="text-clean">{t.clean}</strong> })}
      </p>
      <p className="mt-4 rounded-2xl border border-line bg-surface/80 px-4 py-3 text-sm text-muted">{t.note}</p>
      <div className="mt-8">
        {failed ? (
          <EmptyList configured dict={dict}>
            {dict.lists.failed}
          </EmptyList>
        ) : items.length === 0 ? (
          <EmptyList configured={configured} dict={dict}>
            {rich(t.empty, {
              link: (
                <Link href={localePath(lang)} className="text-accent underline">
                  {t.emptyLink}
                </Link>
              ),
            })}
          </EmptyList>
        ) : (
          <RepoList items={items} showReasons={false} locale={lang} dict={dict} />
        )}
      </div>
    </div>
  );
}
