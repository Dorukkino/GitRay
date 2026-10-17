/** The rule registry. Every rule needs positive and negative fixtures in tests/fixtures/rules/. */

import { RULES as AUTORUN } from "./autorun";
import type { Rule } from "./base";
import { RULES as BEHAVIOR } from "./behavior";
import { RULES as BINARY } from "./binary";
import { RULES as CODE } from "./code";
import { RULES as DEPS } from "./deps";
import { RULES as DEVTOOLS } from "./devtools";
import { RULES as LINKS } from "./links";
import { RULES as OBFUSCATION } from "./obfuscation";
import { RULES as REPO } from "./repo";

export type { Hit, Rule, RuleMeta } from "./base";

const ALL: readonly Rule[] = [...BEHAVIOR, ...AUTORUN, ...DEVTOOLS, ...CODE, ...OBFUSCATION, ...LINKS, ...BINARY, ...DEPS, ...REPO];

export function allRules(): readonly Rule[] {
  return ALL;
}

export function getRule(id: string): Rule {
  const rule = ALL.find((r) => r.id === id);
  if (!rule) throw new Error(`unknown rule ${id}`);
  return rule;
}
