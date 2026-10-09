import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Reveal } from "@/components/motion";
import { CATEGORY_ORDER } from "@/components/verdict";
import { DANGEROUS_AT, SUSPICIOUS_AT, allRules, severityOf } from "@/engine";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { fmt } from "@/i18n/format";
import { ruleText } from "@/i18n/rules";

export async function generateMetadata({ params }: PageProps<"/[lang]/rules">): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const dict = getDictionary(lang);
  return { title: dict.rulesPage.title, description: dict.rulesPage.metaDescription };
}

const SEVERITY_TEXT = { high: "text-dangerous bg-dangerous/10", medium: "text-suspicious bg-suspicious/10", low: "text-muted bg-sunken" } as const;

export default async function RulesPage({ params }: PageProps<"/[lang]/rules">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const dict = getDictionary(lang);
  const t = dict.rulesPage;
  const rules = allRules();
  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-3xl font-bold tracking-tight text-fg sm:text-4xl">{t.title}</h1>
      <p className="mt-3 max-w-3xl text-muted">
        {fmt(t.intro, { count: rules.length, suspicious: SUSPICIOUS_AT, dangerous: DANGEROUS_AT })}
      </p>

      <nav className="mt-6 flex flex-wrap gap-2 text-xs">
        {CATEGORY_ORDER.filter((c) => rules.some((r) => r.category === c)).map((c) => (
          <a
            key={c}
            href={`#${c}`}
            className="rounded-full border border-line bg-surface/80 px-3 py-1 text-muted transition hover:border-accent/40 hover:text-accent"
          >
            {dict.categories[c].label}
          </a>
        ))}
      </nav>

      <div className="mt-10 space-y-12">
        {CATEGORY_ORDER.map((cat) => {
          const list = rules.filter((r) => r.category === cat);
          if (list.length === 0) return null;
          return (
            <section key={cat} id={cat} className="scroll-mt-28">
              <Reveal>
                <h2 className="mb-4 text-xl font-semibold text-fg">{dict.categories[cat].label}</h2>
              </Reveal>
              <div className="grid gap-3 md:grid-cols-2">
                {list.map((r, i) => {
                  const text = ruleText(dict, r.id, { title: r.title, why: r.why });
                  return (
                    <Reveal key={r.id} as="article" delay={(i % 2) * 0.06}>
                      <div className="h-full rounded-2xl border border-line bg-surface/85 p-5 shadow-sm transition hover:border-line-strong">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          <span className="font-mono text-xs text-subtle">{r.id}</span>
                          <span className={`rounded-md px-1.5 py-0.5 font-mono text-xs font-semibold ${SEVERITY_TEXT[severityOf(r.weight)]}`}>
                            +{r.weight}
                          </span>
                          {r.docWeight !== undefined && (
                            <span className="text-xs text-subtle">
                              {r.docWeight === 0 ? t.ignoredInDocs : fmt(t.inDocs, { n: r.docWeight })}
                            </span>
                          )}
                        </div>
                        <h3 className="mt-2 font-semibold text-fg">{text.title}</h3>
                        <p className="mt-2 text-sm leading-relaxed text-muted">{text.why}</p>
                        {r.appliesTo && <p className="mt-3 font-mono text-xs break-words text-subtle">{fmt(t.files, { list: r.appliesTo.join(", ") })}</p>}
                      </div>
                    </Reveal>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
