// F-S6 / F-A4 — Returns the artist row owned by the currently signed-in
// user, or `{ artist: null }`. Mirrors `/api/me/venue`. Powers
// entity-agnostic dashboard pages (calendar) and the profile editor
// (/cabinet-adjacent vendor dashboard) which needs the full row to
// hydrate the form.

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { artists, users } from "@/lib/db/schema";

export async function GET() {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [appUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);

  if (!appUser) {
    return NextResponse.json({ artist: null });
  }

  // Return the full artist row so callers like the vendor profile page
  // can hydrate every editable field. Existing consumers (calendar) only
  // read `.artist.id` / `.artist.nameRo`, so this is backwards-compatible.
  const [artist] = await db
    .select()
    .from(artists)
    .where(eq(artists.userId, appUser.id))
    .limit(1);

  if (!artist) {
    return NextResponse.json({ artist: null });
  }

  return NextResponse.json({ artist });
}
