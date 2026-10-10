"use client";

/** Shared Motion pieces. MotionConfig in Providers turns movement off for visitors who ask for reduced motion. */

import {
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from "motion/react";
import { type CSSProperties, type ReactNode, useEffect, useRef } from "react";

import { INTL_LOCALE } from "@/i18n/config";
import { useI18n } from "@/i18n/provider";

const EASE = [0.22, 1, 0.36, 1] as const;

/** Fades and slides in once, when scrolled into view. */
export function Reveal({
  children,
  delay = 0,
  className,
  as = "div",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  as?: "div" | "section" | "li" | "article";
}) {
  const Tag = motion[as];
  return (
    <Tag
      className={className}
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.55, delay, ease: EASE }}
    >
      {children}
    </Tag>
  );
}

/** A card that rises a little under the pointer and stands out from the page (.lift in globals.css). */
export function Lift({ children, className, style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <motion.div className={`lift ${className ?? ""}`} style={style} whileHover={{ y: -4 }} transition={{ type: "spring", stiffness: 380, damping: 26 }}>
      {children}
    </motion.div>
  );
}

/** Share of the viewport height the reader scrolls while a card comes in. */
const SCRUB_DISTANCE = 0.45;
/** Extra scroll before the next card of the same row starts, as a share of the viewport. */
const SCRUB_COLUMN_DELAY = 0.08;
/** Quiet time after the last scroll event that counts as "the reader stopped". */
const SCROLL_IDLE_MS = 150;

const idleListeners = new Set<() => void>();
let idleTimer: number | undefined;
const onScroll = () => {
  window.clearTimeout(idleTimer);
  idleTimer = window.setTimeout(() => {
    for (const listener of idleListeners) listener();
  }, SCROLL_IDLE_MS);
};

/** One shared window listener tells every card when scrolling has stopped. */
function onScrollIdle(listener: () => void): () => void {
  if (idleListeners.size === 0) window.addEventListener("scroll", onScroll, { passive: true });
  idleListeners.add(listener);
  return () => {
    idleListeners.delete(listener);
    if (idleListeners.size === 0) {
      window.removeEventListener("scroll", onScroll);
      window.clearTimeout(idleTimer);
    }
  };
}

/**
 * Tied to the scroll position instead of a timer: the card is hidden while the
 * page sits at the top and comes in as fast as the reader scrolls. It comes in
 * once: scrolling back up leaves it in place, and when the reader stops
 * scrolling every card on screen finishes on its own, so a row never rests half
 * in and staggered. Once fully in, it stops listening to the scroll. The outer
 * box is measured, the inner one moves, so the movement never changes the
 * measurement.
 */
export function ScrollReveal({ children, className, column = 0 }: { children: ReactNode; className?: string; column?: number }) {
  const box = useRef<HTMLDivElement>(null);
  const range = useRef({ start: 0, end: 1 });
  const reduce = useReducedMotion();
  const { scrollY } = useScroll();
  const progress = useMotionValue(0);
  // A light spring smooths the steps of a mouse wheel without lagging behind it.
  const smooth = useSpring(progress, { stiffness: 260, damping: 32, mass: 0.35 });
  const opacity = useTransform(smooth, [0, 0.7], [0, 1]);
  const y = useTransform(smooth, [0, 1], [90, 0]);

  const done = useRef(false);
  const lastScroll = useRef(0);
  const update = (scroll: number) => {
    if (done.current) return;
    const up = scroll < lastScroll.current;
    lastScroll.current = scroll;
    const { start, end } = range.current;
    let next = Math.min(1, Math.max(0, (scroll - start) / (end - start)));
    // Only forward: a card that came in stays, and one caught halfway when the reader turns back finishes on its own.
    if (up && progress.get() > 0) next = 1;
    if (next <= progress.get()) return;
    progress.set(next);
    if (next >= 1) done.current = true;
  };

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => {
      if (done.current) return;
      const vh = window.innerHeight;
      const top = el.getBoundingClientRect().top + window.scrollY;
      const distance = vh * SCRUB_DISTANCE;
      const maxScroll = document.documentElement.scrollHeight - vh;
      // Starts when the card's top reaches the bottom of the screen, or with the first scroll if it is already on screen.
      let start = Math.max(0, top - vh * 0.95) + column * vh * SCRUB_COLUMN_DELAY;
      let end = start + distance;
      // Cards near the end of the page must be in place once the reader cannot scroll any further.
      if (end > maxScroll) {
        end = maxScroll;
        start = Math.max(0, Math.min(start, end - distance / 2));
      }
      // A page too short to scroll shows everything.
      range.current = end > start ? { start, end } : { start: -1, end: 0 };
      update(window.scrollY);
    };
    measure();
    // Fonts and images that load later move the cards.
    const observer = new ResizeObserver(measure);
    observer.observe(document.body);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
    // update only reads refs and stable motion values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [column]);

  useMotionValueEvent(scrollY, "change", update);

  // When scrolling stops, finish the card if any part of it is on screen.
  useEffect(
    () =>
      onScrollIdle(() => {
        const el = box.current;
        if (done.current || !el) return;
        const rect = el.getBoundingClientRect();
        if (rect.top < window.innerHeight && rect.bottom > 0) {
          progress.set(1);
          done.current = true;
        }
      }),
    [progress],
  );

  return (
    <div ref={box} className={className}>
      <motion.div className="h-full will-change-transform" style={reduce ? undefined : { opacity, y }}>
        {children}
      </motion.div>
    </div>
  );
}

/** A number that counts up from zero when the page opens. */
export function CountUp({ value, className }: { value: number; className?: string }) {
  const { locale } = useI18n();
  const reduce = useReducedMotion();
  const shown = useMotionValue(0);
  const text = useTransform(shown, (v) => Math.round(v).toLocaleString(INTL_LOCALE[locale]));

  useEffect(() => {
    const controls = animate(shown, value, { duration: reduce ? 0 : 1.6, ease: EASE });
    return () => controls.stop();
  }, [shown, value, reduce]);

  return <motion.span className={className}>{text}</motion.span>;
}
