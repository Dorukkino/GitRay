import type { Metadata } from "next";

import { EmptyList, RepoList } from "@/components/RepoList";
import { LIST_LIMIT, loadList } from "@/lib/lists";

export const metadata: Metadata = {
  title: "Scammer list",
  description: "Recently scanned GitHub repositories that GitRay rated dangerous.",
};

// Rebuilt at most every 30 seconds, so the database is not queried on every visit.
export const revalidate = 30;

export default async function ScammerPage() {
  const { items, configured, failed } = await loadList("dangerous");
  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <p className="text-sm font-medium text-rose-300">Scammer list</p>
      <h1 className="mt-1 text-3xl font-bold text-slate-50">Repositories rated dangerous</h1>
      <p className="mt-3 text-slate-400">
        The latest {LIST_LIMIT} repositories whose most recent scan scored <strong className="text-rose-300">70 or more</strong>:
        several strong signs of malware, such as install scripts that download payloads, credential stealing or fake
        download links. Do not clone, install or open them.
      </p>
      <p className="mt-3 rounded-lg border border-rose-500/20 bg-rose-500/5 px-4 py-3 text-sm text-slate-300">
        This list is produced automatically by heuristics, not by a person. Security tools and malware research
        repositories can land here because they contain the very patterns GitRay looks for. Open a repository to see
        every finding and why it counts. If a repository is listed by mistake, rescan it after a fix or{" "}
        <a
          href="https://github.com/Dorukkino/GitRay/issues/new"
          target="_blank"
          rel="noopener noreferrer"
          className="text-cyan-300 underline"
        >
          report a false positive
        </a>
        .
      </p>
      <div className="mt-8">
        {failed ? (
          <EmptyList configured>The list could not be loaded right now. Try again in a minute.</EmptyList>
        ) : items.length === 0 ? (
          <EmptyList configured={configured}>
            No dangerous repositories found yet. Repositories that score 70 or more appear here.
          </EmptyList>
        ) : (
          <RepoList items={items} showReasons />
        )}
      </div>
    </div>
  );
}
