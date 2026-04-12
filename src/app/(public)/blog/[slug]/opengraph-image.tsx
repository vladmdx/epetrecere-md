/* eslint-disable @next/next/no-img-element */
import { ImageResponse } from "next/og";
import { db } from "@/lib/db";
import { blogPosts } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const alt = "Blog — ePetrecere.md";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OGImage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  let title = "Blog";
  let category = "";
  let date = "";

  try {
    const [post] = await db
      .select({
        titleRo: blogPosts.titleRo,
        category: blogPosts.category,
        publishedAt: blogPosts.publishedAt,
        createdAt: blogPosts.createdAt,
      })
      .from(blogPosts)
      .where(eq(blogPosts.slug, slug))
      .limit(1);

    if (post) {
      title = post.titleRo;
      category = post.category || "";
      const d = post.publishedAt || post.createdAt;
      date = d.toLocaleDateString("ro-RO", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
    }
  } catch {
    // DB not available
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

        {/* Category + date */}
        <div
          style={{
            display: "flex",
            gap: 16,
            alignItems: "center",
            marginBottom: 16,
          }}
        >
          {category && (
            <div
              style={{
                fontSize: 18,
                color: "#C9A84C",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              {category}
            </div>
          )}
          {date && (
            <div style={{ fontSize: 18, color: "#D4D4E0" }}>{date}</div>
          )}
        </div>

        {/* Title */}
        <div
          style={{
            fontSize: 48,
            fontWeight: 700,
            color: "#FFFFFF",
            letterSpacing: "-0.02em",
            maxWidth: 1000,
            lineHeight: 1.2,
            display: "-webkit-box",
            WebkitLineClamp: 3,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {title}
        </div>

        <div
          style={{
            width: 60,
            height: 3,
            background: "#C9A84C",
            borderRadius: 2,
            marginTop: 24,
          }}
        />
      </div>
    ),
    { ...size },
  );
}
