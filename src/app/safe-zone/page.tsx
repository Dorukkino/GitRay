import type { Metadata } from "next";
import Link from "next/link";

import { EmptyList, RepoList } from "@/components/RepoList";
import { LIST_LIMIT, loadList } from "@/lib/lists";

export const metadata: Metadata = {
  title: "Safe Zone",
  description: "Recently scanned GitHub repositories where GitRay found no known malware tricks.",
};

// Rebuilt at most once a minute, so the database is not queried on every visit
// (and the free Neon database can sleep when nobody is looking).
export const revalidate = 60;

export default async function SafeZonePage() {
  const { items, configured, failed } = await loadList("clean");
  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <p className="text-sm font-medium text-emerald-300">Safe Zone</p>
      <h1 className="mt-1 text-3xl font-bold text-slate-50">Recently scanned, nothing found</h1>
      <p className="mt-3 text-slate-400">
        The latest {LIST_LIMIT} repositories whose most recent scan came back <strong className="text-emerald-300">clean</strong>{" "}
        (score below 30, every file read). A repository leaves this list as soon as a new scan finds something.
      </p>
      <p className="mt-3 rounded-lg border border-slate-800 bg-slate-900/40 px-4 py-3 text-sm text-slate-400">
        Clean means GitRay found none of the tricks it knows. It is not a guarantee that a repository is safe, and it
        only covers the commit that was scanned.
      </p>
      <div className="mt-8">
        {failed ? (
          <EmptyList configured>The list could not be loaded right now. Try again in a minute.</EmptyList>
        ) : items.length === 0 ? (
          <EmptyList configured={configured}>
            No clean scans yet. <Link href="/" className="text-cyan-300 underline">Scan a repository</Link> to add one.
          </EmptyList>
        ) : (
          <RepoList items={items} showReasons={false} />
        )}
      </div>
    </div>
  );
}
