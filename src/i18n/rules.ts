import type { Dictionary, RuleText } from "./dictionaries/en";

/** A rule's title and explanation in the page's language, or the engine's English text. */
export function ruleText(dict: Dictionary, id: string, fallback: RuleText): RuleText {
  return dict.rules[id] ?? fallback;
}
