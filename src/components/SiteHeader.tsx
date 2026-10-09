"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { localePath } from "@/i18n/config";
import { useI18n } from "@/i18n/provider";

import { LanguageSwitcher } from "./LanguageSwitcher";
import { ThemeToggle } from "./ThemeToggle";

/** The logo turns once like a coin, rests, and turns again. */
function BrandLogo() {
  const { locale, dict } = useI18n();
  return (
    <Link href={localePath(locale)} aria-label={dict.logo} className="shrink-0 [perspective:700px]">
      <motion.img
        src="/brand/gitray-logo.svg"
        alt="GitRay"
        width={108}
        height={40}
        className="h-10 w-[108px] rounded-lg shadow-md ring-1 shadow-black/10 ring-black/5"
        animate={{ rotateY: 360 }}
        transition={{ duration: 1.6, ease: [0.65, 0, 0.35, 1], repeat: Infinity, repeatDelay: 4.5, delay: 1.2 }}
        whileHover={{ scale: 1.04 }}
      />
    </Link>
  );
}

export function SiteHeader() {
  const { locale, dict } = useI18n();
  const pathname = usePathname() ?? "";
  const nav = [
    { href: localePath(locale), label: dict.nav.scan, active: (p: string) => p === `/${locale}` || p.startsWith(`/${locale}/scan/`) },
    { href: localePath(locale, "/safe-zone"), label: dict.nav.safeZone },
    { href: localePath(locale, "/scammer"), label: dict.nav.scammer },
    { href: localePath(locale, "/rules"), label: dict.nav.rules },
  ];
  return (
    <header className="sticky top-0 z-40 border-b border-line/80 bg-bg/75 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <BrandLogo />
        <nav aria-label={dict.nav.label} className="order-3 -mx-1 flex w-full items-center gap-1 overflow-x-auto text-sm md:order-none md:w-auto">
          {nav.map((item) => {
            const active = item.active ? item.active(pathname) : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`relative rounded-full px-3 py-1.5 whitespace-nowrap transition-colors ${active ? "text-fg" : "text-muted hover:text-fg"}`}
              >
                {active && (
                  <motion.span
                    layoutId="nav-pill"
                    className="absolute inset-0 rounded-full border border-line bg-raised shadow-sm"
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  />
                )}
                <span className="relative">{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <LanguageSwitcher />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
