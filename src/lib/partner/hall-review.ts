/** Minimum public-content gate for an independently moderated hall. */
export type HallReviewSource = {
  nameRo: string | null;
  slug: string | null;
  capacityMin: number | null;
  capacityMax: number | null;
  isLegacyDefault: boolean;
  photoCount: number;
};

export type HallReviewIssue = "nameRo" | "slug" | "capacityMax" | "imageUrls";

export function hallReviewIssues(hall: HallReviewSource): HallReviewIssue[] {
  const issues: HallReviewIssue[] = [];
  if (!hall.nameRo?.trim() || hall.nameRo.trim().length < 2) issues.push("nameRo");
  if (!hall.slug?.trim()) issues.push("slug");
  if (
    hall.capacityMin == null || hall.capacityMin < 1 ||
    hall.capacityMax == null || hall.capacityMax < hall.capacityMin
  ) issues.push("capacityMax");
  // The imported legacy hall owns the venue's pre-existing general gallery.
  // New halls need their own photos so the client does not mistake the
  // restaurant cover for a photo of a particular room.
  if (!hall.isLegacyDefault && hall.photoCount < 1) issues.push("imageUrls");
  return issues;
}
