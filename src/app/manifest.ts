import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ePetrecere.md — Marketplace pentru Evenimente",
    short_name: "ePetrecere",
    description:
      "Găsește artiști, săli de evenimente și servicii pentru nuntă, botez și alte evenimente din Republica Moldova.",
    start_url: "/",
    display: "standalone",
    background_color: "#0D0D0D",
    theme_color: "#C9A84C",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
