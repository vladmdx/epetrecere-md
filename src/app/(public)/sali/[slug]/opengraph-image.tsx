/* eslint-disable @next/next/no-img-element */
import { ImageResponse } from "next/og";
import { db } from "@/lib/db";
import { venues } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const alt = "Sala de evenimente — ePetrecere.md";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OGImage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  let name = "Sala de Evenimente";
  let city = "";
  let capacity = "";
  let price = "";

  try {
    const [venue] = await db
      .select({
        nameRo: venues.nameRo,
        city: venues.city,
        capacityMin: venues.capacityMin,
        capacityMax: venues.capacityMax,
        pricePerPerson: venues.pricePerPerson,
      })
      .from(venues)
      .where(eq(venues.slug, slug))
      .limit(1);

    if (venue) {
      name = venue.nameRo;
      city = venue.city || "";
      capacity =
        venue.capacityMin && venue.capacityMax
          ? `${venue.capacityMin}–${venue.capacityMax} locuri`
          : venue.capacityMax
            ? `pana la ${venue.capacityMax} locuri`
            : "";
      price = venue.pricePerPerson
        ? `${venue.pricePerPerson}€/pers`
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

        <div
          style={{
            width: 60,
            height: 3,
            background: "#C9A84C",
            borderRadius: 2,
            marginBottom: 20,
          }}
        />

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

        <div style={{ display: "flex", gap: 32, alignItems: "center" }}>
          {city && (
            <div style={{ fontSize: 24, color: "#D4D4E0" }}>{city}</div>
          )}
          {capacity && (
            <div style={{ fontSize: 24, color: "#D4D4E0" }}>{capacity}</div>
          )}
          {price && (
            <div
              style={{ fontSize: 24, color: "#C9A84C", fontWeight: 600 }}
            >
              {price}
            </div>
          )}
        </div>
      </div>
    ),
    { ...size },
  );
}
