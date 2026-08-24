import { NextResponse } from "next/server";
import { getCategoriesForPicker } from "@/lib/db/queries/categories";

// The category list changes monthly at most. Without this every mount was a
// cold function plus a Frankfurt round-trip, which is most of the four-second
// wait on the wizard's services step.
export const revalidate = 3600;

export async function GET() {
  const items = await getCategoriesForPicker();
  return NextResponse.json(items, {
    headers: {
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
