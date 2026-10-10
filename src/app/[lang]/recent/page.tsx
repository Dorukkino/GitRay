import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { EmptyList, RepoList } from "@/components/RepoList";
import { isLocale, localePath } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { rich } from "@/i18n/format";
import { LIST_LIMIT, loadList } from "@/lib/lists";
import { pageAlternates } from "@/lib/site";

export async function generateMetadata({ params }: PageProps<"/[lang]/recent">): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const t = getDictionary(lang).recent;
  return { title: t.metaTitle, description: t.metaDescription, alternates: pageAlternates(lang, "/recent") };
}

// Rebuilt at most once a minute, so the database is not queried on every visit
// (and the free Neon database can sleep when nobody is looking).
export const revalidate = 60;

export default async function RecentPage({ params }: PageProps<"/[lang]/recent">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const dict = getDictionary(lang);
  const t = dict.recent;
  const { items, configured, failed } = await loadList("all");
  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <p className="inline-flex items-center gap-2 rounded-full bg-accent/10 px-3 py-1 text-sm font-medium text-accent ring-1 ring-accent/25">
        <span className="h-2 w-2 rounded-full bg-accent" />
        {t.eyebrow}
      </p>
      <h1 className="mt-4 text-3xl font-bold tracking-tight text-fg sm:text-4xl">{t.title}</h1>
      <p className="mt-3 text-muted">{rich(t.intro, { n: LIST_LIMIT })}</p>
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
          <RepoList items={items} showReasons locale={lang} dict={dict} />
        )}
      </div>
    </div>
  );
}
