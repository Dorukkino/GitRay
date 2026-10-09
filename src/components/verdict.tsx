import type { Category, Severity, Verdict } from "@/engine";

/** Colour classes per verdict; labels and summaries come from the dictionary. */
export const VERDICT_STYLE: Record<Verdict, { text: string; bg: string; ring: string; border: string; color: string }> = {
  clean: { text: "text-clean", bg: "bg-clean/10", ring: "ring-clean/30", border: "border-clean/30", color: "var(--clean)" },
  suspicious: {
    text: "text-suspicious",
    bg: "bg-suspicious/10",
    ring: "ring-suspicious/30",
    border: "border-suspicious/30",
    color: "var(--suspicious)",
  },
  dangerous: {
    text: "text-dangerous",
    bg: "bg-dangerous/10",
    ring: "ring-dangerous/30",
    border: "border-dangerous/30",
    color: "var(--dangerous)",
  },
  incomplete: {
    text: "text-incomplete",
    bg: "bg-incomplete/10",
    ring: "ring-incomplete/30",
    border: "border-incomplete/30",
    color: "var(--incomplete)",
  },
};

export const SEVERITY_STYLE: Record<Severity, string> = {
  high: "bg-dangerous/12 text-dangerous ring-dangerous/30",
  medium: "bg-suspicious/12 text-suspicious ring-suspicious/30",
  low: "bg-subtle/12 text-muted ring-subtle/30",
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

export function VerdictBadge({ verdict, label, size = "md" }: { verdict: Verdict; label: string; size?: "md" | "lg" }) {
  const s = VERDICT_STYLE[verdict];
  const sizing = size === "lg" ? "px-3.5 py-1.5 text-base" : "px-2.5 py-1 text-xs";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full font-semibold ring-1 ${s.bg} ${s.text} ${s.ring} ${sizing}`}>
      <span className="relative flex h-2 w-2">
        {verdict === "dangerous" && <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" style={{ background: s.color }} />}
        <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: s.color }} />
      </span>
      {label}
    </span>
  );
}
