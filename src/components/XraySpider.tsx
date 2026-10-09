"use client";

/**
 * A small x-ray spider that walks after the mouse pointer. Drawn on a canvas
 * that ignores the pointer, so it never blocks a click. Each leg plants its
 * foot and only steps when the body has moved too far from it, alternating
 * two groups of four legs like a real spider; knees come from two-segment
 * inverse kinematics. It sleeps when it has arrived, and is off on touch
 * screens, for visitors who ask for reduced motion, and when hidden from the
 * footer.
 */

import { useEffect, useRef } from "react";

import { useI18n } from "@/i18n/provider";

import { spiderPref, usePref } from "./prefs";

interface Vec {
  x: number;
  y: number;
}

interface Leg {
  side: 1 | -1;
  index: number;
  group: 0 | 1;
  foot: Vec;
  from: Vec;
  /** 0..1 while stepping, 1 when planted. */
  t: number;
}

// Body frame: +x is forward, +y is to the right of the walking direction.
const HIP_X = [6, 3, 0, -3];
const REST_ANGLE = [0.6, 1.2, 1.9, 2.5];
const REACH = [30, 28, 28, 31];
const FEMUR = 17;
const TIBIA = 19;
const STEP_AT = 14;
const STEP_TIME = 0.11;
const STOP_DISTANCE = 44;
const MAX_SPEED = 380;

const len = (v: Vec) => Math.hypot(v.x, v.y);
const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });

