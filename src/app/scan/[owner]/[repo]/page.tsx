import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ScanClient } from "@/components/ScanClient";
import { InvalidTarget } from "@/engine/errors";
import { parseTarget } from "@/engine/target";

function refFrom(owner: string, repo: string) {
  try {
    return parseTarget(`${decodeURIComponent(owner)}/${decodeURIComponent(repo)}`);
  } catch (e) {
    if (e instanceof InvalidTarget || e instanceof URIError) return null;
    throw e;
  }
}

export async function generateMetadata({ params }: PageProps<"/scan/[owner]/[repo]">): Promise<Metadata> {
  const { owner, repo } = await params;
  const ref = refFrom(owner, repo);
  return { title: ref ? `${ref.owner}/${ref.repo}` : "Scan", robots: { index: false } };
}

export default async function ScanPage({ params }: PageProps<"/scan/[owner]/[repo]">) {
  const { owner, repo } = await params;
  const ref = refFrom(owner, repo);
  if (!ref) notFound();
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <ScanClient key={`${ref.owner}/${ref.repo}`} owner={ref.owner} repo={ref.repo} />
    </div>
  );
}
