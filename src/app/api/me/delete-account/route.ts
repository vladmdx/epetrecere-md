// M11 Intern #1 — GDPR account deletion (Art. 17 — right to be forgotten).
//
// Deleting the user row cascades to event plans, messages, conversations,
// invitations and photos. Three things deliberately survive, and the header
// used to claim otherwise:
//
//   - Reviews. `reviews.author_user_id` is ON DELETE SET NULL and
//     `author_name` is NOT NULL (schema.ts:680, :683), so a review stays up
//     under the name it was written with. That is the honest behaviour for a
//     marketplace — a vendor's rating cannot be erased by deleting the
//     account that left it — but it is not what "cascade deletes reviews"
//     said.
//   - Signed contracts. `legal_acceptances.user_id` is SET NULL and the
//     append-only trigger permits exactly that clearing and nothing else.
//     Evidence of what a partner agreed to has to outlive their account.
//   - Leads, anonymized below rather than deleted: they belong to the
//     vendor's own business record.
//
// And one thing that used to survive but should not: a vendor profile.
// `artists.user_id` / `venues.user_id` are SET NULL too (schema.ts:262,
// :414), so deleting a partner's account left their public listing standing —
// name, photos, description, still collecting booking requests that nobody
// could answer, because the only account that could answer them was gone.
// Now it is taken out of the shop window first.

import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, leads, artists, venues } from "@/lib/db/schema";

export async function DELETE() {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);

  if (!user) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // 1. Anonymize leads (vendors legitimately kept them as business records).
  if (user.email) {
    await db
      .update(leads)
      .set({
        name: "Utilizator șters",
        phone: "deleted",
        email: null,
        message: null,
        wizardData: null,
      })
      .where(eq(leads.email, user.email));
  }

  // 2. Take any vendor profile out of the public listings. Done before the
  //    delete, while the ownership link still exists to find them by.
  await db
    .update(artists)
    .set({ isActive: false })
    .where(eq(artists.userId, user.id));
  await db
    .update(venues)
    .set({ isActive: false })
    .where(eq(venues.userId, user.id));

  // 3. Delete the user row — cascades to event plans, messages,
  //    conversations, invitations and photos.
  await db.delete(users).where(eq(users.id, user.id));

  // 4. Delete the Clerk account so the user can't log back in.
  try {
    const client = await clerkClient();
    await client.users.deleteUser(clerkId);
  } catch (e) {
    console.error("[delete-account] Clerk delete failed", e);
    // Continue — local data is already gone.
  }

  return NextResponse.json({ success: true });
}