function angleDiff(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

/** Knee of a two-segment leg from hip to foot, bent away from the body. */
function knee(hip: Vec, foot: Vec, side: number): Vec {
  const d = Math.min(FEMUR + TIBIA - 0.01, Math.max(Math.abs(FEMUR - TIBIA) + 0.01, len(sub(foot, hip))));
  const base = Math.atan2(foot.y - hip.y, foot.x - hip.x);
  const cos = (FEMUR * FEMUR + d * d - TIBIA * TIBIA) / (2 * FEMUR * d);
  const angle = base - side * Math.acos(Math.max(-1, Math.min(1, cos)));
  return { x: hip.x + Math.cos(angle) * FEMUR, y: hip.y + Math.sin(angle) * FEMUR };
}

function startSpider(canvas: HTMLCanvasElement): () => void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => {};

  const colors = { bone: "#cfe8ff", film: "#0b1530", eye: "#53d3ea" };
  const readColors = () => {
    const css = getComputedStyle(document.documentElement);
    colors.bone = css.getPropertyValue("--bone").trim() || colors.bone;
    colors.film = css.getPropertyValue("--film").trim() || colors.film;
    colors.eye = css.getPropertyValue("--accent-2").trim() || colors.eye;
  };
  readColors();

  let width = 0;
  let height = 0;
  const resize = () => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();

  // It waits just outside the bottom-right corner and walks in on the first mouse move.
  const body: Vec = { x: width + 50, y: height - 90 };
  const vel: Vec = { x: 0, y: 0 };
  const pointer: Vec = { ...body };
  let heading = Math.PI;

  const toWorld = (lx: number, ly: number): Vec => {
    const c = Math.cos(heading);
    const s = Math.sin(heading);
    return { x: body.x + lx * c - ly * s, y: body.y + lx * s + ly * c };
  };
  const hipLocal = (leg: Leg): Vec => ({ x: HIP_X[leg.index], y: leg.side * 3 });
  const restLocal = (leg: Leg): Vec => {
    const h = hipLocal(leg);
    const a = REST_ANGLE[leg.index];
    return { x: h.x + Math.cos(a) * REACH[leg.index], y: h.y + leg.side * Math.sin(a) * REACH[leg.index] };
  };

  const legs: Leg[] = [];
  for (const side of [1, -1] as const) {
    for (let index = 0; index < 4; index++) {
      const leg: Leg = { side, index, group: ((index + (side === 1 ? 0 : 1)) % 2) as 0 | 1, foot: { x: 0, y: 0 }, from: { x: 0, y: 0 }, t: 1 };
      const r = restLocal(leg);
      leg.foot = toWorld(r.x, r.y);
      legs.push(leg);
    }
  }

  const update = (dt: number): boolean => {
    const toPointer = sub(pointer, body);
    const dist = len(toPointer);
    const speedWanted = dist > STOP_DISTANCE ? Math.min(MAX_SPEED, (dist - STOP_DISTANCE) * 4) : 0;
    const want = dist > 0 ? { x: (toPointer.x / dist) * speedWanted, y: (toPointer.y / dist) * speedWanted } : { x: 0, y: 0 };
    const k = 1 - Math.exp(-dt * 7);
    vel.x += (want.x - vel.x) * k;
    vel.y += (want.y - vel.y) * k;
    body.x += vel.x * dt;
    body.y += vel.y * dt;
    const speed = len(vel);
    const target = speed > 8 ? Math.atan2(vel.y, vel.x) : dist > 4 ? Math.atan2(toPointer.y, toPointer.x) : heading;
    const turn = angleDiff(target, heading);
    heading += turn * (1 - Math.exp(-dt * 8));

    let busy = speed > 1 || Math.abs(turn) > 0.02;
    for (const leg of legs) {
      const r = restLocal(leg);
      const ideal = toWorld(r.x, r.y);
      ideal.x += vel.x * 0.12;
      ideal.y += vel.y * 0.12;
      if (leg.t >= 1) {
        const off = len(sub(leg.foot, ideal));
        const otherStepping = legs.some((o) => o.group !== leg.group && o.t < 1);
        if (off > STEP_AT * 2.5 || (off > STEP_AT && !otherStepping)) {
          leg.from = { ...leg.foot };
          leg.t = 0;
        }
      }
      if (leg.t < 1) {
        busy = true;
        leg.t = Math.min(1, leg.t + dt / STEP_TIME);
        const e = leg.t < 0.5 ? 2 * leg.t * leg.t : 1 - (-2 * leg.t + 2) ** 2 / 2;
        leg.foot = { x: leg.from.x + (ideal.x - leg.from.x) * e, y: leg.from.y + (ideal.y - leg.from.y) * e };
      }
    }
    return busy;
  };

  const draw = () => {
    ctx.clearRect(0, 0, width, height);
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = colors.bone;
    ctx.fillStyle = colors.bone;
    ctx.shadowColor = colors.eye;
    ctx.shadowBlur = 6;

    for (const leg of legs) {
      const h = hipLocal(leg);
      const hip = toWorld(h.x, h.y);
      const k = knee(hip, leg.foot, leg.side);
      // A lifted leg bends a little more.
      const lift = leg.t < 1 ? Math.sin(Math.PI * leg.t) * 4 : 0;
      const mid = { x: (hip.x + leg.foot.x) / 2, y: (hip.y + leg.foot.y) / 2 };
      const out = sub(k, mid);
      const n = len(out) || 1;
      const kn = { x: k.x + (out.x / n) * lift, y: k.y + (out.y / n) * lift };
      ctx.lineWidth = 2.3;
      ctx.beginPath();
      ctx.moveTo(hip.x, hip.y);
      ctx.lineTo(kn.x, kn.y);
      ctx.stroke();
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(kn.x, kn.y);
      ctx.lineTo(leg.foot.x, leg.foot.y);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(kn.x, kn.y, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }

    // Body in its own frame.
    ctx.translate(body.x, body.y);
    ctx.rotate(heading);
    ctx.lineWidth = 1.6;
    ctx.fillStyle = colors.film;
    // Abdomen with an x-ray spine and ribs.
    ctx.beginPath();
    ctx.ellipse(-11, 0, 10.5, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-3, 0);
    ctx.lineTo(-19, 0);
    for (const x of [-7, -11, -15]) {
      const r = x === -11 ? 5.5 : 4.5;
      ctx.moveTo(x - 1.5, -r);
      ctx.quadraticCurveTo(x + 1.5, 0, x - 1.5, r);
    }
    ctx.stroke();
    // Head.
    ctx.shadowBlur = 6;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.ellipse(2.5, 0, 6.5, 5.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(8.5, -1.8);
    ctx.lineTo(11, -1.2);
    ctx.moveTo(8.5, 1.8);
    ctx.lineTo(11, 1.2);
    ctx.stroke();
    ctx.fillStyle = colors.eye;
    for (const y of [-1.9, 1.9]) {
      ctx.beginPath();
      ctx.arc(5.8, y, 1.15, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  };

  let frame = 0;
  let last = 0;
  let restFor = 0;
  let running = false;
  const tick = (now: number) => {
    const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016);
    last = now;
    const busy = update(dt);
    draw();
    restFor = busy ? 0 : restFor + dt;
    if (restFor > 0.5) {
      running = false;
      return;
    }
    frame = requestAnimationFrame(tick);
  };
  const wake = () => {
    if (running) return;
    running = true;
    last = 0;
    restFor = 0;
    frame = requestAnimationFrame(tick);
  };

  const onMove = (e: PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    wake();
  };
  const onResize = () => {
    resize();
    body.x = Math.min(body.x, width + 50);
    body.y = Math.min(body.y, height + 50);
    draw();
  };
  const onTheme = () => {
    readColors();
    draw();
  };

  window.addEventListener("pointermove", onMove, { passive: true });
  window.addEventListener("resize", onResize);
  const scheme = window.matchMedia("(prefers-color-scheme: dark)");
  scheme.addEventListener("change", onTheme);
  const observer = new MutationObserver(onTheme);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  draw();

  return () => {
    cancelAnimationFrame(frame);
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("resize", onResize);
    scheme.removeEventListener("change", onTheme);
    observer.disconnect();
  };
}

export function XraySpider() {
  const enabled = usePref(spiderPref) === "on";
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!enabled || !canvas) return;
    if (!window.matchMedia("(pointer: fine)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    return startSpider(canvas);
  }, [enabled]);

  if (!enabled) return null;
  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[60] hidden h-full w-full pointer-fine:block motion-reduce:hidden"
    />
  );
}

/** Footer switch; only shown where the spider can appear (a mouse, motion allowed). */
export function SpiderToggle() {
  const { dict } = useI18n();
  const enabled = usePref(spiderPref) === "on";
  return (
    <button
      type="button"
      onClick={() => spiderPref.set(enabled ? "off" : "on")}
      className="hidden text-subtle underline decoration-line-strong underline-offset-4 transition-colors hover:text-fg pointer-fine:inline motion-reduce:hidden"
    >
      {enabled ? dict.footer.hideSpider : dict.footer.showSpider}
    </button>
  );
}
