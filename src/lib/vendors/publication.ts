/** Only an explicitly published owner record can offer a public-profile link. */
export function publishedVendorProfileHref(
  profile: { slug?: string | null; isActive?: boolean | null } | null | undefined,
  kind: "artist" | "venue",
): string | null {
  if (profile?.isActive !== true || !profile.slug) return null;
  return `${kind === "venue" ? "/sali" : "/artisti"}/${profile.slug}`;
}
