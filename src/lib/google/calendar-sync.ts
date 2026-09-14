import {
  and,
  eq,
  inArray,
  isNotNull,
  isNull,
  or,
} from "drizzle-orm";
import { db } from "@/lib/db";
import {
  artists,
  calendarEvents,
  partnerOrganizationMembers,
  partnerOrganizations,
  users,
  venues,
} from "@/lib/db/schema";
import {
  replaceManagedCalendarEvents,
  type CalendarWriteTransaction,
  type ManagedCalendarRow,
} from "@/lib/booking/calendar-write";
import { acquireLegalScopeLocks } from "@/lib/booking/advisory-locks";
import { parsedCalendarDate } from "@/lib/booking/calendar-input-validation";
import type { GoogleEvent } from "./calendar-events";
import { googleCalendarCredentialFingerprint } from "./calendar";

const GOOGLE_CALENDAR_MANAGER_ROLES = ["owner", "admin", "manager"] as const;
const MAX_GOOGLE_SYNC_ENTITIES = 250;
const MAX_GOOGLE_SYNC_DISCOVERY_EDGES = 2_500;
const MAX_GOOGLE_SYNC_AUTHORITY_USERS = 1_000;
const MAX_GOOGLE_SYNC_CONTRIBUTORS = 250;
const MAX_GOOGLE_SYNC_STALE_ROWS = 25_000;
const MAX_GOOGLE_SYNC_ORPHAN_ROWS_PER_RUN = 250;
const MAX_GOOGLE_SYNC_DATES_PER_ENTITY = 366;
const MAX_GOOGLE_SYNC_EVENTS_PER_ENTITY = 5_000;
const DAY_MS = 24 * 60 * 60 * 1_000;

type GoogleCalendarManagerRole =
  (typeof GOOGLE_CALENDAR_MANAGER_ROLES)[number];

export type GoogleCalendarEntityType = "venue" | "artist";

export type GoogleCalendarVenueCandidate = {
  id: number;
  organizationId: number | null;
  legacyOwnerUserId: string | null;
  organizationStatus: string | null;
  membershipUserId: string | null;
  membershipRole: string | null;
  membershipIsActive: boolean | null;
};

export type GoogleCalendarEntitySnapshot = {
  entityType: GoogleCalendarEntityType;
  entityId: number;
  organizationId: number | null;
  /** Artist owner or legacy venue owner. Organization venues keep this NULL. */
  ownerUserId: string | null;
  /** Every user who currently has manage_calendar authority, token or not. */
  authorityUserIds: string[];
  /** Exact authority subset whose refresh token was present at snapshot time. */
  contributorUserIds: string[];
  /** Full provider-credential generation for every contributor, without raw tokens. */
  contributorCredentials: GoogleCalendarContributorCredential[];
  /** Existing managed dates, used to clear projections after access/token loss. */
  existingDates: string[];
};

export type GoogleCalendarContributorCredential = Readonly<{
  userId: string;
  credentialFingerprint: string;
}>;

export type GoogleCalendarOrphanProjection = Readonly<{
  entityType: GoogleCalendarEntityType;
  entityId: number;
  existingDates: string[];
}>;

export type GoogleCalendarContributorFeed =
  | {
      ok: true;
      events: GoogleEvent[];
      credentialFingerprint: string;
    }
  | { ok: false };

export type GoogleCalendarEntityPlan =
  | {
      action: "replace";
      snapshot: GoogleCalendarEntitySnapshot;
      dates: string[];
      dayNotes: Map<string, string>;
      eventCount: number;
    }
  | {
      action: "preserve";
      snapshot: GoogleCalendarEntitySnapshot;
      reason: "contributor_failed" | "work_limit";
    };

export class GoogleCalendarSyncAuthorizationError extends Error {
  readonly code = "GOOGLE_CALENDAR_SYNC_AUTHORITY_CHANGED";

  constructor() {
    super("Google Calendar contributor authority changed before replacement.");
    this.name = "GoogleCalendarSyncAuthorizationError";
  }
}

export class GoogleCalendarSyncWorkLimitError extends Error {
  readonly code = "GOOGLE_CALENDAR_SYNC_WORK_LIMIT";

  constructor(message: string) {
    super(message);
    this.name = "GoogleCalendarSyncWorkLimitError";
  }
}

function isManagerRole(value: string | null): value is GoogleCalendarManagerRole {
  return GOOGLE_CALENDAR_MANAGER_ROLES.some((role) => role === value);
}

