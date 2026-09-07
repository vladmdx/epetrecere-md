/** IDs, never storage URLs or credentials, cross the client boundary. */
export function photoContentUrl(photoId: number): string {
  return `/api/event-photos/${photoId}/file`;
}

export function serializePhoto<T extends { id: number; url: string }>(photo: T): T {
  return { ...photo, url: photoContentUrl(photo.id) };
}

/** These endpoints must never enter Next's shared image optimizer cache. */
export function isPhotoFileOptimizerTarget(raw: string | null): boolean {
  if (!raw) return false;
  try {
    const path = new URL(raw, "https://epetrecere.md").pathname;
    return /^\/api\/(?:v1\/)?event-photos\//.test(path);
  } catch { return false; }
}
