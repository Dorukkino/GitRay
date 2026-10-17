import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ScanClient } from "@/components/ScanClient";
import { InvalidTarget } from "@/engine/errors";
import { parseTarget } from "@/engine/target";
import { isLocale } from "@/i18n/config";
import { SITE_NAME } from "@/lib/site";

function refFrom(owner: string, repo: string) {
  try {
    return parseTarget(`${decodeURIComponent(owner)}/${decodeURIComponent(repo)}`);
  } catch (e) {
    if (e instanceof InvalidTarget || e instanceof URIError) return null;
    throw e;
  }
}

export async function generateMetadata({ params }: PageProps<"/[lang]/scan/[owner]/[repo]">): Promise<Metadata> {
  const { lang, owner, repo } = await params;
  const ref = refFrom(owner, repo);
  if (!ref) return { title: "Scan", robots: { index: false } };
  const name = `${ref.owner}/${ref.repo}`;
  const description = isLocale(lang) && lang === "tr" ? `${name} GitHub reposunun GiTRay taraması: zararlı yazılım hileleri, klonlamadan.` : `GiTRay scan of the GitHub repository ${name}: malware tricks, without cloning.`;
  // One page per repository: kept out of the index to avoid thin, duplicate pages.
  return { title: name, description, robots: { index: false }, openGraph: { title: `${name} · ${SITE_NAME}`, description } };
}

export default async function ScanPage({ params }: PageProps<"/[lang]/scan/[owner]/[repo]">) {
  const { lang, owner, repo } = await params;
  const ref = refFrom(owner, repo);
  if (!isLocale(lang) || !ref) notFound();
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <ScanClient key={`${ref.owner}/${ref.repo}`} owner={ref.owner} repo={ref.repo} />
    </div>
  );
}
