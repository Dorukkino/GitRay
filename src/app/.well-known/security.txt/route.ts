import { securityTxt } from "@/lib/security-txt";

// Rebuilt once a day, so the expiry date always lies about 180 days ahead.
export const revalidate = 86400;

export function GET() {
  const text = securityTxt();
  if (!text) return new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  return new Response(text, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
