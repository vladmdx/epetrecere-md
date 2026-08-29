import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ePetrecere.md — Marketplace pentru Evenimente",
    short_name: "ePetrecere",
    description:
      "Găsește artiști, săli de evenimente și servicii pentru nuntă, botez și alte evenimente din Republica Moldova.",
    start_url: "/",
    display: "standalone",
    background_color: "#070707",
    theme_color: "#C9A84C",
    icons: [
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png" },
      // "maskable" lets Android crop to whatever shape the launcher uses. The
      // mark sits well inside its tile, so a circular crop still clears the
      // "e" — but keep that margin in mind if the artwork is ever re-cut.
      {
        src: "/brand/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
