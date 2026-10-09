"use client";

import { type ReactNode, createContext, useContext, useMemo } from "react";

import type { Locale } from "./config";
import { type Dictionary, en } from "./dictionaries/en";

interface I18n {
  locale: Locale;
  dict: Dictionary;
}

// English when no provider is mounted (tests, isolated renders).
const I18nContext = createContext<I18n>({ locale: "en", dict: en });

export function I18nProvider({ locale, dict, children }: I18n & { children: ReactNode }) {
  const value = useMemo(() => ({ locale, dict }), [locale, dict]);
  return <I18nContext value={value}>{children}</I18nContext>;
}

export function useI18n(): I18n {
  return useContext(I18nContext);
}
