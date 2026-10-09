import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { Metadata } from "next";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export const metadata: Metadata = {
  title: "Progress",
  description: "What has been built so far and what comes next (PROGRESS.md).",
};

export default function ProgressPage() {
  // Read at build time: the page is static. Our own file, rendered without raw HTML.
  const markdown = readFileSync(join(process.cwd(), "PROGRESS.md"), "utf8");
  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <p className="mb-6 rounded-lg border border-slate-800 bg-slate-900/40 px-4 py-2 text-xs text-slate-500">
        This page shows <code className="font-mono">PROGRESS.md</code> from the repository. The project log is kept in
        Turkish.
      </p>
      <article className="prose-gitray">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
      </article>
    </div>
  );
}
