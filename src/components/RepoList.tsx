import Link from "next/link";

import { INTL_LOCALE, type Locale, scanPath } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/en";
import { fmt, plural } from "@/i18n/format";
import { ruleText } from "@/i18n/rules";
import type { ScanSummary } from "@/lib/scan-store";

import { Reveal } from "./motion";
import { VERDICT_STYLE, VerdictBadge } from "./verdict";

// Stored summaries come from our own sanitized reports; React escapes them.

function formatDate(iso: string, locale: Locale): string {
  return new Date(iso).toLocaleString(INTL_LOCALE[locale], {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

export function RepoList({
  items,
  showReasons,
  locale,
  dict,
}: {
  items: ScanSummary[];
  showReasons: boolean;
  locale: Locale;
  dict: Dictionary;
}) {
  const t = dict.lists;
  return (
    <ul className="space-y-3">
      {items.map((s, i) => {
        const [owner, repo] = s.fullName.split("/");
        return (
          <Reveal as="li" key={s.fullName} delay={Math.min(i, 8) * 0.04}>
            <Link
              href={scanPath(locale, owner, repo)}
              className="group block rounded-2xl border border-line bg-surface/85 p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-md"
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <VerdictBadge verdict={s.verdict} label={dict.verdicts[s.verdict].label} />
                <span className="font-mono font-medium break-all text-fg group-hover:text-accent">{s.fullName}</span>
                <span className="font-mono text-xs text-subtle">{fmt(t.score, { n: s.score })}</span>
                <span className="ml-auto text-xs text-subtle">{formatDate(s.scannedAt, locale)} UTC</span>
              </div>
              {s.description && <p className="mt-2 line-clamp-2 text-sm text-muted">{s.description}</p>}
              {/* A clean repository's small findings are not reasons; the chips take the verdict's colour. */}
              {showReasons && s.verdict !== "clean" && s.topRules.length > 0 && (
                <ul className="mt-3 flex flex-wrap gap-1.5">
                  {s.topRules.map((r) => (
                    <li
                      key={r.id}
                      className={`rounded-md px-2 py-0.5 text-xs ring-1 ${VERDICT_STYLE[s.verdict].bg} ${VERDICT_STYLE[s.verdict].text} ${VERDICT_STYLE[s.verdict].ring}`}
                    >
                      {ruleText(dict, r.id, { title: r.title, why: "" }).title}{" "}
                      <span className="font-mono opacity-70">+{r.points}</span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-2 font-mono text-[11px] text-subtle">
                {fmt(t.commit, { sha: s.headSha.slice(0, 12) })} · {plural(locale, s.findings, t.findings)} ·{" "}
                {plural(locale, s.stars, t.stars)}
              </p>
            </Link>
          </Reveal>
        );
      })}
    </ul>
  );
}

export function EmptyList({ configured, dict, children }: { configured: boolean; dict: Dictionary; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-line-strong bg-surface/60 p-8 text-center text-sm text-muted">
      {configured ? (
        children
      ) : (
        <>
          <p className="font-medium text-fg">{dict.lists.dbTitle}</p>
          <p className="mt-1">{dict.lists.dbText}</p>
        </>
      )}
    </div>
  );
}