/** Organization venues need live manage_calendar authority; legacy fallback is NULL-org only. */
export function canUserSyncGoogleCalendarVenue(
  userId: string,
  candidate: GoogleCalendarVenueCandidate,
): boolean {
  if (candidate.organizationId == null) {
    return candidate.legacyOwnerUserId === userId;
  }
  return candidate.organizationStatus === "active"
    && candidate.membershipUserId === userId
    && candidate.membershipIsActive === true
    && isManagerRole(candidate.membershipRole);
}

function entityKey(entityType: GoogleCalendarEntityType, entityId: number): string {
  return `${entityType}:${entityId}`;
}

function compareEntities(
  left: Pick<GoogleCalendarEntitySnapshot, "entityType" | "entityId">,
  right: Pick<GoogleCalendarEntitySnapshot, "entityType" | "entityId">,
): number {
  const rank = (type: GoogleCalendarEntityType) => type === "venue" ? 0 : 1;
  return rank(left.entityType) - rank(right.entityType)
    || left.entityId - right.entityId;
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function sortedContributorCredentials(
  values: readonly GoogleCalendarContributorCredential[],
): GoogleCalendarContributorCredential[] {
  const byUser = new Map<string, string>();
  for (const value of values) {
    if (!/^[0-9a-f]{64}$/.test(value.credentialFingerprint)) {
      throw new GoogleCalendarSyncAuthorizationError();
    }
    const existing = byUser.get(value.userId);
    if (existing && existing !== value.credentialFingerprint) {
      throw new GoogleCalendarSyncAuthorizationError();
    }
    byUser.set(value.userId, value.credentialFingerprint);
  }
  return [...byUser]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([userId, credentialFingerprint]) => ({
      userId,
      credentialFingerprint,
    }));
}

function sameContributorCredentials(
  left: readonly GoogleCalendarContributorCredential[],
  right: readonly GoogleCalendarContributorCredential[],
): boolean {
  const leftSorted = sortedContributorCredentials(left);
  const rightSorted = sortedContributorCredentials(right);
  return leftSorted.length === rightSorted.length
    && leftSorted.every((value, index) =>
      value.userId === rightSorted[index]?.userId
      && value.credentialFingerprint
        === rightSorted[index]?.credentialFingerprint);
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length
    && left.every((value, index) => value === right[index]);
}

function assertWithinLimit(actual: number, maximum: number, label: string): void {
  if (actual > maximum) {
    throw new GoogleCalendarSyncWorkLimitError(
      `Google Calendar ${label} exceeds the ${maximum} item limit.`,
    );
  }
}

type DiscoveryEdge = {
  entityType: GoogleCalendarEntityType;
  entityId: number;
  contributorUserId: string;
};

export function groupGoogleCalendarOrphanRows(
  rows: readonly {
    entityType: GoogleCalendarEntityType;
    entityId: number;
    date: string;
  }[],
): GoogleCalendarOrphanProjection[] {
  const grouped = new Map<string, GoogleCalendarOrphanProjection>();
  for (const row of rows) {
    const key = entityKey(row.entityType, row.entityId);
    const current = grouped.get(key);
    const dates = uniqueSorted([...(current?.existingDates ?? []), row.date]);
    grouped.set(key, {
      entityType: row.entityType,
      entityId: row.entityId,
      existingDates: dates,
    });
  }
  return [...grouped.values()].sort(compareEntities);
}

/** Select a bounded batch of provider rows whose polymorphic parent no longer
 * exists. The sweep intentionally reads no note/summary content. */
export async function resolveGoogleCalendarOrphanProjections(): Promise<
  GoogleCalendarOrphanProjection[]
> {
  const rows = await db
    .select({
      entityType: calendarEvents.entityType,
      entityId: calendarEvents.entityId,
      date: calendarEvents.date,
    })
    .from(calendarEvents)
    .leftJoin(
      artists,
      and(
        eq(calendarEvents.entityType, "artist"),
        eq(artists.id, calendarEvents.entityId),
      ),
    )
    .leftJoin(
      venues,
      and(
        eq(calendarEvents.entityType, "venue"),
        eq(venues.id, calendarEvents.entityId),
      ),
    )
    .where(and(
      eq(calendarEvents.source, "google_sync"),
      or(
        and(eq(calendarEvents.entityType, "artist"), isNull(artists.id)),
        and(eq(calendarEvents.entityType, "venue"), isNull(venues.id)),
      ),
    ))
    .orderBy(calendarEvents.entityType, calendarEvents.entityId, calendarEvents.date)
    .limit(MAX_GOOGLE_SYNC_ORPHAN_ROWS_PER_RUN);
  return groupGoogleCalendarOrphanRows(rows);
}

