// M4 — Shared ownership helper for event plan API routes.
//
// Every planner mutation runs this first: resolve the signed-in Clerk user
// to our internal users row, then confirm the target event_plan belongs to
// them. Returns a discriminated result so the caller can branch cleanly.

import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { users, eventPlans, artists, venues } from "@/lib/db/schema";
import { and, eq, sql } from "drizzle-orm";

export type OwnershipResult =
  | { ok: true; userId: string; plan: typeof eventPlans.$inferSelect }
  | { ok: false; status: 401 | 403 | 404; error: string };

export async function requirePlanOwnership(
  planId: number,
): Promise<OwnershipResult> {
  if (!Number.isFinite(planId)) {
    return { ok: false, status: 404, error: "Invalid plan id" };
  }

  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  const [appUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);
  if (!appUser) {
    return { ok: false, status: 401, error: "User not found" };
  }

  const [plan] = await db
    .select()
    .from(eventPlans)
    .where(and(eq(eventPlans.id, planId), eq(eventPlans.userId, appUser.id)))
    .limit(1);
  if (!plan) {
    return { ok: false, status: 404, error: "Plan not found" };
  }

  return { ok: true, userId: appUser.id, plan };
}

/** Resolves just the signed-in app user — used by POST /event-plans. */
export async function requireAppUser(): Promise<
  | { ok: true; userId: string }
  | { ok: false; status: 401; error: string }
> {
  const { userId: clerkId } = await auth();
  if (!clerkId) return { ok: false, status: 401, error: "Unauthorized" };

  const [appUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);
  if (!appUser) return { ok: false, status: 401, error: "User not found" };

  return { ok: true, userId: appUser.id };
}

/** Resolves the signed-in user AND blocks partner accounts (artists/venues)
 *  from acting as clients. Used by event-plan creation and the artist
 *  picker. Admins can still act as clients for testing. */
export async function requireClientUser(): Promise<
  | { ok: true; userId: string }
  | { ok: false; status: 401 | 403; error: string }
> {
  const auth = await requireAppUser();
  if (!auth.ok) return auth;

  const [appUser] = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.id, auth.userId))
    .limit(1);
  if (!appUser) return { ok: false, status: 401, error: "User not found" };

  // Admins always pass through — useful for ops seeding test data.
  if (appUser.role === "admin" || appUser.role === "super_admin") {
    return { ok: true, userId: appUser.id };
  }

  // Block users who own an artist or venue row. We don't trust the role
  // column alone because legacy venue partners still carry role="user".
  const [partnerHit] = await db
    .select({ kind: sql<string>`'artist'` })
    .from(artists)
    .where(eq(artists.userId, appUser.id))
    .limit(1);
  if (partnerHit) {
    return {
      ok: false,
      status: 403,
      error: "Conturile de partener nu pot crea evenimente. Folosește un cont de client.",
    };
  }
  const [venueHit] = await db
    .select({ kind: sql<string>`'venue'` })
    .from(venues)
    .where(eq(venues.userId, appUser.id))
    .limit(1);
  if (venueHit) {
    return {
      ok: false,
      status: 403,
      error: "Conturile de sală nu pot crea evenimente. Folosește un cont de client.",
    };
  }
  if (appUser.role === "artist") {
    return {
      ok: false,
      status: 403,
      error: "Conturile de partener nu pot crea evenimente. Folosește un cont de client.",
    };
  }

  return { ok: true, userId: appUser.id };
}
