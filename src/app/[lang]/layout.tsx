import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { notFound } from "next/navigation";

import { Providers } from "@/components/Providers";
import { SiteHeader } from "@/components/SiteHeader";
import { SpiderToggle, XraySpider } from "@/components/XraySpider";
import { LOCALES, isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";

import "../globals.css";

// latin-ext carries the Turkish letters.
const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin", "latin-ext"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin", "latin-ext"] });

export function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}

export async function generateMetadata({ params }: LayoutProps<"/[lang]">): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const dict = getDictionary(lang);
  return { title: { default: dict.meta.title, template: "%s · GitRay" }, description: dict.meta.description };
}

export default async function RootLayout({ children, params }: LayoutProps<"/[lang]">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const dict = getDictionary(lang);
  return (
    <html lang={lang} className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        {/* Applies the saved theme before the first paint; a plain file because inline HTML is banned here. */}
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script src="/theme.js" />
      </head>
      <body className="relative flex min-h-full flex-col font-sans">
        <Providers locale={lang} dict={dict}>
          <div aria-hidden="true" className="page-backdrop pointer-events-none fixed inset-0 -z-10" />
          <SiteHeader />
          <main className="flex-1">{children}</main>
          <footer className="mt-12 border-t border-line/80 py-8 text-sm text-subtle">
            <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="max-w-xl">{dict.footer.note}</p>
              <div className="flex items-center gap-4">
                <SpiderToggle />
                <a
                  href="https://github.com/Dorukkino/GitRay"
                  className="text-muted transition-colors hover:text-fg"
                  rel="noopener noreferrer"
                >
                  {dict.footer.source}
                </a>
              </div>
            </div>
          </footer>
          <XraySpider />
        </Providers>
      </body>
    </html>
  );
}