/**
 * Resolve the job graph before provider requests. It includes every currently
 * connected target plus every entity with stale google_sync rows, allowing
 * token/membership removal and artist transfer to clear old projections.
 */
export async function resolveGoogleCalendarJobSnapshot(): Promise<
  GoogleCalendarEntitySnapshot[]
> {
  const staleRows = await db
    .select({
      entityType: calendarEvents.entityType,
      entityId: calendarEvents.entityId,
      date: calendarEvents.date,
    })
    .from(calendarEvents)
    .leftJoin(
      artists,
      and(
        eq(calendarEvents.entityType, "artist"),
        eq(artists.id, calendarEvents.entityId),
      ),
    )
    .leftJoin(
      venues,
      and(
        eq(calendarEvents.entityType, "venue"),
        eq(venues.id, calendarEvents.entityId),
      ),
    )
    .where(and(
      eq(calendarEvents.source, "google_sync"),
      or(
        and(eq(calendarEvents.entityType, "artist"), isNotNull(artists.id)),
        and(eq(calendarEvents.entityType, "venue"), isNotNull(venues.id)),
      ),
    ))
    .orderBy(calendarEvents.entityType, calendarEvents.entityId, calendarEvents.date)
    .limit(MAX_GOOGLE_SYNC_STALE_ROWS + 1);
  assertWithinLimit(staleRows.length, MAX_GOOGLE_SYNC_STALE_ROWS, "stale-row scan");

  const connectedArtists = await db
    .select({ entityId: artists.id, contributorUserId: users.id })
    .from(artists)
    .innerJoin(users, eq(users.id, artists.userId))
    .where(isNotNull(users.googleRefreshToken))
    .orderBy(artists.id, users.id)
    .limit(MAX_GOOGLE_SYNC_DISCOVERY_EDGES + 1);
  const connectedLegacyVenues = await db
    .select({ entityId: venues.id, contributorUserId: users.id })
    .from(venues)
    .innerJoin(users, eq(users.id, venues.userId))
    .where(and(isNull(venues.organizationId), isNotNull(users.googleRefreshToken)))
    .orderBy(venues.id, users.id)
    .limit(MAX_GOOGLE_SYNC_DISCOVERY_EDGES + 1);
  const connectedOrganizationVenues = await db
    .select({ entityId: venues.id, contributorUserId: users.id })
    .from(venues)
    .innerJoin(partnerOrganizations, eq(partnerOrganizations.id, venues.organizationId))
    .innerJoin(
      partnerOrganizationMembers,
      eq(partnerOrganizationMembers.organizationId, partnerOrganizations.id),
    )
    .innerJoin(users, eq(users.id, partnerOrganizationMembers.userId))
    .where(and(
      eq(partnerOrganizations.status, "active"),
      eq(partnerOrganizationMembers.isActive, true),
      inArray(partnerOrganizationMembers.role, [...GOOGLE_CALENDAR_MANAGER_ROLES]),
      isNotNull(users.googleRefreshToken),
    ))
    .orderBy(venues.id, users.id)
    .limit(MAX_GOOGLE_SYNC_DISCOVERY_EDGES + 1);

  const discoveryEdges: DiscoveryEdge[] = [
    ...connectedLegacyVenues.map((edge) => ({ entityType: "venue" as const, ...edge })),
    ...connectedOrganizationVenues.map((edge) => ({ entityType: "venue" as const, ...edge })),
    ...connectedArtists.map((edge) => ({ entityType: "artist" as const, ...edge })),
  ];
  assertWithinLimit(
    discoveryEdges.length,
    MAX_GOOGLE_SYNC_DISCOVERY_EDGES,
    "connected-target graph",
  );

  const entityKeys = new Set<string>();
  const existingDatesByEntity = new Map<string, string[]>();
  for (const row of staleRows) {
    const key = entityKey(row.entityType, row.entityId);
    entityKeys.add(key);
    const dates = existingDatesByEntity.get(key) ?? [];
    dates.push(row.date);
    existingDatesByEntity.set(key, dates);
  }
  for (const edge of discoveryEdges) {
    entityKeys.add(entityKey(edge.entityType, edge.entityId));
  }
  assertWithinLimit(entityKeys.size, MAX_GOOGLE_SYNC_ENTITIES, "entity graph");

  const artistIds = [...entityKeys]
    .filter((key) => key.startsWith("artist:"))
    .map((key) => Number(key.slice("artist:".length)))
    .sort((a, b) => a - b);
  const venueIds = [...entityKeys]
    .filter((key) => key.startsWith("venue:"))
    .map((key) => Number(key.slice("venue:".length)))
    .sort((a, b) => a - b);

  const artistRows = artistIds.length === 0
    ? []
    : await db
        .select({ id: artists.id, ownerUserId: artists.userId })
        .from(artists)
        .where(inArray(artists.id, artistIds))
        .orderBy(artists.id);
  const venueRows = venueIds.length === 0
    ? []
    : await db
        .select({
          id: venues.id,
          organizationId: venues.organizationId,
          legacyOwnerUserId: venues.userId,
          organizationStatus: partnerOrganizations.status,
        })
        .from(venues)
        .leftJoin(partnerOrganizations, eq(partnerOrganizations.id, venues.organizationId))
        .where(inArray(venues.id, venueIds))
        .orderBy(venues.id);

  const organizationIds = [...new Set(
    venueRows
      .map((venue) => venue.organizationId)
      .filter((id): id is number => id != null),
  )].sort((a, b) => a - b);
  const membershipRows = organizationIds.length === 0
    ? []
    : await db
        .select({
          organizationId: partnerOrganizationMembers.organizationId,
          userId: partnerOrganizationMembers.userId,
        })
        .from(partnerOrganizationMembers)
        .where(and(
          inArray(partnerOrganizationMembers.organizationId, organizationIds),
          eq(partnerOrganizationMembers.isActive, true),
          inArray(partnerOrganizationMembers.role, [...GOOGLE_CALENDAR_MANAGER_ROLES]),
        ))
        .orderBy(
          partnerOrganizationMembers.organizationId,
          partnerOrganizationMembers.userId,
        )
        .limit(MAX_GOOGLE_SYNC_DISCOVERY_EDGES + 1);
  assertWithinLimit(
    membershipRows.length,
    MAX_GOOGLE_SYNC_DISCOVERY_EDGES,
    "authority graph",
  );

  const membershipsByOrganization = new Map<number, string[]>();
  for (const membership of membershipRows) {
    const members = membershipsByOrganization.get(membership.organizationId) ?? [];
    members.push(membership.userId);
    membershipsByOrganization.set(membership.organizationId, members);
  }

  const authorityUserIds = uniqueSorted([
    ...artistRows.flatMap((artist) => artist.ownerUserId ? [artist.ownerUserId] : []),
    ...venueRows.flatMap((venue) => {
      if (venue.organizationId == null) {
        return venue.legacyOwnerUserId ? [venue.legacyOwnerUserId] : [];
      }
      if (venue.organizationStatus !== "active") return [];
      return membershipsByOrganization.get(venue.organizationId) ?? [];
    }),
  ]);
  assertWithinLimit(
    authorityUserIds.length,
    MAX_GOOGLE_SYNC_AUTHORITY_USERS,
    "authority-user graph",
  );

  const connectedUserRows = authorityUserIds.length === 0
    ? []
    : await db
        .select({
          id: users.id,
          refreshToken: users.googleRefreshToken,
          accessToken: users.googleAccessToken,
          expiresAt: users.googleTokenExpiresAt,
        })
        .from(users)
        .where(inArray(users.id, authorityUserIds))
        .orderBy(users.id);
  const credentialByUserId = new Map(
    connectedUserRows.flatMap((user) => user.refreshToken
      ? [[
          user.id,
          googleCalendarCredentialFingerprint({
            refreshToken: user.refreshToken,
            accessToken: user.accessToken,
            expiresAt: user.expiresAt,
          }),
        ] as const]
      : []),
  );

  const snapshots: GoogleCalendarEntitySnapshot[] = [];
  for (const venue of venueRows) {
    const authorities = venue.organizationId == null
      ? uniqueSorted(venue.legacyOwnerUserId ? [venue.legacyOwnerUserId] : [])
      : venue.organizationStatus === "active"
        ? uniqueSorted(membershipsByOrganization.get(venue.organizationId) ?? [])
        : [];
    snapshots.push({
      entityType: "venue",
      entityId: venue.id,
      organizationId: venue.organizationId,
      ownerUserId: venue.organizationId == null ? venue.legacyOwnerUserId : null,
      authorityUserIds: authorities,
      contributorUserIds: authorities.filter((id) => credentialByUserId.has(id)),
      contributorCredentials: authorities.flatMap((userId) => {
        const credentialFingerprint = credentialByUserId.get(userId);
        return credentialFingerprint
          ? [{ userId, credentialFingerprint }]
          : [];
      }),
      existingDates: uniqueSorted(
        existingDatesByEntity.get(entityKey("venue", venue.id)) ?? [],
      ),
    });
  }
  for (const artist of artistRows) {
    const authorities = uniqueSorted(artist.ownerUserId ? [artist.ownerUserId] : []);
    snapshots.push({
      entityType: "artist",
      entityId: artist.id,
      organizationId: null,
      ownerUserId: artist.ownerUserId,
      authorityUserIds: authorities,
      contributorUserIds: authorities.filter((id) => credentialByUserId.has(id)),
      contributorCredentials: authorities.flatMap((userId) => {
        const credentialFingerprint = credentialByUserId.get(userId);
        return credentialFingerprint
          ? [{ userId, credentialFingerprint }]
          : [];
      }),
      existingDates: uniqueSorted(
        existingDatesByEntity.get(entityKey("artist", artist.id)) ?? [],
      ),
    });
  }

  assertWithinLimit(
    uniqueSorted(snapshots.flatMap((snapshot) => snapshot.contributorUserIds)).length,
    MAX_GOOGLE_SYNC_CONTRIBUTORS,
    "contributor graph",
  );
  return snapshots.sort(compareEntities);
}

