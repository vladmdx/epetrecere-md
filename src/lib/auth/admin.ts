import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

// Shared helper for admin-gated API routes. Returns a discriminated result
// the caller can short-circuit on without manually duplicating the auth +
// role lookup. Both "admin" and "super_admin" roles are accepted.

export type AdminResult =
  | { ok: true; userId: string; role: "admin" | "super_admin" }
  | { ok: false; status: 401 | 403; error: string };

export async function requireAdmin(): Promise<AdminResult> {
  const { userId: clerkId } = await auth();
  if (!clerkId) return { ok: false, status: 401, error: "Unauthorized" };

  const [appUser] = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);

  if (!appUser) {
    return { ok: false, status: 401, error: "User not found" };
  }
  if (appUser.role !== "admin" && appUser.role !== "super_admin") {
    return { ok: false, status: 403, error: "Admin only" };
  }

  return { ok: true, userId: appUser.id, role: appUser.role };
}
