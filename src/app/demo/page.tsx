import type { Metadata } from "next";

import { ReportView } from "@/components/ReportView";
import { buildDemoReport } from "@/lib/demo";

export const metadata: Metadata = {
  title: "Demo report",
  description: "What GitRay reports for a typical fake 'free tool' repository (harmless samples).",
};

export default async function DemoPage() {
  const report = await buildDemoReport(new Date("2026-10-09T12:00:00Z"));
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <p className="mb-6 max-w-3xl text-sm leading-relaxed text-slate-400">
        This is how a typical fake &ldquo;free tool&rdquo; repository looks to GitRay. The repository does not exist:
        it is a set of harmless samples scanned by the real engine when the site is built. Every finding below is
        produced by the same rules that scan real repositories.
      </p>
      <ReportView report={report} demo />
    </div>
  );
}
