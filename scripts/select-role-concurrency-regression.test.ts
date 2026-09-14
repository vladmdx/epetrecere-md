/**
 * Role-picker authority and concurrency regressions.
 *
 * Guarded disposable local PostgreSQL only:
 *   npx tsx scripts/run-guarded-db-test.ts scripts/select-role-concurrency-regression.test.ts
 */
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { and, eq, inArray, isNull, like } from "drizzle-orm";

import { db } from "../src/lib/db";
import {
  artists,
  partnerOrganizationMembers,
  partnerOrganizations,
  users,
  venues,
} from "../src/lib/db/schema";
import {
  claimArtistRegistrationInDatabase,
  claimLegacyVenueRegistrationInDatabase,
  completeVenueRoleSelection,
  setMobileRolePreferenceInDatabase,
  selectRoleInDatabase,
} from "../src/lib/auth/select-role";
import { upsertOrganizationMember } from "../src/lib/partner/organization-members";

const MARK = `selectrole-${Date.now()}-${randomUUID().slice(0, 8)}`;
const userIds: string[] = [];
const organizationIds: number[] = [];

async function createUser(suffix: string, name = `${MARK} Same venue`) {
  const [user] = await db
    .insert(users)
    .values({
      clerkId: `${MARK}_${suffix}`,
      email: `${MARK}_${suffix}@example.invalid`,
      name,
    })
    .returning({ id: users.id });
  userIds.push(user.id);
  return user.id;
}

async function createOrganization(suffix: string) {
  const [organization] = await db
    .insert(partnerOrganizations)
    .values({ displayName: `${MARK}_${suffix}`, status: "draft" })
    .returning({ id: partnerOrganizations.id });
  organizationIds.push(organization.id);
  return organization.id;
}

async function createVenue(input: {
  suffix: string;
  userId: string | null;
  organizationId: number | null;
}) {
  const [venue] = await db
    .insert(venues)
    .values({
      userId: input.userId,
      organizationId: input.organizationId,
      nameRo: `${MARK}_${input.suffix}`,
      slug: `${MARK}-${input.suffix}`,
      phone: "",
      city: "Chișinău",
      isActive: false,
    })
    .returning({ id: venues.id });
  return venue.id;
}

after(async () => {
  if (userIds.length > 0) {
    await db.delete(artists).where(inArray(artists.userId, userIds));
  }
  const markedVenues = await db
    .select({ id: venues.id })
    .from(venues)
    .where(like(venues.nameRo, `${MARK}%`));
  const venueIds = markedVenues.map((venue) => venue.id);
  if (venueIds.length > 0) {
    await db.delete(venues).where(inArray(venues.id, venueIds));
  }
  if (organizationIds.length > 0) {
    await db
      .delete(partnerOrganizationMembers)
      .where(
        inArray(
          partnerOrganizationMembers.organizationId,
          organizationIds,
        ),
      );
    await db
      .delete(partnerOrganizations)
      .where(inArray(partnerOrganizations.id, organizationIds));
  }
  if (userIds.length > 0) {
    await db.delete(users).where(inArray(users.id, userIds));
  }
});

test("flag ON ignores and detaches stale organization-backed user_id for client role", async () => {
  const userId = await createUser("stale_client");
  const organizationId = await createOrganization("stale_client");
  const venueId = await createVenue({
    suffix: "stale-client",
    userId,
    organizationId,
  });
  await db.insert(partnerOrganizationMembers).values({
    organizationId,
    userId,
    role: "owner",
    isActive: false,
  });

  const result = await selectRoleInDatabase({
    userId,
    role: "client",
    baseName: `${MARK} client`,
    multiHallEnabled: true,
  });
  assert.equal(result.ok, true);

  const [venue] = await db
    .select({ userId: venues.userId, organizationId: venues.organizationId })
    .from(venues)
    .where(eq(venues.id, venueId));
  assert.equal(venue.userId, null);
  assert.equal(venue.organizationId, organizationId);

  const [user] = await db
    .select({ onboardingComplete: users.onboardingComplete })
    .from(users)
    .where(eq(users.id, userId));
  assert.equal(user.onboardingComplete, true);
});

