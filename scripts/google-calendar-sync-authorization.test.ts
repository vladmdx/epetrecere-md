import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildGoogleCalendarEntityPlans,
  canUserSyncGoogleCalendarVenue,
  fetchGoogleCalendarContributorFeeds,
  groupGoogleCalendarOrphanRows,
  type GoogleCalendarContributorFeed,
  type GoogleCalendarEntitySnapshot,
  type GoogleCalendarVenueCandidate,
} from "../src/lib/google/calendar-sync";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const SECOND_USER_ID = "22222222-2222-4222-8222-222222222222";
const USER_CREDENTIAL = "a".repeat(64);
const SECOND_USER_CREDENTIAL = "b".repeat(64);

function candidate(
  patch: Partial<GoogleCalendarVenueCandidate> = {},
): GoogleCalendarVenueCandidate {
  return {
    id: 10,
    organizationId: 20,
    legacyOwnerUserId: USER_ID,
    organizationStatus: "active",
    membershipUserId: USER_ID,
    membershipRole: "manager",
    membershipIsActive: true,
    ...patch,
  };
}

test("organization venue requires an active manage_calendar membership", () => {
  for (const role of ["manager", "admin", "owner"]) {
    assert.equal(
      canUserSyncGoogleCalendarVenue(USER_ID, candidate({ membershipRole: role })),
      true,
      `${role} should be able to sync`,
    );
  }
  assert.equal(
    canUserSyncGoogleCalendarVenue(
      USER_ID,
      candidate({ membershipRole: "staff" }),
    ),
    false,
    "a demoted staff member must not sync",
  );
  assert.equal(
    canUserSyncGoogleCalendarVenue(
      USER_ID,
      candidate({ membershipIsActive: false }),
    ),
    false,
    "a disabled member must not sync",
  );
  assert.equal(
    canUserSyncGoogleCalendarVenue(
      USER_ID,
      candidate({
        membershipUserId: null,
        membershipRole: null,
        membershipIsActive: null,
      }),
    ),
    false,
    "a removed member must not regain access through venues.user_id",
  );
});

test("organization itself must be active", () => {
  for (const organizationStatus of ["draft", "pending", "rejected", "suspended", "archived", null]) {
    assert.equal(
      canUserSyncGoogleCalendarVenue(
        USER_ID,
        candidate({ organizationStatus }),
      ),
      false,
      `${String(organizationStatus)} must not sync`,
    );
  }
});

test("legacy ownership fallback applies only when organization_id is null", () => {
  assert.equal(
    canUserSyncGoogleCalendarVenue(
      USER_ID,
      candidate({
        organizationId: null,
        organizationStatus: null,
        membershipUserId: null,
        membershipRole: null,
        membershipIsActive: null,
      }),
    ),
    true,
  );
  assert.equal(
    canUserSyncGoogleCalendarVenue(
      USER_ID,
      candidate({
        organizationId: null,
        legacyOwnerUserId: "22222222-2222-4222-8222-222222222222",
        organizationStatus: null,
        membershipUserId: null,
        membershipRole: null,
        membershipIsActive: null,
      }),
    ),
    false,
  );
  assert.equal(
    canUserSyncGoogleCalendarVenue(
      USER_ID,
      candidate({
        organizationId: 20,
        membershipUserId: null,
        membershipRole: null,
        membershipIsActive: null,
      }),
    ),
    false,
    "direct legacy owner must not bypass an assigned organization",
  );
});

function snapshot(
  patch: Partial<GoogleCalendarEntitySnapshot> = {},
): GoogleCalendarEntitySnapshot {
  return {
    entityType: "venue",
    entityId: 10,
    organizationId: 20,
    ownerUserId: null,
    authorityUserIds: [USER_ID, SECOND_USER_ID],
    contributorUserIds: [USER_ID, SECOND_USER_ID],
    contributorCredentials: [
      { userId: USER_ID, credentialFingerprint: USER_CREDENTIAL },
      {
        userId: SECOND_USER_ID,
        credentialFingerprint: SECOND_USER_CREDENTIAL,
      },
    ],
    existingDates: ["2026-09-19"],
    ...patch,
  };
}

