import type { Category, Severity, Verdict } from "@/engine";

export const VERDICT_STYLE: Record<
  Verdict,
  { label: string; text: string; bg: string; ring: string; stroke: string; summary: string }
> = {
  clean: {
    label: "Clean",
    text: "text-emerald-300",
    bg: "bg-emerald-500/10",
    ring: "ring-emerald-400/30",
    stroke: "#34d399",
    summary:
      "No known malware tricks were found. That is not a guarantee: GitRay looks for known patterns and does not run the code.",
  },
  suspicious: {
    label: "Suspicious",
    text: "text-amber-300",
    bg: "bg-amber-500/10",
    ring: "ring-amber-400/30",
    stroke: "#fbbf24",
    summary:
      "Some patterns that malware uses were found. Read the findings before you install, build or run anything from this repository.",
  },
  dangerous: {
    label: "Dangerous",
    text: "text-rose-300",
    bg: "bg-rose-500/10",
    ring: "ring-rose-400/30",
    stroke: "#fb7185",
    summary:
      "Several strong signs of malware. Do not clone, install, build or open this repository in an IDE unless you understand every finding.",
  },
  incomplete: {
    label: "Incomplete",
    text: "text-sky-300",
    bg: "bg-sky-500/10",
    ring: "ring-sky-400/30",
    stroke: "#38bdf8",
    summary:
      "A safety limit stopped the scan before every file was read. The part that was read looks clean, but a partial scan is never called clean: the payload could be in the unread part.",
  },
};

export const SEVERITY_STYLE: Record<Severity, string> = {
  high: "bg-rose-500/15 text-rose-300 ring-rose-400/30",
  medium: "bg-amber-500/15 text-amber-300 ring-amber-400/30",
  low: "bg-slate-500/15 text-slate-300 ring-slate-400/30",
};

export const CATEGORY_LABEL: Record<Category, string> = {
  autorun: "Runs automatically",
  code: "Malicious code patterns",
  obfuscation: "Hidden or obfuscated content",
  links: "Download links",
  social: "Social engineering",
  binary: "Binary files",
  repo: "Repository signals",
  dependencies: "Malicious dependencies",
  ci: "CI workflows",
};

export const CATEGORY_ORDER: Category[] = [
  "dependencies",
  "autorun",
  "code",
  "obfuscation",
  "links",
  "social",
  "binary",
  "repo",
  "ci",
];

export function VerdictBadge({ verdict, size = "md" }: { verdict: Verdict; size?: "md" | "lg" }) {
  const s = VERDICT_STYLE[verdict];
  const sizing = size === "lg" ? "px-3.5 py-1.5 text-base" : "px-2.5 py-1 text-xs";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full font-semibold ring-1 ${s.bg} ${s.text} ${s.ring} ${sizing}`}>
      <span className="h-2 w-2 rounded-full" style={{ background: s.stroke }} />
      {s.label}
    </span>
  );
}

export function ScoreGauge({ score, verdict, size = 132 }: { score: number; verdict: Verdict; size?: number }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score)) / 100;
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} role="img" aria-label={`Risk score ${score} out of 100`}>
      <circle cx="60" cy="60" r={r} fill="none" stroke="rgb(148 163 184 / 0.15)" strokeWidth="10" />
      <circle
        cx="60"
        cy="60"
        r={r}
        fill="none"
        stroke={VERDICT_STYLE[verdict].stroke}
        strokeWidth="10"
        strokeLinecap="round"
        strokeDasharray={`${c * pct} ${c}`}
        transform="rotate(-90 60 60)"
      />
      <text x="60" y="58" textAnchor="middle" className="fill-slate-100 font-sans" fontSize="30" fontWeight="700">
        {score}
      </text>
      <text x="60" y="78" textAnchor="middle" className="fill-slate-400 font-sans" fontSize="11">
        / 100 risk
      </text>
    </svg>
  );
}
