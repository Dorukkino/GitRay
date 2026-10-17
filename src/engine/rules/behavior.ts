/**
 * GR-BEH-*: behavior chains. These rules do not match a word or a pattern; they
 * read the file as code and follow data from a sensitive source to a sink
 * (analyze.ts). A finding means the data actually flows there, and its note and
 * chain explain the path step by step. This is what tells a credential stealer
 * from a password manager and a loader from a plugin host.
 */

import { type Behavior, type Chain, analyzeFile, describeChain } from "../behavior/analyze";
import { splitLines } from "../text";
import type { TextFile } from "../types";
import type { Hit, Rule } from "./base";

interface BehaviorRule {
  behavior: Behavior;
  id: string;
  title: string;
  weight: number;
  why: string;
}

const BEHAVIORS: readonly BehaviorRule[] = [
  {
    behavior: "steals-credentials",
    id: "GR-BEH-001",
    title: "Reads saved credentials and sends them out",
    weight: 70,
    why:
      "The code reads a browser password store, a crypto wallet, SSH keys or other saved " +
      "credentials and then sends that data over the network. Following the data from the file " +
      "it reads to the request it makes is how an info-stealer is told apart from a password " +
      "manager, which never ships your secrets anywhere.",
  },
  {
    behavior: "downloads-and-runs",
    id: "GR-BEH-002",
    title: "Downloads code and runs it",
    weight: 50,
    why:
      "The code fetches content from the network and hands it straight to an interpreter " +
      "(eval, Function, Invoke-Expression, Assembly.Load). Whoever controls that URL controls " +
      "the machine, and nobody reviewing the repository can see what actually runs.",
  },
  {
    behavior: "decodes-and-runs",
    id: "GR-BEH-003",
    title: "Decodes a hidden blob and runs it",
    weight: 60,
    why:
      "The code decodes a base64 or compressed blob and then executes the result. Legitimate " +
      "projects rarely hide the code they run; this is how a payload gets past a reviewer who " +
      "only sees an opaque string.",
  },
];

function lineText(lines: string[], line: number): string {
  return (lines[line - 1] ?? "").trim();
}

function makeRule({ behavior, id, title, weight, why }: BehaviorRule): Rule {
  return {
    id,
    title,
    category: "behavior",
    weight,
    why,
    *scanText(file: TextFile): Iterable<Hit> {
      const chains = analyzeFile(file).filter((c: Chain) => c.behavior === behavior);
      if (chains.length === 0) return;
      const lines = splitLines(file.content);
      for (const chain of chains) {
        const sink = chain.steps[chain.steps.length - 1];
        yield { line: sink.line, text: lineText(lines, sink.line), column: 0, note: describeChain(chain), chain: chain.steps };
      }
    },
  };
}

export const RULES: readonly Rule[] = BEHAVIORS.map(makeRule);
