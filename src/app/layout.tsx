import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";

import { Logo } from "@/components/Logo";

import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "GitRay: scan a GitHub repo before you clone it", template: "%s · GitRay" },
  description:
    "GitRay checks public GitHub repositories for malware tricks (install hooks, hidden payloads, " +
    "credential stealers, fake download links) without cloning or running anything.",
};

const NAV = [
  { href: "/", label: "Scan" },
  { href: "/safe-zone", label: "Safe Zone" },
  { href: "/scammer", label: "Scammer" },
  { href: "/demo", label: "Demo report" },
  { href: "/rules", label: "Rules" },
  { href: "/progress", label: "Progress" },
];

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <header className="sticky top-0 z-20 border-b border-slate-800/80 bg-[#070a10]/85 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
            <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight text-slate-100">
              <Logo />
              <span className="text-lg">
                Git<span className="text-cyan-300">Ray</span>
              </span>
            </Link>
            <nav className="flex items-center gap-1 overflow-x-auto text-sm">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-md px-2.5 py-1.5 whitespace-nowrap text-slate-400 transition hover:bg-slate-800/70 hover:text-slate-100"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="border-t border-slate-800/80 py-8 text-sm text-slate-500">
          <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 sm:flex-row sm:items-center sm:justify-between">
            <p>
              GitRay never clones, builds or runs the code it scans. Results are heuristics, not a guarantee.
            </p>
            <a
              href="https://github.com/Dorukkino/GitRay"
              className="text-slate-400 hover:text-slate-200"
              rel="noopener noreferrer"
            >
              Source on GitHub
            </a>
          </div>
        </footer>
      </body>
    </html>
  );
}
