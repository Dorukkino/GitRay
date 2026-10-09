"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { LOCALES, LOCALE_COOKIE, LOCALE_NAMES, type Locale, switchLocalePath } from "@/i18n/config";
import { useI18n } from "@/i18n/provider";

function remember(locale: Locale) {
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; SameSite=Lax`;
}

export function LanguageSwitcher() {
  const { locale, dict } = useI18n();
  const pathname = usePathname() ?? `/${locale}`;
  return (
    <nav aria-label={dict.language.label} className="flex items-center rounded-full border border-line bg-surface/70 p-0.5 text-xs font-semibold">
      {LOCALES.map((l) => (
        <Link
          key={l}
          href={switchLocalePath(pathname, l)}
          hrefLang={l}
          lang={l}
          title={LOCALE_NAMES[l]}
          aria-current={l === locale ? "true" : undefined}
          onClick={() => remember(l)}
          className={`relative rounded-full px-2.5 py-1.5 uppercase transition-colors ${l === locale ? "text-on-accent" : "text-subtle hover:text-fg"}`}
        >
          {l === locale && (
            <motion.span layoutId="lang-pill" className="absolute inset-0 rounded-full bg-accent" transition={{ type: "spring", stiffness: 500, damping: 35 }} />
          )}
          <span className="relative">{l}</span>
        </Link>
      ))}
    </nav>
  );
}
