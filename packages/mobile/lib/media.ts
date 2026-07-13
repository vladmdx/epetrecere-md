// Resolve a media path returned by the API to an absolute URL the RN
// <Image> can load. The API returns host-relative paths like
// "/images/artists/foo.jpg" (served from the site root, NOT /api/v1), which
// RN's Image can't fetch as-is. Absolute URLs (Clerk avatars, external CDNs)
// pass through unchanged.

const MEDIA_BASE = (
  process.env.EXPO_PUBLIC_API_URL ?? "https://epetrecere.md/api/v1"
).replace(/\/api\/v1\/?$/, "");

export function mediaUrl(path?: string | null): string | null {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  return `${MEDIA_BASE}${path.startsWith("/") ? "" : "/"}${path}`;
}