/** Fetch each unique contributor exactly once, in stable user-id order. */
export async function fetchGoogleCalendarContributorFeeds(
  contributors: readonly GoogleCalendarContributorCredential[],
  load: (
    contributor: GoogleCalendarContributorCredential,
  ) => Promise<{ events: GoogleEvent[]; credentialFingerprint: string }>,
): Promise<Map<string, GoogleCalendarContributorFeed>> {
  const uniqueContributors = sortedContributorCredentials(contributors);
  assertWithinLimit(
    uniqueContributors.length,
    MAX_GOOGLE_SYNC_CONTRIBUTORS,
    "contributors",
  );
  const feeds = new Map<string, GoogleCalendarContributorFeed>();
  for (const contributor of uniqueContributors) {
    try {
      const loaded = await load(contributor);
      feeds.set(contributor.userId, { ok: true, ...loaded });
    } catch {
      feeds.set(contributor.userId, { ok: false });
    }
  }
  return feeds;
}

/** One decision per entity: preserve on any failed feed, otherwise union/clear. */
export function buildGoogleCalendarEntityPlans(input: {
  snapshots: readonly GoogleCalendarEntitySnapshot[];
  feeds: ReadonlyMap<string, GoogleCalendarContributorFeed>;
  windowDates: readonly string[];
}): GoogleCalendarEntityPlan[] {
  const windowDates = uniqueSorted(input.windowDates);
  const windowEntries = windowDates.map((date) => ({
    date,
    parsed: parsedCalendarDate(date),
  }));
  const invalidWindow =
    windowEntries.length > MAX_GOOGLE_SYNC_DATES_PER_ENTITY
    || windowEntries.some(({ parsed }) => parsed === null);
  return [...input.snapshots]
    .sort(compareEntities)
    .map((snapshot): GoogleCalendarEntityPlan => {
      const expectedCredentials = sortedContributorCredentials(
        snapshot.contributorCredentials,
      );
      if (!sameStrings(
        snapshot.contributorUserIds,
        expectedCredentials.map(({ userId }) => userId),
      )) {
        return { action: "preserve", snapshot, reason: "work_limit" };
      }
      if (snapshot.contributorUserIds.some(
        (userId) => input.feeds.get(userId)?.ok !== true,
      )) {
        return { action: "preserve", snapshot, reason: "contributor_failed" };
      }

      const dates = uniqueSorted([...windowDates, ...snapshot.existingDates]);
      if (invalidWindow || dates.length > MAX_GOOGLE_SYNC_DATES_PER_ENTITY) {
        return { action: "preserve", snapshot, reason: "work_limit" };
      }

      const events = uniqueSorted(snapshot.contributorUserIds)
        .flatMap((userId) => {
          const feed = input.feeds.get(userId);
          return feed?.ok ? feed.events : [];
        });
      if (events.length > MAX_GOOGLE_SYNC_EVENTS_PER_ENTITY) {
        return { action: "preserve", snapshot, reason: "work_limit" };
      }
      const parsedEvents = events.map((event) => {
        const start = parsedCalendarDate(event.start);
        const suppliedEnd = parsedCalendarDate(event.end);
        if (!start || !suppliedEnd || suppliedEnd.ordinal < start.ordinal) {
          return null;
        }
        // Preserve the historical single-day compatibility for providers that
        // incorrectly send end === start, while keeping the normal Google
        // exclusive-end convention for every valid range.
        const endOrdinal = suppliedEnd.ordinal === start.ordinal
          ? start.ordinal + DAY_MS
          : suppliedEnd.ordinal;
        return { event, startOrdinal: start.ordinal, endOrdinal };
      });
      if (parsedEvents.some((event) => event === null)) {
        // A malformed provider payload must not clear a previously valid
        // projection. Preserve it and retry from a fresh feed later.
        return { action: "preserve", snapshot, reason: "work_limit" };
      }

      const dayNotes = new Map<string, string>();
      const orderedEvents = parsedEvents
        .filter((event): event is NonNullable<typeof event> => event !== null)
        .sort((left, right) =>
          left.event.start.localeCompare(right.event.start)
          || left.event.end.localeCompare(right.event.end)
          || left.event.id.localeCompare(right.event.id));
      for (const { event, startOrdinal, endOrdinal } of orderedEvents) {
        // Iterate the already capped sync window, never the provider-supplied
        // range. A malicious multi-century event is therefore constant-bounded
        // by MAX_GOOGLE_SYNC_DATES_PER_ENTITY.
        for (const { date, parsed } of windowEntries) {
          if (
            !parsed
            || parsed.ordinal < startOrdinal
            || parsed.ordinal >= endOrdinal
            || dayNotes.has(date)
          ) {
            continue;
          }
          dayNotes.set(date, event.summary.slice(0, 200));
        }
      }
      const refreshedCredentials = expectedCredentials.map(({ userId }) => {
        const feed = input.feeds.get(userId);
        if (!feed?.ok) throw new GoogleCalendarSyncAuthorizationError();
        return {
          userId,
          credentialFingerprint: feed.credentialFingerprint,
        };
      });
      return {
        action: "replace",
        snapshot: {
          ...snapshot,
          contributorCredentials: refreshedCredentials,
        },
        dates,
        dayNotes,
        eventCount: events.length,
      };
    });
}

