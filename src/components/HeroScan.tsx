"use client";

/**
 * The hero picture: an x-ray film of a made-up repository. A beam sweeps down
 * and each file it passes shows what GitRay would say about it. Only file
 * names are shown; there is no code here.
 */

import { motion, useReducedMotion } from "motion/react";

import { useI18n } from "@/i18n/provider";

type Tone = "clean" | "suspicious" | "dangerous";

const LOOP = 7;
const SWEEP = 0.62; // share of the loop the beam needs to reach the bottom
// Row geometry in pixels (h-9 rows, space-y-1, py-4 list): the beam line moves from 0 to BEAM_TRAVEL.
const ROW_TOP = 34;
const ROW_STEP = 40;
const BEAM_TRAVEL = 336;

export function HeroScan() {
  const { dict } = useI18n();
  const p = dict.home.panel;
  const reduce = useReducedMotion();
  const rows: { file: string; tag: string; tone: Tone; points?: number }[] = [
    { file: "README.md", tag: p.clean, tone: "clean" },
    { file: "package.json", tag: p.install, tone: "suspicious", points: 10 },
    { file: ".vscode/tasks.json", tag: p.open, tone: "dangerous", points: 35 },
    { file: "src/index.js", tag: p.hidden, tone: "dangerous", points: 40 },
    { file: "bin/helper.exe", tag: p.program, tone: "dangerous", points: 20 },
    { file: "LICENSE", tag: p.clean, tone: "clean" },
  ];
  const tone: Record<Tone, string> = {
    clean: "text-clean bg-clean/15 ring-clean/30",
    suspicious: "text-suspicious bg-suspicious/15 ring-suspicious/30",
    dangerous: "text-dangerous bg-dangerous/15 ring-dangerous/30",
  };

  return (
    <div className="film relative overflow-hidden rounded-2xl border border-film-line shadow-2xl ring-1 shadow-[#0b1a38]/25 ring-accent/15">
      <div className="flex items-center gap-2 border-b border-film-line/80 px-4 py-3">
        <span className="h-2.5 w-2.5 rounded-full bg-[#ff7d92]/80" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#f8bd52]/80" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#4ddc9c]/80" />
        <span className="ml-2 truncate font-mono text-xs text-film-fg/70">{p.title}</span>
      </div>

      <ul className="relative space-y-1 px-4 py-4 font-mono text-[13px]">
        {rows.map((row, i) => {
          // The moment the beam line passes the middle of this row, as a share of the loop.
          const at = SWEEP * ((ROW_TOP + i * ROW_STEP) / BEAM_TRAVEL);
          return (
            <li key={row.file} className="flex h-9 items-center justify-between gap-3 rounded-lg px-2">
              <span className="truncate text-film-fg/85">{row.file}</span>
              <motion.span
                className={`shrink-0 rounded-full px-2 py-0.5 font-sans text-[11px] font-semibold ring-1 ${tone[row.tone]}`}
                initial={reduce ? false : { opacity: 0, scale: 0.85 }}
                animate={reduce ? undefined : { opacity: [0, 0, 1, 1, 0], scale: [0.85, 0.85, 1, 1, 0.85] }}
                transition={{ duration: LOOP, times: [0, at, at + 0.04, 0.94, 1], repeat: Infinity, ease: "easeOut" }}
              >
                {row.tag}
                {row.points && <span className="ml-1 opacity-70">+{row.points}</span>}
              </motion.span>
            </li>
          );
        })}
        {!reduce && (
          <motion.div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-16"
            initial={{ y: "-4rem" }}
            animate={{ y: ["-4rem", "17rem", "17rem"], opacity: [1, 1, 0] }}
            transition={{ duration: LOOP, times: [0, SWEEP, SWEEP + 0.05], repeat: Infinity, ease: "linear" }}
          >
            <div className="h-full bg-gradient-to-b from-transparent to-[#3d9bff]/25" />
            <div className="h-[2px] bg-[#d6f0ff] shadow-[0_0_12px_#4aa8ff,0_0_24px_#1f6fff]" />
          </motion.div>
        )}
      </ul>

      <div className="flex items-center justify-between border-t border-film-line/80 px-4 py-3 text-xs">
        <span className="text-film-fg/60">{p.note}</span>
        <motion.span
          className="rounded-full bg-[#ff7d92]/15 px-2.5 py-1 font-semibold text-[#ff9aab] ring-1 ring-[#ff7d92]/40"
          initial={reduce ? false : { opacity: 0 }}
          animate={reduce ? undefined : { opacity: [0, 0, 1, 1, 0] }}
          transition={{ duration: LOOP, times: [0, SWEEP, SWEEP + 0.05, 0.94, 1], repeat: Infinity }}
        >
          {dict.verdicts.dangerous.label} · 100
        </motion.span>
      </div>
    </div>
  );
}
