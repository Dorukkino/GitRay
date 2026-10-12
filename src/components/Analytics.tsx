"use client";

/**
 * Google Analytics, only with the visitor's consent. The notice asks once on
 * the real site (analyticsHost); nothing from Google loads before "Accept",
 * and "Reject" never loads it. "Cookie settings" in the footer asks again;
 * withdrawing consent deletes the Google cookies and reloads the page, which
 * unloads the script.
 */

import Link from "next/link";
import { useEffect, useRef, useSyncExternalStore } from "react";

import { localePath } from "@/i18n/config";
import { useI18n } from "@/i18n/provider";
import { GA_MEASUREMENT_ID, analyticsHost } from "@/lib/site";

import { type Consent, consentPref, usePref } from "./prefs";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

const noSubscribe = () => () => {};

/** True only in the browser on the production domain. */
function useAnalyticsHost(): boolean {
  return useSyncExternalStore(noSubscribe, () => analyticsHost(window.location.hostname), () => false);
}

function loadGoogleAnalytics(): void {
  if (window.gtag) return;
  window.dataLayer = window.dataLayer ?? [];
  // gtag.js expects the arguments object itself, not an array.
  window.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer?.push(arguments);
  };
  window.gtag("js", new Date());
  window.gtag("config", GA_MEASUREMENT_ID);
  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
  document.head.appendChild(script);
}

/** Removes the _ga cookies Google set on this host and its parent domain. */
function deleteGoogleCookies(): void {
  const host = window.location.hostname;
  const domains = ["", host, `.${host.replace(/^www\./, "")}`];
  for (const part of document.cookie.split(";")) {
    const name = part.split("=")[0]?.trim();
    if (!name || !name.startsWith("_ga")) continue;
    for (const domain of domains) {
      document.cookie = `${name}=; Max-Age=0; path=/${domain ? `; domain=${domain}` : ""}`;
    }
  }
}

export function Analytics() {
  const { locale, dict } = useI18n();
  const t = dict.consent;
  const enabled = useAnalyticsHost();
  const consent = usePref(consentPref);
  const loaded = useRef(false);

  useEffect(() => {
    if (enabled && consent === "granted" && !loaded.current) {
      loaded.current = true;
      loadGoogleAnalytics();
    }
  }, [enabled, consent]);

  if (!enabled || consent !== "unset") return null;

  const answer = (value: Exclude<Consent, "unset">) => {
    consentPref.set(value);
    if (value === "denied" && loaded.current) {
      deleteGoogleCookies();
      window.location.reload();
    }
  };

  return (
    <div role="dialog" aria-live="polite" aria-label={t.title} className="fixed inset-x-0 bottom-0 z-50 p-3 sm:p-4">
      <div className="animate-enter mx-auto flex max-w-3xl flex-col gap-3 rounded-2xl border border-line bg-raised p-4 shadow-xl shadow-black/15 sm:flex-row sm:items-center sm:gap-5">
        <p className="flex-1 text-sm leading-relaxed text-muted">
          {t.text}{" "}
          <Link href={localePath(locale, "/privacy")} className="text-accent underline decoration-accent/40 underline-offset-2">
            {t.more}
          </Link>
        </p>
        {/* Both answers look the same: rejecting must be as easy as accepting. */}
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => answer("denied")}
            className="flex-1 rounded-xl border border-line bg-surface px-4 py-2 text-sm font-medium text-fg transition-colors hover:border-accent/50 sm:flex-none"
          >
            {t.reject}
          </button>
          <button
            type="button"
            onClick={() => answer("granted")}
            className="flex-1 rounded-xl border border-line bg-surface px-4 py-2 text-sm font-medium text-fg transition-colors hover:border-accent/50 sm:flex-none"
          >
            {t.accept}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Footer link that asks the analytics question again (only where analytics can run). */
export function ConsentSettingsButton() {
  const { dict } = useI18n();
  const enabled = useAnalyticsHost();
  if (!enabled) return null;
  return (
    <button type="button" onClick={() => consentPref.set("unset")} className="text-muted transition-colors hover:text-fg">
      {dict.consent.settings}
    </button>
  );
}