test("each unique contributor feed is loaded exactly once in deterministic order", async () => {
  const calls: string[] = [];
  const feeds = await fetchGoogleCalendarContributorFeeds(
    [
      { userId: SECOND_USER_ID, credentialFingerprint: SECOND_USER_CREDENTIAL },
      { userId: USER_ID, credentialFingerprint: USER_CREDENTIAL },
      { userId: SECOND_USER_ID, credentialFingerprint: SECOND_USER_CREDENTIAL },
      { userId: USER_ID, credentialFingerprint: USER_CREDENTIAL },
    ],
    async (contributor) => {
      calls.push(contributor.userId);
      return {
        events: [],
        credentialFingerprint: contributor.credentialFingerprint,
      };
    },
  );
  assert.deepEqual(calls, [USER_ID, SECOND_USER_ID]);
  assert.equal(feeds.size, 2);
});

test("two venue managers are unioned into one entity replacement", () => {
  const feeds = new Map<string, GoogleCalendarContributorFeed>([
    [USER_ID, {
      ok: true,
      events: [{
        id: "a",
        summary: "Manager A",
        start: "2026-09-20",
        end: "2026-09-21",
        status: "confirmed",
      }],
      credentialFingerprint: USER_CREDENTIAL,
    }],
    [SECOND_USER_ID, {
      ok: true,
      events: [{
        id: "b",
        summary: "Manager B",
        start: "2026-09-21",
        end: "2026-09-22",
        status: "confirmed",
      }],
      credentialFingerprint: SECOND_USER_CREDENTIAL,
    }],
  ]);
  const plans = buildGoogleCalendarEntityPlans({
    snapshots: [snapshot()],
    feeds,
    windowDates: ["2026-09-20", "2026-09-21", "2026-09-22"],
  });

  assert.equal(plans.length, 1, "shared venue must have exactly one replacement");
  const [plan] = plans;
  assert.equal(plan?.action, "replace");
  if (plan?.action !== "replace") return;
  assert.deepEqual([...plan.dayNotes], [
    ["2026-09-20", "Manager A"],
    ["2026-09-21", "Manager B"],
  ]);
  assert.deepEqual(plan.dates, [
    "2026-09-19",
    "2026-09-20",
    "2026-09-21",
    "2026-09-22",
  ]);
});

test("provider ranges are intersected with the capped sync window before expansion", () => {
  const feeds = new Map<string, GoogleCalendarContributorFeed>([
    [USER_ID, {
      ok: true,
      events: [{
        id: "centuries",
        summary: "Bounded",
        start: "1900-01-01",
        end: "2200-01-01",
        status: "confirmed",
      }],
      credentialFingerprint: USER_CREDENTIAL,
    }],
  ]);
  const plans = buildGoogleCalendarEntityPlans({
    snapshots: [snapshot({
      authorityUserIds: [USER_ID],
      contributorUserIds: [USER_ID],
      contributorCredentials: [{
        userId: USER_ID,
        credentialFingerprint: USER_CREDENTIAL,
      }],
    })],
    feeds,
    windowDates: ["2026-09-20", "2026-09-21", "2026-09-22"],
  });
  const [plan] = plans;
  assert.equal(plan?.action, "replace");
  if (plan?.action !== "replace") return;
  assert.deepEqual([...plan.dayNotes], [
    ["2026-09-20", "Bounded"],
    ["2026-09-21", "Bounded"],
    ["2026-09-22", "Bounded"],
  ]);
});

test("malformed provider ranges preserve the existing projection", () => {
  const feeds = new Map<string, GoogleCalendarContributorFeed>([
    [USER_ID, {
      ok: true,
      events: [{
        id: "reversed",
        summary: "Invalid",
        start: "2026-09-22",
        end: "2026-09-20",
        status: "confirmed",
      }],
      credentialFingerprint: USER_CREDENTIAL,
    }],
  ]);
  const [plan] = buildGoogleCalendarEntityPlans({
    snapshots: [snapshot({
      authorityUserIds: [USER_ID],
      contributorUserIds: [USER_ID],
      contributorCredentials: [{
        userId: USER_ID,
        credentialFingerprint: USER_CREDENTIAL,
      }],
    })],
    feeds,
    windowDates: ["2026-09-20", "2026-09-21", "2026-09-22"],
  });
  assert.equal(plan?.action, "preserve");
  if (plan?.action === "preserve") assert.equal(plan.reason, "work_limit");
});

