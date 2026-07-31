const DEMO_ARTIST_IMAGES: Record<string, string> = {
  animatori: "/images/redesign/artists-demo/animatori.webp",
  "teatrul-de-foc": "/images/redesign/artists-demo/teatrul-de-foc.webp",
  "mos-craciun-si-snegurocika":
    "/images/redesign/artists-demo/mos-craciun-si-snegurocika.webp",
  "ded-moroz": "/images/redesign/artists-demo/ded-moroz.webp",
  "marcel-rosca-moisrjth": "/images/redesign/artists-demo/marcel-rosca.webp",
};

function isUsableImage(url: string | null | undefined): url is string {
  return Boolean(url && !url.toLowerCase().includes("placeholder"));
}

/**
 * The launch catalogue contains a handful of demo profiles whose imported
 * images were placeholders. Keep their curated covers code-owned so listing
 * and detail pages never regress to unrelated, repeated stock photos.
 */
export function resolveArtistCoverImage(
  slug: string,
  ...candidates: Array<string | null | undefined>
): string | null {
  const uploadedImage = candidates.find(isUsableImage);
  return uploadedImage ?? DEMO_ARTIST_IMAGES[slug] ?? null;
}
