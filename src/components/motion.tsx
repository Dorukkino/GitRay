"use client";

/** Shared Motion pieces. MotionConfig in Providers turns movement off for visitors who ask for reduced motion. */

import { motion, useMotionValue, useMotionValueEvent, useReducedMotion, useScroll, useSpring, useTransform } from "motion/react";
import { type ReactNode, useEffect, useRef } from "react";

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

/** A card that rises a little under the pointer. */
export function Lift({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div className={className} whileHover={{ y: -4 }} transition={{ type: "spring", stiffness: 380, damping: 26 }}>
      {children}
    </motion.div>
  );
}

/** Share of the viewport height the reader scrolls while a card comes in. */
const SCRUB_DISTANCE = 0.45;
/** Extra scroll before the next card of the same row starts, as a share of the viewport. */
const SCRUB_COLUMN_DELAY = 0.08;

/**
 * Tied to the scroll position instead of a timer: the card is hidden while the
 * page sits at the top and comes in as fast as the reader scrolls (and goes
 * back when they scroll up). The outer box is measured, the inner one moves,
 * so the movement never changes the measurement.
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
  const scale = useTransform(smooth, [0, 1], [0.93, 1]);

  const update = (scroll: number) => {
    const { start, end } = range.current;
    progress.set(Math.min(1, Math.max(0, (scroll - start) / (end - start))));
  };

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => {
      const vh = window.innerHeight;
      const top = el.getBoundingClientRect().top + window.scrollY;
      // Starts when the card's top reaches the bottom of the screen, or with the first scroll if it is already on screen.
      const start = Math.max(0, top - vh * 0.95) + column * vh * SCRUB_COLUMN_DELAY;
      range.current = { start, end: start + vh * SCRUB_DISTANCE };
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

  return (
    <div ref={box} className={className}>
      <motion.div className="h-full" style={reduce ? undefined : { opacity, y, scale }}>
        {children}
      </motion.div>
    </div>
  );
}
