/** The page's language in Server Components, read from the [lang] root segment. */

import { notFound } from "next/navigation";
import { lang } from "next/root-params";

import { type Locale, isLocale } from "./config";
import { type Dictionary, getDictionary } from "./dictionaries";

export async function pageLocale(): Promise<{ locale: Locale; dict: Dictionary }> {
  const locale = await lang();
  if (!isLocale(locale)) notFound();
  return { locale, dict: getDictionary(locale) };
}
