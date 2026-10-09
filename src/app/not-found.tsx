import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center">
      <h1 className="text-2xl font-semibold text-slate-100">Page not found</h1>
      <p className="mt-2 text-slate-400">That is not a page, or not a valid GitHub repository address.</p>
      <Link href="/" className="mt-6 inline-block rounded-lg bg-slate-800 px-4 py-2 text-sm text-slate-100 hover:bg-slate-700">
        Scan a repository
      </Link>
    </div>
  );
}
