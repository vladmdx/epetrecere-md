import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { venueImages } from "@/lib/db/schema";
import { jsonIfHallSpecificImageDisabled } from "./multi-hall-gate";

export async function reorderVenueImages(
  venueId: number,
  items: Array<{ id: number; sortOrder: number }>,
): Promise<
  | { ok: true }
  | { ok: false; status: number; error: string; code?: string }
> {
  const ids = items.map((item) => item.id);
  if (new Set(ids).size !== ids.length) {
    return { ok: false, status: 400, error: "Validation failed" };
  }
  const rows = await db
    .select({
      id: venueImages.id,
      hallId: venueImages.hallId,
      sortOrder: venueImages.sortOrder,
    })
    .from(venueImages)
    .where(and(eq(venueImages.venueId, venueId), inArray(venueImages.id, ids)));
  if (rows.length !== ids.length) {
    return { ok: false, status: 400, error: "Validation failed" };
  }
  const blocked = jsonIfHallSpecificImageDisabled(
    rows.find((row) => row.hallId != null)?.hallId ?? null,
  );
  if (blocked) {
    return {
      ok: false,
      status: 404,
      error: "FEATURE_DISABLED",
      code: "FEATURE_DISABLED",
    };
  }

  await Promise.all(
    items.map((item) =>
      db
        .update(venueImages)
        .set({ sortOrder: item.sortOrder })
        .where(and(eq(venueImages.id, item.id), eq(venueImages.venueId, venueId))),
    ),
  );
  return { ok: true };
}
