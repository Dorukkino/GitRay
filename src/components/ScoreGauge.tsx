"use client";

import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { useEffect } from "react";

import type { Verdict } from "@/engine";
import { fmt } from "@/i18n/format";
import { useI18n } from "@/i18n/provider";

import { VERDICT_STYLE } from "./verdict";

/** The risk score as a ring that fills up while the number counts to the score. */
export function ScoreGauge({ score, verdict, size = 140 }: { score: number; verdict: Verdict; size?: number }) {
  const { dict } = useI18n();
  const reduce = useReducedMotion();
  const r = 52;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score)) / 100;
  const shown = useMotionValue(0);
  const rounded = useTransform(shown, (v) => Math.round(v));

  useEffect(() => {
    const controls = animate(shown, score, { duration: reduce ? 0 : 1.2, ease: [0.22, 1, 0.36, 1] });
    return () => controls.stop();
  }, [shown, score, reduce]);

  return (
    <svg viewBox="0 0 120 120" width={size} height={size} role="img" aria-label={fmt(dict.report.gaugeLabel, { score })}>
      <circle cx="60" cy="60" r={r} fill="none" stroke="var(--line)" strokeWidth="10" />
      <motion.circle
        cx="60"
        cy="60"
        r={r}
        fill="none"
        stroke={VERDICT_STYLE[verdict].color}
        strokeWidth="10"
        strokeLinecap="round"
        transform="rotate(-90 60 60)"
        initial={{ strokeDasharray: `0 ${c}` }}
        animate={{ strokeDasharray: `${c * pct} ${c}` }}
        transition={{ duration: reduce ? 0 : 1.2, ease: [0.22, 1, 0.36, 1] }}
      />
      <motion.text x="60" y="58" textAnchor="middle" className="fill-fg font-sans" fontSize="30" fontWeight="700">
        {rounded}
      </motion.text>
      <text x="60" y="78" textAnchor="middle" className="fill-subtle font-sans" fontSize="11">
        {dict.report.gaugeSuffix}
      </text>
    </svg>
  );
}
