/* eslint-disable @next/next/no-img-element */
import { ImageResponse } from "next/og";
import { db } from "@/lib/db";
import { artists } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const alt = "Artist — ePetrecere.md";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OGImage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  let name = "Artist";
  let location = "";
  let price = "";
  let rating = "";

  try {
    const [artist] = await db
      .select({
        nameRo: artists.nameRo,
        location: artists.location,
        priceFrom: artists.priceFrom,
        ratingAvg: artists.ratingAvg,
        ratingCount: artists.ratingCount,
      })
      .from(artists)
      .where(eq(artists.slug, slug))
      .limit(1);

    if (artist) {
      name = artist.nameRo;
      location = artist.location || "";
      price = artist.priceFrom ? `de la ${artist.priceFrom}€` : "";
      rating =
        artist.ratingAvg && artist.ratingCount
          ? `★ ${Number(artist.ratingAvg).toFixed(1)} (${artist.ratingCount})`
          : "";
    }
  } catch {
    // DB not available — use defaults
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          padding: 60,
          background:
            "linear-gradient(135deg, #0D0D0D 0%, #1A1A2E 50%, #0D0D0D 100%)",
          fontFamily: "sans-serif",
        }}
      >
        {/* Top badge */}
        <div
          style={{
            position: "absolute",
            top: 40,
            right: 60,
            fontSize: 20,
            color: "#C9A84C",
            fontWeight: 600,
          }}
        >
          ePetrecere.md
        </div>

        {/* Gold accent line */}
        <div
          style={{
            width: 60,
            height: 3,
            background: "#C9A84C",
            borderRadius: 2,
            marginBottom: 20,
          }}
        />

        {/* Artist name */}
        <div
          style={{
            fontSize: 56,
            fontWeight: 700,
            color: "#FFFFFF",
            letterSpacing: "-0.02em",
            marginBottom: 16,
            maxWidth: 900,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {name}
        </div>

        {/* Details row */}
        <div style={{ display: "flex", gap: 32, alignItems: "center" }}>
          {location && (
            <div style={{ fontSize: 24, color: "#D4D4E0" }}>{location}</div>
          )}
          {price && (
            <div
              style={{ fontSize: 24, color: "#C9A84C", fontWeight: 600 }}
            >
              {price}
            </div>
          )}
          {rating && (
            <div style={{ fontSize: 24, color: "#C9A84C" }}>{rating}</div>
          )}
        </div>
      </div>
    ),
    { ...size },
  );
}
