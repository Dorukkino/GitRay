"use client";

/**
 * The "Scan" item of the header with a menu of the latest scans. It opens on
 * hover with a mouse and on the arrow button everywhere, and loads the list
 * from /api/recent (rebuilt once a minute) the first time it opens.
 */

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

import type { Verdict } from "@/engine";
import { localePath, scanPath } from "@/i18n/config";
import { relativeTime } from "@/i18n/format";
import { useI18n } from "@/i18n/provider";

import { VERDICT_STYLE } from "./verdict";

interface Item {
  fullName: string;
  verdict: Verdict;
  scannedAt: string;
}

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "done"; items: Item[]; failed: boolean; at: number }
  | { kind: "error" };

const STALE_MS = 60_000;
const OWNER_REPO = /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/;

/** Only well-formed rows from our own API become links. */
function parseItems(body: unknown): Item[] {
  const items = (body as { items?: unknown })?.items;
  if (!Array.isArray(items)) return [];
  return items.filter(
    (i): i is Item =>
      typeof i?.fullName === "string" &&
      OWNER_REPO.test(i.fullName) &&
      typeof i.verdict === "string" &&
      i.verdict in VERDICT_STYLE &&
      typeof i.scannedAt === "string",
  );
}

export function ScanNavItem({ active }: { active: boolean }) {
  const { locale, dict } = useI18n();
  const t = dict.recentMenu;
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<State>({ kind: "idle" });
  const box = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const closeTimer = useRef<number | undefined>(undefined);
  const panelId = useId();

  function load() {
    if (state.kind === "loading") return;
    if (state.kind === "done" && Date.now() - state.at < STALE_MS) return;
    // A stale list stays on screen while the new one loads.
    if (state.kind !== "done") setState({ kind: "loading" });
    fetch("/api/recent")
      .then((resp) => (resp.ok ? resp.json() : Promise.reject(new Error(`HTTP ${resp.status}`))))
      .then((body: unknown) =>
        setState({ kind: "done", items: parseItems(body), failed: Boolean((body as { failed?: unknown })?.failed), at: Date.now() }),
      )
      .catch(() => setState({ kind: "error" }));
  }

  function show() {
    window.clearTimeout(closeTimer.current);
    setOpen(true);
    load();
  }

  function hideSoon() {
    // A short delay lets the pointer cross the gap between the item and the menu.
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setOpen(false), 160);
  }

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  const close = () => setOpen(false);

  let content;
  if (state.kind === "done" && state.items.length > 0) {
    content = (
      <ul>
        {state.items.map((item) => {
          const [owner, repo] = item.fullName.split("/");
          return (
            <li key={item.fullName}>
              <Link
                href={scanPath(locale, owner, repo)}
                onClick={close}
                title={dict.verdicts[item.verdict].label}
                className="flex items-center gap-2.5 rounded-xl px-2.5 py-2 transition-colors hover:bg-sunken"
              >
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: VERDICT_STYLE[item.verdict].color }} />
                <span className="sr-only">{dict.verdicts[item.verdict].label}:</span>
                <span className="min-w-0 flex-1 truncate font-mono text-[13px] text-fg">{item.fullName}</span>
                <span className="shrink-0 text-xs text-subtle">{relativeTime(locale, item.scannedAt, state.at)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    );
  } else if (state.kind === "done" || state.kind === "error") {
    const failed = state.kind === "error" || state.failed;
    content = <p className="px-2.5 py-3 text-sm text-muted">{failed ? t.failed : t.empty}</p>;
  } else {
    content = (
      <div className="space-y-1 px-2.5 py-1" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-2.5 py-2">
            <span className="h-2 w-2 rounded-full bg-line-strong" />
            <span className="h-3 flex-1 animate-pulse rounded bg-sunken" />
            <span className="h-3 w-12 animate-pulse rounded bg-sunken" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div
      ref={box}
      className="relative flex items-center"
      onPointerEnter={(e) => e.pointerType === "mouse" && show()}
      onPointerLeave={(e) => e.pointerType === "mouse" && hideSoon()}
    >
      {active && (
        <motion.span
          layoutId="nav-pill"
          className="absolute inset-0 rounded-full border border-line bg-raised shadow-sm"
          transition={{ type: "spring", stiffness: 420, damping: 34 }}
        />
      )}
      <Link
        href={localePath(locale)}
        aria-current={active ? "page" : undefined}
        className={`relative rounded-full py-1.5 pl-3 whitespace-nowrap transition-colors ${active ? "text-fg" : "text-muted hover:text-fg"}`}
      >
        {dict.nav.scan}
      </Link>
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={t.open}
        onClick={() => (open ? setOpen(false) : show())}
        className={`relative mr-1 ml-0.5 rounded-full p-1 transition-colors ${open ? "text-fg" : "text-subtle hover:text-fg"}`}
      >
        <svg viewBox="0 0 20 20" className={`h-3.5 w-3.5 transition-transform duration-200 ${open ? "rotate-180" : ""}`} aria-hidden="true">
          <path d="M5 7.5l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            id={panelId}
            role="region"
            aria-label={t.title}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
            className="absolute top-full left-0 z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-line bg-raised p-2 shadow-xl shadow-black/10"
          >
            <p className="px-2.5 pt-1.5 pb-2 text-xs font-semibold tracking-wide text-subtle uppercase">{t.title}</p>
            {content}
            <Link
              href={localePath(locale, "/recent")}
              onClick={close}
              className="group mt-1 flex items-center justify-between rounded-xl border-t border-line px-2.5 pt-2.5 pb-2 text-sm font-medium text-accent transition-colors hover:text-accent-strong"
            >
              {t.seeAll}
              <span className="transition-transform group-hover:translate-x-1">→</span>
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
