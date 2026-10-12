/**
 * Small per-visitor preferences kept in localStorage (the theme, the analytics answer).
 * Read with usePref, which renders the default on the server and the saved
 * value in the browser without a hydration error.
 */

import { useSyncExternalStore } from "react";

import { CONSENT_KEY, THEME_KEY } from "@/lib/site";

export interface Pref<T extends string> {
  get(): T;
  getServer(): T;
  set(value: T): void;
  subscribe(listener: () => void): () => void;
}

function createPref<T extends string>(key: string, fallback: T, valid: readonly T[]): Pref<T> {
  const listeners = new Set<() => void>();
  const get = (): T => {
    try {
      const v = localStorage.getItem(key);
      return valid.includes(v as T) ? (v as T) : fallback;
    } catch {
      return fallback;
    }
  };
  return {
    get,
    getServer: () => fallback,
    set(value) {
      try {
        if (value === fallback) localStorage.removeItem(key);
        else localStorage.setItem(key, value);
      } catch {
        // Private mode or blocked storage: the choice lasts until the page closes.
      }
      for (const l of listeners) l();
    },
    subscribe(listener) {
      listeners.add(listener);
      const onStorage = (e: StorageEvent) => {
        if (e.key === key) listener();
      };
      window.addEventListener("storage", onStorage);
      return () => {
        listeners.delete(listener);
        window.removeEventListener("storage", onStorage);
      };
    },
  };
}

export type Theme = "system" | "light" | "dark";

// public/theme.js reads the same key before the first paint.
export const themePref = createPref<Theme>(THEME_KEY, "system", ["system", "light", "dark"]);

/** "unset" until the visitor answers the analytics question; Google Analytics loads only when "granted". */
export type Consent = "unset" | "granted" | "denied";

export const consentPref = createPref<Consent>(CONSENT_KEY, "unset", ["unset", "granted", "denied"]);

export function usePref<T extends string>(pref: Pref<T>): T {
  return useSyncExternalStore(pref.subscribe, pref.get, pref.getServer);
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
}
