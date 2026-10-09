/** All dictionaries, for server code. Client components get theirs from I18nProvider. */

import type { Locale } from "../config";
import { type Dictionary, en } from "./en";
import { tr } from "./tr";

export type { Dictionary, RuleText } from "./en";

export const DICTIONARIES: Record<Locale, Dictionary> = { en, tr };

export function getDictionary(locale: Locale): Dictionary {
  return DICTIONARIES[locale];
}