async function connectedCredentialsLocked(
  executor: typeof db,
  authorityUserIds: readonly string[],
): Promise<GoogleCalendarContributorCredential[]> {
  if (authorityUserIds.length === 0) return [];
  const rows = await executor
    .select({
      id: users.id,
      refreshToken: users.googleRefreshToken,
      accessToken: users.googleAccessToken,
      expiresAt: users.googleTokenExpiresAt,
    })
    .from(users)
    .where(inArray(users.id, [...authorityUserIds]))
    .orderBy(users.id)
    .for("share");
  return rows.flatMap((row) => row.refreshToken
    ? [{
        userId: row.id,
        credentialFingerprint: googleCalendarCredentialFingerprint({
          refreshToken: row.refreshToken,
          accessToken: row.accessToken,
          expiresAt: row.expiresAt,
        }),
      }]
    : []);
}

/** Lock and reconstruct the exact authority/contributor set before DELETE. */
async function assertGoogleCalendarEntitySnapshotExact(
  tx: CalendarWriteTransaction,
  expected: GoogleCalendarEntitySnapshot,
): Promise<void> {
  const executor = tx as unknown as typeof db;
  let organizationId: number | null = null;
  let ownerUserId: string | null = null;
  let authorityUserIds: string[] = [];

  if (expected.entityType === "artist") {
    const [artist] = await executor
      .select({ ownerUserId: artists.userId })
      .from(artists)
      .where(eq(artists.id, expected.entityId))
      .for("share")
      .limit(1);
    if (!artist) throw new GoogleCalendarSyncAuthorizationError();
    ownerUserId = artist.ownerUserId;
    authorityUserIds = uniqueSorted(ownerUserId ? [ownerUserId] : []);
  } else {
    const [venue] = await executor
      .select({
        organizationId: venues.organizationId,
        legacyOwnerUserId: venues.userId,
      })
      .from(venues)
      .where(eq(venues.id, expected.entityId))
      .for("share")
      .limit(1);
    if (!venue) throw new GoogleCalendarSyncAuthorizationError();
    organizationId = venue.organizationId;
    if (organizationId == null) {
      ownerUserId = venue.legacyOwnerUserId;
      authorityUserIds = uniqueSorted(ownerUserId ? [ownerUserId] : []);
    } else {
      const [organization] = await executor
        .select({ status: partnerOrganizations.status })
        .from(partnerOrganizations)
        .where(eq(partnerOrganizations.id, organizationId))
        .for("share")
        .limit(1);
      if (!organization) throw new GoogleCalendarSyncAuthorizationError();
      if (organization.status === "active") {
        const memberships = await executor
          .select({ userId: partnerOrganizationMembers.userId })
          .from(partnerOrganizationMembers)
          .where(and(
            eq(partnerOrganizationMembers.organizationId, organizationId),
            eq(partnerOrganizationMembers.isActive, true),
            inArray(partnerOrganizationMembers.role, [...GOOGLE_CALENDAR_MANAGER_ROLES]),
          ))
          .orderBy(partnerOrganizationMembers.userId)
          .for("share");
        authorityUserIds = uniqueSorted(
          memberships.map((membership) => membership.userId),
        );
      }
    }
  }

  const contributorCredentials = await connectedCredentialsLocked(
    executor,
    authorityUserIds,
  );
  const contributorUserIds = contributorCredentials.map(({ userId }) => userId);
  if (
    organizationId !== expected.organizationId
    || ownerUserId !== expected.ownerUserId
    || !sameStrings(authorityUserIds, expected.authorityUserIds)
    || !sameStrings(contributorUserIds, expected.contributorUserIds)
    || !sameContributorCredentials(
      contributorCredentials,
      expected.contributorCredentials,
    )
  ) {
    throw new GoogleCalendarSyncAuthorizationError();
  }
}

