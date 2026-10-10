import { securityTxt } from "@/lib/security-txt";

// Rebuilt once a day, so the expiry date always lies about 180 days ahead.
export const revalidate = 86400;

export function GET() {
  return new Response(securityTxt(), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
