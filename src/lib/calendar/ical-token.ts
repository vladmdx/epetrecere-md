// M5 / ADR 0028 — Per-vendor iCal feed tokens.
//
// Artist tokens are scoped to the artist id. Venue tokens are scoped to an
// active organization membership so revocation/suspension invalidates the URL.
// Rotating ICAL_SECRET invalidates every feed. Tokens are URL-safe base64
// truncated to 24 chars — still ~144 bits of entropy.

import { createHmac, timingSafeEqual } from "crypto";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  partnerOrganizationMembers,
  partnerOrganizations,
  users,
  venues,
} from "@/lib/db/schema";
import { isMultiHallEnabled } from "@/lib/feature-flags";

function secret(): string {
  const configured = process.env.ICAL_SECRET ?? process.env.CLERK_SECRET_KEY;
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("ICAL_SECRET is required in production");
  }
  return "epetrecere-local-development-only-ical-secret";
}

function tokenFor(namespace: string): string {
  return createHmac("sha256", secret()).update(namespace).digest("base64url").slice(0, 24);
}

function equalToken(expected: string, actual: string): boolean {
  const left = Buffer.from(expected);
  const right = Buffer.from(actual);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function getIcalToken(artistId: number): string {
  return tokenFor(`ical-feed|${artistId}`);
}

export function verifyIcalToken(artistId: number, token: string): boolean {
  const expected = getIcalToken(artistId);
  return equalToken(expected, token);
}

type VenueIcalPrincipal = { key: string; userId: string };

async function venuePrincipals(venueId: number): Promise<VenueIcalPrincipal[]> {
  const [venue] = await db
    .select({ organizationId: venues.organizationId, userId: venues.userId })
    .from(venues)
    .where(eq(venues.id, venueId))
    .limit(1);
  if (!venue) return [];

  if (isMultiHallEnabled() && venue.organizationId != null) {
    const members = await db
      .select({
        id: partnerOrganizationMembers.id,
        userId: partnerOrganizationMembers.userId,
        createdAt: partnerOrganizationMembers.createdAt,
      })
      .from(partnerOrganizationMembers)
      .innerJoin(
        partnerOrganizations,
        eq(partnerOrganizations.id, partnerOrganizationMembers.organizationId),
      )
      .where(
        and(
          eq(partnerOrganizationMembers.organizationId, venue.organizationId),
          eq(partnerOrganizationMembers.isActive, true),
          eq(partnerOrganizations.status, "active"),
          inArray(partnerOrganizationMembers.role, ["owner", "admin", "manager", "staff"]),
        ),
      );
    return members.map((member) => ({
      userId: member.userId,
      key: `member:${member.id}:${member.createdAt.toISOString()}`,
    }));
  }

  return venue.userId
    ? [{ userId: venue.userId, key: `legacy:${venue.userId}` }]
    : [];
}

/**
 * Venue tokens are scoped to the current membership. Removing/deactivating a
 * member or suspending the organization immediately invalidates that URL.
 */
export async function getVenueIcalTokenForUser(
  venueId: number,
  userId: string,
): Promise<string | null> {
  const principal = (await venuePrincipals(venueId)).find((item) => item.userId === userId);
  if (principal) return tokenFor(`ical-feed|venue|${venueId}|${principal.key}`);

  const [globalAdmin] = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (globalAdmin && ["admin", "super_admin"].includes(globalAdmin.role)) {
    return tokenFor(`ical-feed|venue|${venueId}|global-admin:${globalAdmin.id}`);
  }
  return null;
}

export async function verifyVenueIcalToken(venueId: number, token: string): Promise<boolean> {
  for (const principal of await venuePrincipals(venueId)) {
    if (equalToken(tokenFor(`ical-feed|venue|${venueId}|${principal.key}`), token)) return true;
  }
  const admins = await db
    .select({ id: users.id })
    .from(users)
    .where(inArray(users.role, ["admin", "super_admin"]));
  return admins.some((admin) =>
    equalToken(tokenFor(`ical-feed|venue|${venueId}|global-admin:${admin.id}`), token),
  );
}
