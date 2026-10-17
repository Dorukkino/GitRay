/**
 * Draws the robot-check code into a distorted PNG and sets the signed token in
 * an httpOnly cookie. The code lives only in the image's pixels; the cookie
 * holds a one-way HMAC, so the answer appears nowhere in the DOM, the response
 * body, JavaScript or DevTools.
 */

import { ImageResponse } from "next/og";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";

import { CAPTCHA_COOKIE, type CaptchaPurpose, newChallenge } from "@/lib/captcha";
import { secureCookies } from "@/lib/secret";

export const runtime = "nodejs";

const COLORS = ["#1f2937", "#334155", "#3f3f46", "#1e293b", "#374151"];

function captchaPng(answer: string): ImageResponse {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          background: "linear-gradient(135deg, #e2e8f0, #cbd5e1)",
        }}
      >
        {Array.from(answer).map((ch, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              fontSize: 46,
              fontWeight: 800,
              color: COLORS[i % COLORS.length],
              transform: `rotate(${((i * 37) % 31) - 15}deg) translateY(${((i * 13) % 14) - 7}px)`,
            }}
          >
            {ch}
          </div>
        ))}
      </div>
    ),
    { width: 200, height: 70 },
  );
}

export async function GET(request: NextRequest) {
  const purpose: CaptchaPurpose = request.nextUrl.searchParams.get("for") === "login" ? "login" : "report";
  const headers = { "Cache-Control": "no-store" };
  const challenge = newChallenge(purpose);
  if (!challenge) {
    return Response.json({ error: { code: "captcha_disabled", message: "The robot check is not configured." } }, { status: 503, headers });
  }
  const png = Buffer.from(await captchaPng(challenge.answer).arrayBuffer());
  const jar = await cookies();
  jar.set(CAPTCHA_COOKIE, challenge.token, {
    httpOnly: true,
    secure: secureCookies(),
    sameSite: "strict",
    path: "/",
    maxAge: 300,
  });
  return Response.json({ image: `data:image/png;base64,${png.toString("base64")}` }, { headers });
}
