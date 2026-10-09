import Link from "next/link";

import { localePath } from "@/i18n/config";
import { pageLocale } from "@/i18n/server";

export default async function NotFound() {
  const { locale, dict } = await pageLocale();
  return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center">
      <p className="font-mono text-6xl font-bold text-gradient">404</p>
      <h1 className="mt-4 text-2xl font-semibold text-fg">{dict.notFound.title}</h1>
      <p className="mt-2 text-muted">{dict.notFound.text}</p>
      <Link
        href={localePath(locale)}
        className="mt-6 inline-block rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-on-accent shadow-lg shadow-accent/20 transition hover:brightness-110"
      >
        {dict.notFound.link}
      </Link>
    </div>
  );
}
