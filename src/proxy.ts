/**
 * Sends paths without a language to the visitor's language: /scan/a/b → /tr/scan/a/b.
 * The switcher's cookie wins, then the browser's Accept-Language, then English.
 * Old links (/scan/owner/repo, /rules) keep working this way.
 */

import { type NextRequest, NextResponse } from "next/server";

import { LOCALE_COOKIE, localeOf, pickLocale } from "@/i18n/config";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (localeOf(pathname)) return NextResponse.next();
  const locale = pickLocale(request.cookies.get(LOCALE_COOKIE)?.value, request.headers.get("accept-language"));
  const url = request.nextUrl.clone();
  url.pathname = `/${locale}${pathname === "/" ? "" : pathname}`;
  const response = NextResponse.redirect(url);
  // The target depends on the visitor's language.
  response.headers.set("Vary", "Accept-Language, Cookie");
  return response;
}

export const config = {
  // Not the API, Next.js assets or the files in public/ and app/ that are served as they are.
  matcher: ["/((?!api/|_next/|__nextjs|brand/|theme\\.js|favicon\\.ico|icon\\.svg|robots\\.txt|sitemap\\.xml|manifest\\.webmanifest|dorukadm).*)"],
};
