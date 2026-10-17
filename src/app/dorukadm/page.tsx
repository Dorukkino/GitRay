import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import { AdminLogin } from "@/components/admin/AdminLogin";
import { AdminLogout } from "@/components/admin/AdminLogout";
import { AdminSetup } from "@/components/admin/AdminSetup";
import { ReportsTable } from "@/components/admin/ReportsTable";
import { ADMIN_COOKIE, verifySession } from "@/lib/admin-auth";
import { getAdminStore } from "@/lib/admin-store";
import { type FalseReport, getReportStore } from "@/lib/report-store";
import { signingSecret } from "@/lib/secret";

// Reads cookies and the database on every request; never cached or prerendered.
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export default async function DorukAdm({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  // With no signing secret the admin panel does not exist.
  if (!signingSecret()) notFound();

  const jar = await cookies();
  if (!verifySession(jar.get(ADMIN_COOKIE)?.value)) {
    const store = getAdminStore();
    const exists = store.configured ? await store.exists().catch(() => false) : false;
    return exists ? <AdminLogin /> : <AdminSetup configured={store.configured} />;
  }

  const sp = await searchParams;
  const pageParam = Array.isArray(sp.page) ? sp.page[0] : sp.page;
  const page = Math.max(0, Math.floor(Number(pageParam) || 0));
  const store = getReportStore();
  const [reports, total] = await Promise.all([
    store.list(PAGE_SIZE, page * PAGE_SIZE).catch(() => [] as FalseReport[]),
    store.count().catch(() => 0),
  ]);

  return <ReportsView reports={reports} total={total} page={page} configured={store.configured} />;
}

function ReportsView({ reports, total, page, configured }: { reports: FalseReport[]; total: number; page: number; configured: boolean }) {
  const from = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const to = page * PAGE_SIZE + reports.length;
  const hasPrev = page > 0;
  const hasNext = to < total;
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Reported wrong results</h1>
          <p className="text-sm text-muted">
            {configured ? `${total} report${total === 1 ? "" : "s"}` : "Storage is not configured."}
          </p>
        </div>
        <AdminLogout />
      </header>

      {reports.length === 0 ? (
        <p className="rounded-2xl border border-line bg-surface/80 p-4 text-sm text-muted">No reports.</p>
      ) : (
        <>
          <p className="text-xs text-subtle">Click a row to see the full report.</p>
          <ReportsTable reports={reports} />
        </>
      )}

      {(hasPrev || hasNext) && (
        <nav className="flex items-center justify-between text-sm">
          {hasPrev ? (
            <a href={`/dorukadm?page=${page - 1}`} className="text-accent hover:underline">
              ← Newer
            </a>
          ) : (
            <span />
          )}
          <span className="text-xs text-subtle">
            {from}–{to} of {total}
          </span>
          {hasNext ? (
            <a href={`/dorukadm?page=${page + 1}`} className="text-accent hover:underline">
              Older →
            </a>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}
