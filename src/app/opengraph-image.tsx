/* eslint-disable @next/next/no-img-element */
import { ImageResponse } from "next/og";

// Default OG image for pages that don't generate their own.
// 1200x630 is the standard Open Graph image size.

export const alt = "ePetrecere.md — Marketplace pentru Evenimente";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #0D0D0D 0%, #1A1A2E 50%, #0D0D0D 100%)",
          fontFamily: "sans-serif",
        }}
      >
        {/* Gold decorative line */}
        <div
          style={{
            width: 80,
            height: 3,
            background: "#C9A84C",
            borderRadius: 2,
            marginBottom: 24,
          }}
        />
        <div
          style={{
            fontSize: 64,
            fontWeight: 700,
            color: "#FFFFFF",
            letterSpacing: "-0.02em",
            marginBottom: 8,
          }}
        >
          ePetrecere.md
        </div>
        <div
          style={{
            fontSize: 28,
            color: "#C9A84C",
            fontWeight: 500,
            marginBottom: 32,
          }}
        >
          Marketplace pentru Evenimente
        </div>
        <div
          style={{
            fontSize: 20,
            color: "#D4D4E0",
            maxWidth: 700,
            textAlign: "center",
            lineHeight: 1.5,
          }}
        >
          Artisti, sali, fotografi, DJ si multe altele pentru evenimentul tau
        </div>
        {/* Gold decorative line */}
        <div
          style={{
            width: 80,
            height: 3,
            background: "#C9A84C",
            borderRadius: 2,
            marginTop: 32,
          }}
        />
      </div>
    ),
    { ...size },
  );
}
