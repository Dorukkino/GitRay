"use client";

import { AnimatePresence, motion } from "motion/react";
import { type FormEvent, useCallback, useEffect, useState } from "react";

import type { Report } from "@/engine";
import { useI18n } from "@/i18n/provider";

type Status = "idle" | "sending" | "sent" | "error";

/** The "this result is wrong" form, shown below the report summary when opened. */
export function ReportFalseFinding({ report, onClose }: { report: Report; onClose: () => void }) {
  const { dict } = useI18n();
  const t = dict.report;
  const [reason, setReason] = useState("");
  const [answer, setAnswer] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  const loadCaptcha = useCallback(async () => {
    try {
      const r = await fetch("/api/captcha?for=report", { cache: "no-store" });
      const j = (await r.json().catch(() => null)) as { image?: string } | null;
      setImage(j?.image ?? null);
    } catch {
      setImage(null);
    }
  }, []);

  useEffect(() => {
    // Fetching the first captcha on open is exactly what an effect is for (sync with the server);
    // the setState only runs after the await, not synchronously in the effect body.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadCaptcha();
  }, [loadCaptcha]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (status === "sending") return;
    setStatus("sending");
    setError(null);
    try {
      const resp = await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repo: report.target?.fullName ?? "",
          headSha: report.target?.headSha ?? "",
          verdict: report.verdict,
          score: report.score,
          engineVersion: report.engineVersion,
          reason,
          captchaAnswer: answer,
        }),
      });
      const j = (await resp.json().catch(() => null)) as { error?: { code?: string } } | null;
      if (resp.ok) {
        setStatus("sent");
        return;
      }
      const code = j?.error?.code ?? "generic";
      setError(t.reportErrors[code] ?? t.reportErrors.generic);
      setStatus("error");
      setAnswer("");
      void loadCaptcha();
    } catch {
      setError(t.reportErrors.generic);
      setStatus("error");
      setAnswer("");
      void loadCaptcha();
    }
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="rounded-2xl border border-line bg-surface/80 p-4 text-sm text-fg shadow-sm sm:p-5"
    >
      <AnimatePresence mode="wait">
        {status === "sent" ? (
          <motion.div key="done" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-start gap-3">
            <p className="text-clean">{t.reportSuccess}</p>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full bg-sunken px-3 py-1 text-xs text-fg transition-colors hover:bg-line"
            >
              {t.reportClose}
            </button>
          </motion.div>
        ) : (
          <motion.form key="form" onSubmit={onSubmit} className="flex flex-col gap-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold text-fg">{t.reportTitle}</h3>
                <p className="mt-1 text-xs text-muted">{t.reportIntro}</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label={t.reportClose}
                className="shrink-0 rounded-full bg-sunken px-2.5 py-1 text-xs text-muted transition-colors hover:bg-line hover:text-fg"
              >
                ✕
              </button>
            </div>

            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t.reportPlaceholder}
              rows={4}
              maxLength={2000}
              className="min-h-24 w-full rounded-xl border border-transparent bg-sunken/60 px-3.5 py-2.5 text-sm text-fg outline-none transition placeholder:text-subtle focus:border-accent/50 focus:bg-raised focus:ring-4 focus:ring-accent/15"
            />

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex h-[70px] w-[200px] items-center justify-center overflow-hidden rounded-lg border border-line bg-raised">
                {image ? (
                  // The captcha code lives only in these pixels; the answer is never in the DOM or JS.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={image} alt={t.captchaAlt} width={200} height={70} />
                ) : (
                  <span className="text-xs text-subtle">…</span>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <input
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  placeholder={t.captchaLabel}
                  inputMode="text"
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={8}
                  className="h-10 w-40 rounded-xl border border-transparent bg-sunken/60 px-3 font-mono text-sm tracking-widest text-fg outline-none transition placeholder:text-subtle placeholder:tracking-normal focus:border-accent/50 focus:bg-raised focus:ring-4 focus:ring-accent/15"
                />
                <button
                  type="button"
                  onClick={() => {
                    setImage(null);
                    void loadCaptcha();
                  }}
                  className="self-start text-xs text-accent transition-colors hover:underline"
                >
                  {t.captchaRefresh}
                </button>
              </div>
            </div>

            {error && (
              <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="text-sm text-dangerous">
                {error}
              </motion.p>
            )}

            <motion.button
              type="submit"
              disabled={status === "sending" || reason.trim().length < 3 || answer.trim().length < 1}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              className="self-start rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-on-accent shadow-sm disabled:opacity-50"
            >
              {status === "sending" ? t.reportSending : t.reportSubmit}
            </motion.button>
          </motion.form>
        )}
      </AnimatePresence>
    </motion.section>
  );
}
