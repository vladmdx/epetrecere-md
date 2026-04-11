// M11 Intern #1 — GDPR account deletion (Art. 17 — right to be forgotten).
// Deletes the user row; cascade FKs clean up eventPlans, reviews, messages,
// invitations, and photos automatically. Leads matched by email are
// anonymized rather than deleted (they belong to the vendor's CRM record).

import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, leads } from "@/lib/db/schema";

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

  // 2. Delete the user row — cascade deletes eventPlans, reviews, messages,
  // conversations, invitations, photos.
  await db.delete(users).where(eq(users.id, user.id));

  // 3. Delete the Clerk account so the user can't log back in.
  try {
    const client = await clerkClient();
    await client.users.deleteUser(clerkId);
  } catch (e) {
    console.error("[delete-account] Clerk delete failed", e);
    // Continue — local data is already gone.
  }

  return NextResponse.json({ success: true });
}