/** Execute one atomic replacement for one eligible entity plan. */
export async function replaceGoogleCalendarEntityProjection(
  plan: Extract<GoogleCalendarEntityPlan, { action: "replace" }>,
): Promise<{ inserted: number }> {
  const entity = {
    entityType: plan.snapshot.entityType,
    entityId: plan.snapshot.entityId,
  };
  const rows: ManagedCalendarRow[] = [...plan.dayNotes].map(([date, rawNote]) => ({
    ...entity,
    date,
    status: "blocked",
    source: "google_sync",
    note: `Google: ${rawNote || "Ocupat"}`.slice(0, 200),
  }));
  const userIds = uniqueSorted([
    ...plan.snapshot.authorityUserIds,
    ...plan.snapshot.contributorUserIds,
  ]);

  return replaceManagedCalendarEvents(
    {
      entities: [entity],
      dates: plan.dates,
      source: "google_sync",
      rows,
      deleteScope: "all",
    },
    {
      beforeLocks: (tx) => acquireLegalScopeLocks(tx, {
        userIds,
        organizationIds: plan.snapshot.organizationId == null
          ? []
          : [plan.snapshot.organizationId],
      }),
      authorizeAfterLocks: (tx) =>
        assertGoogleCalendarEntitySnapshotExact(tx, plan.snapshot),
    },
  );
}

/** Remove a bounded orphan projection through the same entity/day advisory
 * locks as every other calendar writer. The parent is checked again only
 * after those locks are held; if it exists (or was recreated), the sweep
 * fails closed without deleting a row. */
export async function clearGoogleCalendarOrphanProjection(
  projection: GoogleCalendarOrphanProjection,
): Promise<{ inserted: number }> {
  const entity = {
    entityType: projection.entityType,
    entityId: projection.entityId,
  };

  return replaceManagedCalendarEvents(
    {
      entities: [entity],
      dates: uniqueSorted(projection.existingDates),
      source: "google_sync",
      rows: [],
      deleteScope: "all",
    },
    {
      authorizeAfterLocks: async (tx) => {
        const executor = tx as unknown as typeof db;
        const table = projection.entityType === "artist" ? artists : venues;
        const [parent] = await executor
          .select({ id: table.id })
          .from(table)
          .where(eq(table.id, projection.entityId))
          .for("share")
          .limit(1);
        if (parent) throw new GoogleCalendarSyncAuthorizationError();
      },
    },
  );
}
