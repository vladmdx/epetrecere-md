export interface PhotoAccessRecord {
  ownerId: string;
  isPublic: boolean;
  isApproved: boolean;
  momentsEnabled: boolean;
  momentsRevealAt: Date | null;
}

/** Re-evaluated for every file read, including after unpublishing/reporting. */
export function canReadPhoto(photo: PhotoAccessRecord, actor: { id: string; role: string } | null, galleryAccess: boolean, now = new Date()): boolean {
  if (actor && (actor.id === photo.ownerId || actor.role === "admin" || actor.role === "super_admin")) return true;
  if (!photo.isApproved) return false;
  if (photo.isPublic) return true;
  return galleryAccess && photo.momentsEnabled && (!photo.momentsRevealAt || now >= photo.momentsRevealAt);
}
