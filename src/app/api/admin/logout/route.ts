/** Clears the admin session cookie. */

import { cookies } from "next/headers";

import { ADMIN_COOKIE } from "@/lib/admin-auth";
import { secureCookies } from "@/lib/secret";

export const runtime = "nodejs";

export async function POST() {
  const jar = await cookies();
  jar.set(ADMIN_COOKIE, "", { httpOnly: true, secure: secureCookies(), sameSite: "strict", path: "/", maxAge: 0 });
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
