"use client";

import { motion } from "motion/react";
import { useLayoutEffect } from "react";

import { useI18n } from "@/i18n/provider";

import { type Theme, applyTheme, themePref, usePref } from "./prefs";

function Icon({ theme }: { theme: Theme }) {
  const common = { width: 15, height: 15, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;
  if (theme === "light")
    return (
      <svg {...common} aria-hidden="true">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
    );
  if (theme === "dark")
    return (
      <svg {...common} aria-hidden="true">
        <path d="M20.5 14.5A8.5 8.5 0 1 1 9.5 3.5a7 7 0 0 0 11 11z" />
      </svg>
    );
  return (
    <svg {...common} aria-hidden="true">
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </svg>
  );
}

const THEMES: Theme[] = ["system", "light", "dark"];

export function ThemeToggle() {
  const { dict } = useI18n();
  const theme = usePref(themePref);

  // React resets <html> attributes when it remounts in development; put the saved theme back.
  useLayoutEffect(() => applyTheme(themePref.get()), []);

  return (
    <div role="radiogroup" aria-label={dict.theme.label} className="flex items-center rounded-full border border-line bg-surface/70 p-0.5">
      {THEMES.map((t) => (
        <button
          key={t}
          type="button"
          role="radio"
          aria-checked={theme === t}
          title={dict.theme[t]}
          onClick={() => {
            themePref.set(t);
            applyTheme(t);
          }}
          className={`relative flex h-7 w-7 items-center justify-center rounded-full transition-colors ${
            theme === t ? "text-on-accent" : "text-subtle hover:text-fg"
          }`}
        >
          {theme === t && (
            <motion.span layoutId="theme-pill" className="absolute inset-0 rounded-full bg-accent" transition={{ type: "spring", stiffness: 500, damping: 35 }} />
          )}
          <span className="relative">
            <Icon theme={t} />
          </span>
          <span className="sr-only">{dict.theme[t]}</span>
        </button>
      ))}
    </div>
  );
}