test("one failed required contributor preserves only entities that require it", () => {
  const feeds = new Map<string, GoogleCalendarContributorFeed>([
    [USER_ID, {
      ok: true,
      events: [],
      credentialFingerprint: USER_CREDENTIAL,
    }],
    [SECOND_USER_ID, { ok: false }],
  ]);
  const plans = buildGoogleCalendarEntityPlans({
    snapshots: [
      snapshot(),
      snapshot({
        entityType: "artist",
        entityId: 30,
        organizationId: null,
        ownerUserId: USER_ID,
        authorityUserIds: [USER_ID],
        contributorUserIds: [USER_ID],
        contributorCredentials: [{
          userId: USER_ID,
          credentialFingerprint: USER_CREDENTIAL,
        }],
      }),
    ],
    feeds,
    windowDates: ["2026-09-20"],
  });

  assert.equal(plans[0]?.snapshot.entityType, "venue");
  assert.equal(plans[0]?.action, "preserve");
  assert.equal(plans[1]?.snapshot.entityType, "artist");
  assert.equal(plans[1]?.action, "replace");
});

test("zero contributors clears stale venue and artist projections", () => {
  const plans = buildGoogleCalendarEntityPlans({
    snapshots: [
      snapshot({
        authorityUserIds: [],
        contributorUserIds: [],
        contributorCredentials: [],
      }),
      snapshot({
        entityType: "artist",
        entityId: 30,
        organizationId: null,
        ownerUserId: SECOND_USER_ID,
        authorityUserIds: [SECOND_USER_ID],
        contributorUserIds: [],
        contributorCredentials: [],
        existingDates: ["2026-09-18"],
      }),
    ],
    feeds: new Map(),
    windowDates: ["2026-09-20"],
  });

  assert.deepEqual(
    plans.map((plan) => [plan.snapshot.entityType, plan.action]),
    [["venue", "replace"], ["artist", "replace"]],
  );
  for (const plan of plans) {
    if (plan.action !== "replace") continue;
    assert.equal(plan.dayNotes.size, 0);
    assert.ok(plan.dates.includes(plan.snapshot.existingDates[0]!));
  }
});

test("a refreshed credential generation is carried into the replacement snapshot", () => {
  const refreshed = "c".repeat(64);
  const [plan] = buildGoogleCalendarEntityPlans({
    snapshots: [snapshot({
      authorityUserIds: [USER_ID],
      contributorUserIds: [USER_ID],
      contributorCredentials: [{
        userId: USER_ID,
        credentialFingerprint: USER_CREDENTIAL,
      }],
    })],
    feeds: new Map([[USER_ID, {
      ok: true as const,
      events: [],
      credentialFingerprint: refreshed,
    }]]),
    windowDates: ["2026-09-20"],
  });
  assert.equal(plan?.action, "replace");
  if (plan?.action !== "replace") return;
  assert.deepEqual(plan.snapshot.contributorCredentials, [{
    userId: USER_ID,
    credentialFingerprint: refreshed,
  }]);
});

test("orphan artist and venue rows are grouped and deduplicated without notes", () => {
  assert.deepEqual(groupGoogleCalendarOrphanRows([
    { entityType: "venue", entityId: 9, date: "2026-09-21" },
    { entityType: "artist", entityId: 4, date: "2026-09-20" },
    { entityType: "artist", entityId: 4, date: "2026-09-20" },
    { entityType: "artist", entityId: 4, date: "2026-09-22" },
  ]), [
    {
      entityType: "venue",
      entityId: 9,
      existingDates: ["2026-09-21"],
    },
    {
      entityType: "artist",
      entityId: 4,
      existingDates: ["2026-09-20", "2026-09-22"],
    },
  ]);
});