test("flag ON removed member can create a new stub without reparenting the old venue", async () => {
  const userId = await createUser("stale_venue");
  const organizationId = await createOrganization("stale_venue");
  const oldVenueId = await createVenue({
    suffix: "stale-venue-old",
    userId,
    organizationId,
  });

  const result = await selectRoleInDatabase({
    userId,
    role: "venue",
    baseName: `${MARK} replacement`,
    multiHallEnabled: true,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.notEqual(result.venueId, oldVenueId);
  assert.equal(result.organizationId, null);
  assert.equal(result.needsOrganizationAttachment, true);

  const [oldVenue] = await db
    .select({ userId: venues.userId, organizationId: venues.organizationId })
    .from(venues)
    .where(eq(venues.id, oldVenueId));
  assert.equal(oldVenue.userId, null);
  assert.equal(oldVenue.organizationId, organizationId);

  const [newVenue] = await db
    .select({ userId: venues.userId, organizationId: venues.organizationId })
    .from(venues)
    .where(eq(venues.id, result.venueId!));
  assert.equal(newVenue.userId, userId);
  assert.equal(newVenue.organizationId, null);
});

test("flag ON live membership reuses its organization-backed venue", async () => {
  const userId = await createUser("live_member");
  const organizationId = await createOrganization("live_member");
  const venueId = await createVenue({
    suffix: "live-member",
    userId,
    organizationId,
  });
  await db.insert(partnerOrganizationMembers).values({
    organizationId,
    userId,
    role: "staff",
    isActive: true,
  });

  const client = await selectRoleInDatabase({
    userId,
    role: "client",
    baseName: `${MARK} ignored`,
    multiHallEnabled: true,
  });
  assert.equal(client.ok, false);
  if (!client.ok) assert.equal(client.code, "ROLE_CONFLICT");

  const result = await selectRoleInDatabase({
    userId,
    role: "venue",
    baseName: `${MARK} ignored`,
    multiHallEnabled: true,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.venueId, venueId);
  assert.equal(result.organizationId, organizationId);
  assert.equal(result.needsOrganizationAttachment, false);

  const [user] = await db
    .select({ onboardingComplete: users.onboardingComplete })
    .from(users)
    .where(eq(users.id, userId));
  assert.equal(user.onboardingComplete, false);
});

test("venue selection resets a previously completed client until attachment completes", async () => {
  const userId = await createUser("completed_client_to_venue");
  await db
    .update(users)
    .set({ onboardingComplete: true })
    .where(eq(users.id, userId));

  const selected = await selectRoleInDatabase({
    userId,
    role: "venue",
    baseName: `${MARK} completed client venue`,
    multiHallEnabled: true,
  });
  assert.equal(selected.ok, true);
  if (!selected.ok) return;
  assert.equal(selected.needsOrganizationAttachment, true);

  const [user] = await db
    .select({ onboardingComplete: users.onboardingComplete })
    .from(users)
    .where(eq(users.id, userId));
  assert.equal(user.onboardingComplete, false);
});

test("membership revoked before completion cannot finalize venue role", async () => {
  const userId = await createUser("revoked_before_complete");
  const organizationId = await createOrganization("revoked_before_complete");
  const venueId = await createVenue({
    suffix: "revoked-before-complete",
    userId,
    organizationId,
  });
  await db.insert(partnerOrganizationMembers).values({
    organizationId,
    userId,
    role: "owner",
    isActive: true,
  });

  const selected = await selectRoleInDatabase({
    userId,
    role: "venue",
    baseName: `${MARK} ignored`,
    multiHallEnabled: true,
  });
  assert.equal(selected.ok, true);
  await db
    .update(partnerOrganizationMembers)
    .set({ isActive: false })
    .where(
      and(
        eq(partnerOrganizationMembers.organizationId, organizationId),
        eq(partnerOrganizationMembers.userId, userId),
      ),
    );

  assert.equal(
    await completeVenueRoleSelection({
      userId,
      venueId,
      multiHallEnabled: true,
    }),
    false,
  );
  const [user] = await db
    .select({ onboardingComplete: users.onboardingComplete })
    .from(users)
    .where(eq(users.id, userId));
  assert.equal(user.onboardingComplete, false);
});

test("flag OFF preserves legacy org-backed user_id behavior", async () => {
  const userId = await createUser("legacy_off");
  const organizationId = await createOrganization("legacy_off");
  const venueId = await createVenue({
    suffix: "legacy-off",
    userId,
    organizationId,
  });

  const client = await selectRoleInDatabase({
    userId,
    role: "client",
    baseName: `${MARK} ignored`,
    multiHallEnabled: false,
  });
  assert.equal(client.ok, false);
  if (!client.ok) assert.equal(client.code, "ROLE_CONFLICT");

  const venue = await selectRoleInDatabase({
    userId,
    role: "venue",
    baseName: `${MARK} ignored`,
    multiHallEnabled: false,
  });
  assert.equal(venue.ok, true);
  if (!venue.ok) return;
  assert.equal(venue.venueId, venueId);
  assert.equal(venue.organizationId, organizationId);

  const [unchanged] = await db
    .select({ userId: venues.userId, organizationId: venues.organizationId })
    .from(venues)
    .where(eq(venues.id, venueId));
  assert.equal(unchanged.userId, userId);
  assert.equal(unchanged.organizationId, organizationId);
});

test("concurrent retries for one user return exactly one venue stub", async () => {
  const userId = await createUser("same_user_race");
  const input = {
    userId,
    role: "venue" as const,
    baseName: `${MARK} concurrent retry`,
    multiHallEnabled: true,
  };
  const [first, second] = await Promise.all([
    selectRoleInDatabase(input),
    selectRoleInDatabase(input),
  ]);
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  if (!first.ok || !second.ok) return;
  assert.equal(first.venueId, second.venueId);

  const owned = await db
    .select({ id: venues.id })
    .from(venues)
    .where(and(eq(venues.userId, userId), isNull(venues.organizationId)));
  assert.equal(owned.length, 1);

  assert.equal(
    await completeVenueRoleSelection({
      userId,
      venueId: first.venueId!,
      multiHallEnabled: true,
    }),
    true,
  );
  const [user] = await db
    .select({ onboardingComplete: users.onboardingComplete })
    .from(users)
    .where(eq(users.id, userId));
  assert.equal(
    user.onboardingComplete,
    false,
    "role-picker completion must keep the full venue onboarding resumable",
  );
});

test("same-name users survive a concurrent slug claim with distinct slugs", async () => {
  const sharedName = `${MARK} identical name`;
  const firstUserId = await createUser("slug_race_a", sharedName);
  const secondUserId = await createUser("slug_race_b", sharedName);
  const [first, second] = await Promise.all([
    selectRoleInDatabase({
      userId: firstUserId,
      role: "venue",
      baseName: sharedName,
      multiHallEnabled: true,
    }),
    selectRoleInDatabase({
      userId: secondUserId,
      role: "venue",
      baseName: sharedName,
      multiHallEnabled: true,
    }),
  ]);
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  if (!first.ok || !second.ok) return;
  assert.notEqual(first.venueId, second.venueId);

  const rows = await db
    .select({ slug: venues.slug })
    .from(venues)
    .where(inArray(venues.id, [first.venueId!, second.venueId!]));
  assert.equal(rows.length, 2);
  assert.equal(new Set(rows.map((row) => row.slug)).size, 2);
});

test("two accounts cannot claim the same canonical phone concurrently", async () => {
  const firstUserId = await createUser("phone_race_a");
  const secondUserId = await createUser("phone_race_b");
  const canonicalPhone = "+37360000011";

  const register = (userId: string, suffix: string) =>
    claimLegacyVenueRegistrationInDatabase({
      userId,
      normalizedPhone: canonicalPhone,
      write: async (executor, user) => {
        const [venue] = await executor
          .insert(venues)
          .values({
            userId: user.id,
            nameRo: `${MARK} phone ${suffix}`,
            slug: `${MARK}-phone-${suffix}`,
            phone: canonicalPhone,
            city: "Chișinău",
            isActive: false,
          })
          .returning({ id: venues.id });
        return venue.id;
      },
    });

  const [first, second] = await Promise.all([
    register(firstUserId, "a"),
    register(secondUserId, "b"),
  ]);
  assert.notEqual(first.ok, second.ok);
  const loser = first.ok ? second : first;
  assert.equal(loser.ok, false);
  if (!loser.ok) assert.equal(loser.code, "PHONE_IN_USE");

  const [phoneOwners, venueOwners] = await Promise.all([
    db.select({ id: users.id }).from(users).where(eq(users.phone, canonicalPhone)),
    db
      .select({ userId: venues.userId })
      .from(venues)
      .where(inArray(venues.userId, [firstUserId, secondUserId])),
  ]);
  assert.equal(phoneOwners.length, 1);
  assert.equal(venueOwners.length, 1);
  assert.equal(phoneOwners[0].id, venueOwners[0].userId);
});

test("artist claim and organization membership activation cannot both win", async () => {
  const ownerId = await createUser("membership_race_owner");
  const targetId = await createUser("membership_race_target");
  const organizationId = await createOrganization("membership_race");
  await db.insert(partnerOrganizationMembers).values({
    organizationId,
    userId: ownerId,
    role: "owner",
    isActive: true,
  });

  const [artistClaim, memberClaim] = await Promise.all([
    claimArtistRegistrationInDatabase({
      userId: targetId,
      multiHallEnabled: true,
      normalizedPhone: "+37360000020",
      write: async (executor, user) => {
        const [artist] = await executor
          .insert(artists)
          .values({
            userId: user.id,
            nameRo: `${MARK} membership race artist`,
            slug: `${MARK}-membership-race-artist`,
          })
          .returning({ id: artists.id });
        return artist.id;
      },
    }),
    upsertOrganizationMember(ownerId, organizationId, {
      userId: targetId,
      role: "staff",
    }),
  ]);

  assert.notEqual(artistClaim.ok, memberClaim.ok);
  const loser = artistClaim.ok ? memberClaim : artistClaim;
  assert.equal(loser.ok, false);
  if (!loser.ok) assert.equal(loser.code, "ROLE_CONFLICT");

  const [artistRows, activeMemberships] = await Promise.all([
    db.select({ id: artists.id }).from(artists).where(eq(artists.userId, targetId)),
    db
      .select({ id: partnerOrganizationMembers.id })
      .from(partnerOrganizationMembers)
      .where(and(
        eq(partnerOrganizationMembers.organizationId, organizationId),
        eq(partnerOrganizationMembers.userId, targetId),
        eq(partnerOrganizationMembers.isActive, true),
      )),
  ]);
  assert.equal(artistRows.length + activeMemberships.length, 1);
});

test("omitted artist phone preserves the value committed after a stale route read", async () => {
  const userId = await createUser("artist_phone_preserve");
  const [stale] = await db
    .select({ phone: users.phone })
    .from(users)
    .where(eq(users.id, userId));
  assert.equal(stale.phone, null);

  const canonicalPhone = "+37360000012";
  await db
    .update(users)
    .set({ phone: canonicalPhone })
    .where(eq(users.id, userId));

  const result = await claimArtistRegistrationInDatabase({
    userId,
    multiHallEnabled: true,
    // undefined is the legacy/mobile "preserve" sentinel.
    normalizedPhone: undefined,
    write: async (executor, user) => {
      const phone = user.phone ?? "";
      const [artist] = await executor
        .insert(artists)
        .values({
          userId: user.id,
          nameRo: `${MARK} phone preserve artist`,
          slug: `${MARK}-phone-preserve-artist`,
          phone,
        })
        .returning({ id: artists.id, phone: artists.phone });
      return artist;
    },
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.phone, canonicalPhone);

  const [user] = await db
    .select({ phone: users.phone })
    .from(users)
    .where(eq(users.id, userId));
  assert.equal(user.phone, canonicalPhone);
});

test("artist claim refuses to complete when neither request nor locked account has a phone", async () => {
  const userId = await createUser("artist_phone_required");
  let wrote = false;
  const result = await claimArtistRegistrationInDatabase({
    userId,
    multiHallEnabled: true,
    normalizedPhone: undefined,
    write: async () => {
      wrote = true;
      return 1;
    },
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "INVALID_PHONE");
  assert.equal(wrote, false);

  const [user] = await db
    .select({ role: users.role, onboardingComplete: users.onboardingComplete })
    .from(users)
    .where(eq(users.id, userId));
  assert.equal(user.role, "user");
  assert.equal(user.onboardingComplete, false);
});

test("a completed owned artist profile is an explicit lost-response replay", async () => {
  const userId = await createUser("artist_registration_replay");
  await db
    .update(users)
    .set({ role: "artist", onboardingComplete: true })
    .where(eq(users.id, userId));
  const [artist] = await db
    .insert(artists)
    .values({
      userId,
      nameRo: `${MARK} replay artist`,
      slug: `${MARK}-replay-artist`,
    })
    .returning({ id: artists.id });

  const result = await claimArtistRegistrationInDatabase({
    userId,
    multiHallEnabled: true,
    normalizedPhone: undefined,
    write: async () => {
      throw new Error("a replay must not create another artist");
    },
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, "ARTIST_ALREADY_REGISTERED");
  assert.equal(result.profileId, artist.id);
  assert.equal(result.replayable, true);
});

test("omitted artist phone normalizes a unique legacy value under the phone lock", async () => {
  const userId = await createUser("artist_phone_normalize");
  await db
    .update(users)
    .set({ phone: "60 000 013" })
    .where(eq(users.id, userId));

  const result = await claimArtistRegistrationInDatabase({
    userId,
    multiHallEnabled: true,
    normalizedPhone: undefined,
    write: async (executor, user) => {
      assert.equal(user.phone, "+37360000013");
      const [artist] = await executor
        .insert(artists)
        .values({
          userId: user.id,
          nameRo: `${MARK} normalized phone artist`,
          slug: `${MARK}-normalized-phone-artist`,
          phone: user.phone,
        })
        .returning({ id: artists.id, phone: artists.phone });
      return artist;
    },
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.phone, "+37360000013");

  const [user] = await db
    .select({ phone: users.phone })
    .from(users)
    .where(eq(users.id, userId));
  assert.equal(user.phone, "+37360000013");
});

test("omitted artist phone rejects a historical duplicate", async () => {
  const firstUserId = await createUser("artist_phone_duplicate_owner");
  const secondUserId = await createUser("artist_phone_duplicate_claimant");
  const duplicate = "+37360000014";
  await db
    .update(users)
    .set({ phone: duplicate })
    .where(inArray(users.id, [firstUserId, secondUserId]));

  const result = await claimArtistRegistrationInDatabase({
    userId: secondUserId,
    multiHallEnabled: true,
    normalizedPhone: undefined,
    write: async () => {
      throw new Error("duplicate phone must be rejected before profile creation");
    },
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "PHONE_IN_USE");

  const rows = await db
    .select({ id: artists.id })
    .from(artists)
    .where(eq(artists.userId, secondUserId));
  assert.equal(rows.length, 0);
});

test("opposite artist and legacy venue registrations serialize to one profile", async () => {
  const userId = await createUser("opposite_registration_race");
  const artistClaim = claimArtistRegistrationInDatabase({
    userId,
    multiHallEnabled: true,
    normalizedPhone: "+37360000021",
    write: async (executor, user) => {
      const [artist] = await executor
        .insert(artists)
        .values({
          userId: user.id,
          nameRo: `${MARK} race artist`,
          slug: `${MARK}-race-artist`,
        })
        .returning({ id: artists.id });
      return artist.id;
    },
  });
  const venueClaim = claimLegacyVenueRegistrationInDatabase({
    userId,
    write: async (executor, user, existing) => {
      assert.equal(existing, null);
      const [venue] = await executor
        .insert(venues)
        .values({
          userId: user.id,
          nameRo: `${MARK} race venue`,
          slug: `${MARK}-race-venue`,
          phone: "",
          city: "Chișinău",
          isActive: false,
        })
        .returning({ id: venues.id });
      return venue.id;
    },
  });
  const [artistResult, venueResult] = await Promise.all([
    artistClaim,
    venueClaim,
  ]);

  assert.notEqual(artistResult.ok, venueResult.ok);
  const loser = artistResult.ok ? venueResult : artistResult;
  assert.equal(loser.ok, false);
  if (!loser.ok) assert.equal(loser.code, "ROLE_CONFLICT");

  const [artistRows, venueRows, [user]] = await Promise.all([
    db.select({ id: artists.id }).from(artists).where(eq(artists.userId, userId)),
    db.select({ id: venues.id }).from(venues).where(eq(venues.userId, userId)),
    db.select({ role: users.role }).from(users).where(eq(users.id, userId)),
  ]);
  assert.equal(artistRows.length + venueRows.length, 1);
  assert.equal(user.role, artistRows.length === 1 ? "artist" : "user");
});

test("mobile artist preference and venue registration cannot both win", async () => {
  const userId = await createUser("mobile_venue_race");
  const [mobile, venue] = await Promise.all([
    setMobileRolePreferenceInDatabase({
      userId,
      role: "artist",
      multiHallEnabled: true,
    }),
    claimLegacyVenueRegistrationInDatabase({
      userId,
      write: async (executor, user, existing) => {
        assert.equal(existing, null);
        const [created] = await executor
          .insert(venues)
          .values({
            userId: user.id,
            nameRo: `${MARK} mobile race venue`,
            slug: `${MARK}-mobile-race-venue`,
            phone: "",
            city: "Chișinău",
            isActive: false,
          })
          .returning({ id: venues.id });
        return created.id;
      },
    }),
  ]);

  assert.notEqual(mobile.ok, venue.ok);
  const loser = mobile.ok ? venue : mobile;
  assert.equal(loser.ok, false);
  if (!loser.ok) assert.equal(loser.code, "ROLE_CONFLICT");

  const [[user], venueRows] = await Promise.all([
    db.select({ role: users.role }).from(users).where(eq(users.id, userId)),
    db.select({ id: venues.id }).from(venues).where(eq(venues.userId, userId)),
  ]);
  assert.equal(user.role === "artist", venueRows.length === 0);
  assert.equal(user.role === "user", venueRows.length === 1);
});

test("mobile role preference rejects an artist downgrade", async () => {
  const userId = await createUser("mobile_artist_downgrade");
  await db.update(users).set({ role: "artist" }).where(eq(users.id, userId));

  const result = await setMobileRolePreferenceInDatabase({
    userId,
    role: "user",
    multiHallEnabled: true,
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 409);
    assert.equal(result.code, "ROLE_CONFLICT");
  }

  const [user] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, userId));
  assert.equal(user.role, "artist");
});

test("mobile role preference rejects an admin-tier mutation", async () => {
  const userId = await createUser("mobile_privileged_picker");
  await db.update(users).set({ role: "admin" }).where(eq(users.id, userId));

  const result = await setMobileRolePreferenceInDatabase({
    userId,
    role: "artist",
    multiHallEnabled: true,
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 409);
    assert.equal(result.code, "PRIVILEGED_ROLE_LOCKED");
  }

  const [user] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, userId));
  assert.equal(user.role, "admin");
});

test("legacy venue registration rejects an admin-tier mutation", async () => {
  const userId = await createUser("legacy_privileged_registration");
  await db.update(users).set({ role: "admin" }).where(eq(users.id, userId));
  let writerCalled = false;

  const result = await claimLegacyVenueRegistrationInDatabase({
    userId,
    write: async () => {
      writerCalled = true;
      throw new Error("privileged legacy writer must not run");
    },
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 409);
    assert.equal(result.code, "PRIVILEGED_ROLE_LOCKED");
  }
  assert.equal(writerCalled, false);

  const [user] = await db
    .select({ role: users.role, onboardingComplete: users.onboardingComplete })
    .from(users)
    .where(eq(users.id, userId));
  assert.equal(user.role, "admin");
  assert.equal(user.onboardingComplete, false);
});

test("rollback registration never rewrites an organization-backed migrated venue", async () => {
  const userId = await createUser("legacy_migrated_registration");
  const organizationId = await createOrganization("legacy_migrated_registration");
  const venueId = await createVenue({
    suffix: "legacy-migrated-registration",
    userId,
    organizationId,
  });
  let writerCalled = false;

  const result = await claimLegacyVenueRegistrationInDatabase({
    userId,
    write: async () => {
      writerCalled = true;
      throw new Error("organization-backed venue must remain immutable here");
    },
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 409);
    assert.equal(result.code, "VENUE_ALREADY_REGISTERED");
    assert.equal(result.profileId, venueId);
  }
  assert.equal(writerCalled, false);
  const [unchanged] = await db
    .select({ organizationId: venues.organizationId, userId: venues.userId })
    .from(venues)
    .where(eq(venues.id, venueId));
  assert.equal(unchanged.organizationId, organizationId);
  assert.equal(unchanged.userId, userId);
});

test("legacy venue writer cannot complete onboarding without a venue", async () => {
  const userId = await createUser("legacy_writer_contract");

  await assert.rejects(
    claimLegacyVenueRegistrationInDatabase({
      userId,
      write: async (executor, user) => {
        await executor
          .update(users)
          .set({ phone: "+37360000000" })
          .where(eq(users.id, user.id));
        return null;
      },
    }),
    /legacy_venue_claim_missing_profile/,
  );

  const [user] = await db
    .select({ phone: users.phone, onboardingComplete: users.onboardingComplete })
    .from(users)
    .where(eq(users.id, userId));
  assert.equal(user.phone, null);
  assert.equal(user.onboardingComplete, false);
});

test("privileged accounts cannot enter the role picker", async () => {
  const userId = await createUser("privileged_picker");
  await db.update(users).set({ role: "admin" }).where(eq(users.id, userId));
  const result = await selectRoleInDatabase({
    userId,
    role: "venue",
    baseName: `${MARK} admin venue`,
    multiHallEnabled: true,
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "PRIVILEGED_ROLE_LOCKED");
  const rows = await db
    .select({ id: venues.id })
    .from(venues)
    .where(eq(venues.userId, userId));
  assert.equal(rows.length, 0);
});

test("a missing application user is rejected inside the transaction", async () => {
  const result = await selectRoleInDatabase({
    userId: randomUUID(),
    role: "venue",
    baseName: `${MARK} missing`,
    multiHallEnabled: true,
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 403);
    assert.equal(result.code, "FORBIDDEN");
  }
});

test("all current role writers delegate to the serialized claim service", () => {
  const artistRoute = readFileSync(
    "src/app/api/auth/register-artist/route.ts",
    "utf8",
  );
  const venueRoute = readFileSync(
    "src/app/api/auth/register-venue/route.ts",
    "utf8",
  );
  const mobileRoute = readFileSync(
    "src/app/api/v1/me/role-preference/route.ts",
    "utf8",
  );
  const selectRoleRoute = readFileSync(
    "src/app/api/auth/select-role/route.ts",
    "utf8",
  );
  assert.match(artistRoute, /claimArtistRegistrationInDatabase\(/);
  assert.match(venueRoute, /claimLegacyVenueRegistrationInDatabase\(/);
  assert.match(mobileRoute, /setMobileRolePreferenceInDatabase\(/);
  assert.match(selectRoleRoute, /selectRoleInDatabase\(/);
  assert.match(selectRoleRoute, /completeVenueRoleSelection\(/);
  assert.doesNotMatch(
    mobileRoute,
    /db\.update\(users\)\.set\(\{ role:/,
  );
});
