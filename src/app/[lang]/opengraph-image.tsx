import { ImageResponse } from "next/og";

import { SITE_NAME } from "@/lib/site";

export const alt = `${SITE_NAME} — scan a GitHub repo before you clone it`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** A branded social card. ASCII text only, so it renders in the default font. */
export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background: "linear-gradient(135deg, #0b1220 0%, #111a2e 55%, #0b1220 100%)",
          color: "#e8eef7",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "84px",
              height: "84px",
              borderRadius: "20px",
              background: "#1b2742",
              border: "2px solid #39507e",
              color: "#8ab4ff",
              fontSize: "48px",
              fontWeight: 800,
            }}
          >
            G
          </div>
          <div style={{ fontSize: "64px", fontWeight: 800, letterSpacing: "-1px" }}>GiTRay</div>
        </div>
        <div style={{ marginTop: "40px", fontSize: "52px", fontWeight: 700, lineHeight: 1.1, maxWidth: "960px" }}>
          Is this GitHub repo safe to clone?
        </div>
        <div style={{ marginTop: "24px", fontSize: "30px", color: "#9fb2cc", maxWidth: "980px", lineHeight: 1.35 }}>
          Scans a public repository for malware tricks — install hooks, hidden payloads, credential stealers — without
          cloning or running anything.
        </div>
        <div style={{ marginTop: "48px", display: "flex", gap: "14px", alignItems: "center", fontSize: "26px", color: "#6f8bb0" }}>
          <div style={{ width: "10px", height: "10px", borderRadius: "999px", background: "#3fd08a" }} />
          gitray.net
        </div>
      </div>
    ),
    size,
  );
}
