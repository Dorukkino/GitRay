import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Providers } from "@/components/Providers";
import { SiteHeader } from "@/components/SiteHeader";
import { INTL_LOCALE, LOCALES, isLocale, localePath } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { REPO_URL, SITE_NAME, siteUrl } from "@/lib/site";

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
  return {
    metadataBase: new URL(siteUrl()),
    title: { default: dict.meta.title, template: `%s · ${SITE_NAME}` },
    description: dict.meta.description,
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      title: dict.meta.title,
      description: dict.meta.description,
      locale: INTL_LOCALE[lang].replace("-", "_"),
    },
  };
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
              <nav aria-label={dict.footer.label} className="flex flex-wrap gap-x-5 gap-y-2">
                <Link href={localePath(lang, "/how-it-works")} className="text-muted transition-colors hover:text-fg">
                  {dict.nav.how}
                </Link>
                <Link href={localePath(lang, "/privacy")} className="text-muted transition-colors hover:text-fg">
                  {dict.footer.privacy}
                </Link>
                <Link href={localePath(lang, "/terms")} className="text-muted transition-colors hover:text-fg">
                  {dict.footer.terms}
                </Link>
                <a href={REPO_URL} className="text-muted transition-colors hover:text-fg" rel="noopener noreferrer">
                  {dict.footer.source}
                </a>
              </nav>
            </div>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
