"use client";

import { AnimatePresence, motion } from "motion/react";
import { type FormEvent, useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

import type { Report } from "@/engine";
import { useI18n } from "@/i18n/provider";

type Status = "idle" | "sending" | "sent" | "error";

/** The "this result is wrong" form, shown as a centered modal above the report. */
export function ReportFalseFinding({ report, onClose }: { report: Report; onClose: () => void }) {
  const { dict } = useI18n();
  const t = dict.report;
  const titleId = useId();
  const [visible, setVisible] = useState(true);
  const [reason, setReason] = useState("");
  const [answer, setAnswer] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const answerRef = useRef<HTMLInputElement | null>(null);

  // Closing plays the exit animation first; onExitComplete then unmounts via the parent.
  const close = useCallback(() => setVisible(false), []);

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

  useEffect(() => {
    // Lock the page behind the modal, close on Escape, and focus the first field.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    answerRef.current?.focus();
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
  }, [close]);

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

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence onExitComplete={onClose}>
      {visible && (
        <motion.div
          key="report-modal"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={close}
          className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-black/50 p-4"
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="my-auto max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-line bg-surface p-5 text-sm text-fg shadow-xl"
          >
            {status === "sent" ? (
              <div className="flex flex-col items-start gap-3">
                <h3 id={titleId} className="font-semibold text-fg">
                  {t.reportTitle}
                </h3>
                <p className="text-clean">{t.reportSuccess}</p>
                <button
                  type="button"
                  onClick={close}
                  className="rounded-full bg-sunken px-3 py-1 text-xs text-fg transition-colors hover:bg-line"
                >
                  {t.reportClose}
                </button>
              </div>
            ) : (
              <form onSubmit={onSubmit} className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 id={titleId} className="font-semibold text-fg">
                      {t.reportTitle}
                    </h3>
                    <p className="mt-1 text-xs text-muted">{t.reportIntro}</p>
                  </div>
                  <button
                    type="button"
                    onClick={close}
                    aria-label={t.reportClose}
                    className="shrink-0 rounded-full bg-sunken px-2.5 py-1 text-xs text-muted transition-colors hover:bg-line hover:text-fg"
                  >
                    ✕
                  </button>
                </div>

                {/* Verification first, then the reason — the owner reviews real reports, not bots. */}
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
                      ref={answerRef}
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

                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={t.reportPlaceholder}
                  rows={4}
                  maxLength={2000}
                  className="min-h-24 w-full rounded-xl border border-transparent bg-sunken/60 px-3.5 py-2.5 text-sm text-fg outline-none transition placeholder:text-subtle focus:border-accent/50 focus:bg-raised focus:ring-4 focus:ring-accent/15"
                />

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
              </form>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
