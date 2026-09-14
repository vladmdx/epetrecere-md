/**
 * Transactional booking-create regression. Guarded disposable local DB only.
 * Apply manual migration 0033 before running through run-guarded-db-test.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { eq, inArray, sql } from "drizzle-orm";

import { db } from "../src/lib/db";
import {
  artists,
  bookingRequests,
  categories,
  eventPlans,
  offerRequests,
  users,
  venues,
} from "../src/lib/db/schema";
import {
  ArtistAvailabilityWriteError,
  BookingTargetUnavailableError,
  createClientBookingRequest,
  type ValidatedClientBookingInput,
} from "../src/lib/booking/client-booking-create";
import { BookingCreationIdempotencyConflictError } from "../src/lib/booking/booking-request-write";
import {
  bookingCreationPayloadHash,
  bookingCreationScopeHash,
} from "../src/lib/booking/booking-create-idempotency";
import { PlanBookingConflictError } from "../src/lib/booking/plan-booking-constraints";
import { VenueAvailabilityError } from "../src/lib/booking/venue-booking-write";

if (process.env.E2E_RUNTIME !== "1") {
  throw new Error(
    "booking-create DB regression must run through scripts/run-guarded-db-test.ts",
  );
}

const mark = `booking_create_${Date.now()}_${randomUUID().slice(0, 8)}`;
const clerkId = `${mark}_clerk`;
const clientIdentity = {
  name: "Client Idempotency",
  phone: "+37369000123",
  email: `${mark}@example.invalid`,
};
const priorMultiHall = process.env.FEATURE_MULTI_HALL;

const ids = {
  user: "",
  categories: [] as number[],
  artists: [] as number[],
  venue: 0,
  plans: [] as number[],
};

function booking(
  target: { artistId: number } | { venueId: number },
  eventDate: string,
  overrides: Partial<ValidatedClientBookingInput> = {},
): ValidatedClientBookingInput {
  return {
    ...target,
    clientName: "Submitted name is replaced",
    clientPhone: "+37369999999",
    clientEmail: "submitted@example.invalid",
    eventDate,
    startTime: "18:00",
    endTime: "20:00",
    eventType: "wedding",
    guestCount: 50,
    message: `${mark} request`,
    ...overrides,
  };
}

async function create(
  data: ValidatedClientBookingInput,
  idempotencyKey: string,
  requiredArtistCategoryId?: number,
) {
  return createClientBookingRequest({
    booking: data,
    actorUserId: ids.user,
    clerkId,
    idempotencyKey,
    requiredArtistCategoryId,
  });
}

before(async () => {
  process.env.FEATURE_MULTI_HALL = "false";
  const [shape] = (await db.execute(sql<{
    canonical_columns: number;
    canonical_checks: number;
    canonical_indexes: number;
    canonical_foreign_keys: number;
    target_foreign_keys: number;
    rls_tables: number;
    browser_roles: number;
    effective_privileges: number;
  }>`
    WITH expected_columns(table_name, column_name, data_type, udt_name) AS (
      VALUES
        ('booking_requests'::text, 'creation_scope_hash'::text, 'text'::text, 'text'::text),
        ('booking_requests', 'creation_request_id', 'uuid', 'uuid'),
        ('booking_requests', 'creation_payload_hash', 'text', 'text'),
        ('offer_requests', 'booking_request_id', 'integer', 'int4')
    ), canonical_columns AS (
      SELECT count(*)::int AS count
      FROM expected_columns AS expected
      JOIN information_schema.columns AS actual
        ON actual.table_schema = 'public'
       AND actual.table_name = expected.table_name
       AND actual.column_name = expected.column_name
       AND actual.data_type = expected.data_type
       AND actual.udt_name = expected.udt_name
       AND actual.is_nullable = 'YES'
       AND actual.column_default IS NULL
       AND actual.is_identity = 'NO'
       AND actual.identity_generation IS NULL
       AND actual.is_generated = 'NEVER'
       AND actual.generation_expression IS NULL
    ), canonical_checks AS (
      SELECT count(*)::int AS count
      FROM pg_constraint AS check_constraint
      WHERE check_constraint.conrelid = 'public.booking_requests'::regclass
        AND check_constraint.conname = 'booking_requests_creation_request_shape_chk'
        AND check_constraint.contype = 'c'
        AND check_constraint.convalidated
        AND NOT check_constraint.connoinherit
        AND NOT check_constraint.condeferrable
        AND NOT check_constraint.condeferred
        AND regexp_replace(
          lower(pg_get_expr(check_constraint.conbin, check_constraint.conrelid)),
          '[[:space:]()]', '', 'g'
        ) =
          'creation_scope_hashisnullandcreation_request_idisnullandcreation_payload_hashisnullorcreation_scope_hashisnotnullandcreation_request_idisnotnullandcreation_payload_hashisnotnull'
    ), canonical_indexes AS (
      SELECT count(*)::int AS count
      FROM pg_class AS index_relation
      JOIN pg_namespace AS namespace
        ON namespace.oid = index_relation.relnamespace
      JOIN pg_index AS index_catalog
        ON index_catalog.indexrelid = index_relation.oid
      JOIN pg_am AS access_method
        ON access_method.oid = index_relation.relam
      WHERE namespace.nspname = 'public'
        AND index_catalog.indisunique
        AND index_catalog.indisvalid
        AND index_catalog.indisready
        AND index_catalog.indislive
        AND NOT index_catalog.indisprimary
        AND NOT index_catalog.indisexclusion
        AND index_catalog.indimmediate
        AND NOT index_catalog.indisclustered
        AND NOT index_catalog.indisreplident
        AND index_catalog.indexprs IS NULL
        AND index_relation.reltablespace = 0
        AND index_relation.reloptions IS NULL
        AND access_method.amname = 'btree'
        AND (
          (
            index_relation.relname = 'booking_requests_creation_scope_request_uidx'
            AND index_catalog.indrelid = 'public.booking_requests'::regclass
            AND index_catalog.indnkeyatts = 2
            AND index_catalog.indnatts = 2
            AND index_catalog.indkey[0] = (
              SELECT attnum FROM pg_attribute
              WHERE attrelid = 'public.booking_requests'::regclass
                AND attname = 'creation_scope_hash'
                AND NOT attisdropped
            )
            AND index_catalog.indkey[1] = (
              SELECT attnum FROM pg_attribute
              WHERE attrelid = 'public.booking_requests'::regclass
                AND attname = 'creation_request_id'
                AND NOT attisdropped
            )
            AND index_catalog.indclass[0] = (
              SELECT operator_class.oid
              FROM pg_opclass AS operator_class
              JOIN pg_namespace AS operator_namespace
                ON operator_namespace.oid = operator_class.opcnamespace
              WHERE operator_namespace.nspname = 'pg_catalog'
                AND operator_class.opcmethod = access_method.oid
                AND operator_class.opcname = 'text_ops'
            )
            AND index_catalog.indclass[1] = (
              SELECT operator_class.oid
              FROM pg_opclass AS operator_class
              JOIN pg_namespace AS operator_namespace
                ON operator_namespace.oid = operator_class.opcnamespace
              WHERE operator_namespace.nspname = 'pg_catalog'
                AND operator_class.opcmethod = access_method.oid
                AND operator_class.opcname = 'uuid_ops'
            )
            AND index_catalog.indcollation[0] = (
              SELECT attcollation FROM pg_attribute
              WHERE attrelid = 'public.booking_requests'::regclass
                AND attname = 'creation_scope_hash'
            )
            AND index_catalog.indcollation[1] = (
              SELECT attcollation FROM pg_attribute
              WHERE attrelid = 'public.booking_requests'::regclass
                AND attname = 'creation_request_id'
            )
            AND index_catalog.indoption[0] = 0
            AND index_catalog.indoption[1] = 0
            AND regexp_replace(
              lower(pg_get_expr(index_catalog.indpred, index_catalog.indrelid)),
              '[[:space:]()]', '', 'g'
            ) = 'creation_scope_hashisnotnullandcreation_request_idisnotnull'
          )
          OR
          (
            index_relation.relname = 'offer_requests_booking_request_uidx'
            AND index_catalog.indrelid = 'public.offer_requests'::regclass
            AND index_catalog.indnkeyatts = 1
            AND index_catalog.indnatts = 1
            AND index_catalog.indkey[0] = (
              SELECT attnum FROM pg_attribute
              WHERE attrelid = 'public.offer_requests'::regclass
                AND attname = 'booking_request_id'
                AND NOT attisdropped
            )
            AND index_catalog.indclass[0] = (
              SELECT operator_class.oid
              FROM pg_opclass AS operator_class
              JOIN pg_namespace AS operator_namespace
                ON operator_namespace.oid = operator_class.opcnamespace
              WHERE operator_namespace.nspname = 'pg_catalog'
                AND operator_class.opcmethod = access_method.oid
                AND operator_class.opcname = 'int4_ops'
            )
            AND index_catalog.indcollation[0] = (
              SELECT attcollation FROM pg_attribute
              WHERE attrelid = 'public.offer_requests'::regclass
                AND attname = 'booking_request_id'
            )
            AND index_catalog.indoption[0] = 0
            AND regexp_replace(
              lower(pg_get_expr(index_catalog.indpred, index_catalog.indrelid)),
              '[[:space:]()]', '', 'g'
            ) = 'booking_request_idisnotnull'
          )
        )
    ), target_foreign_keys AS (
      SELECT fk.*
      FROM pg_constraint AS fk
      WHERE fk.conrelid = 'public.offer_requests'::regclass
        AND fk.contype = 'f'
        AND EXISTS (
          SELECT 1
          FROM unnest(fk.conkey) AS key(attnum)
          JOIN pg_attribute AS source_attribute
            ON source_attribute.attrelid = fk.conrelid
           AND source_attribute.attnum = key.attnum
          WHERE source_attribute.attname IN (
            'booking_request_id', 'artist_id', 'venue_id'
          )
        )
    ), canonical_foreign_keys AS (
      SELECT count(*)::int AS count
      FROM target_foreign_keys AS fk
      WHERE fk.convalidated
        AND NOT fk.condeferrable
        AND NOT fk.condeferred
        AND fk.confupdtype = 'a'
        AND fk.confmatchtype = 's'
        AND cardinality(fk.conkey) = 1
        AND cardinality(fk.confkey) = 1
        AND (
          (
            fk.conname = 'offer_requests_booking_request_fk'
            AND fk.confrelid = 'public.booking_requests'::regclass
            AND fk.confdeltype = 'c'
            AND fk.conkey[1] = (
              SELECT attnum FROM pg_attribute
              WHERE attrelid = 'public.offer_requests'::regclass
                AND attname = 'booking_request_id'
            )
            AND fk.confkey[1] = (
              SELECT attnum FROM pg_attribute
              WHERE attrelid = 'public.booking_requests'::regclass
                AND attname = 'id'
            )
          )
          OR
          (
            fk.conname = 'offer_requests_artist_id_artists_id_fk'
            AND fk.confrelid = 'public.artists'::regclass
            AND fk.confdeltype = 'n'
            AND fk.conkey[1] = (
              SELECT attnum FROM pg_attribute
              WHERE attrelid = 'public.offer_requests'::regclass
                AND attname = 'artist_id'
            )
            AND fk.confkey[1] = (
              SELECT attnum FROM pg_attribute
              WHERE attrelid = 'public.artists'::regclass
                AND attname = 'id'
            )
          )
          OR
          (
            fk.conname = 'offer_requests_venue_id_venues_id_fk'
            AND fk.confrelid = 'public.venues'::regclass
            AND fk.confdeltype = 'n'
            AND fk.conkey[1] = (
              SELECT attnum FROM pg_attribute
              WHERE attrelid = 'public.offer_requests'::regclass
                AND attname = 'venue_id'
            )
            AND fk.confkey[1] = (
              SELECT attnum FROM pg_attribute
              WHERE attrelid = 'public.venues'::regclass
                AND attname = 'id'
            )
          )
        )
    ), browser_roles AS (
      SELECT count(*)::int AS count
      FROM pg_roles
      WHERE rolname IN ('anon', 'authenticated')
    ), effective_privileges AS (
      SELECT count(*)::int AS count
      FROM (
        SELECT role.rolname, target_table.table_name, privilege.privilege
        FROM pg_roles AS role
        CROSS JOIN (
          VALUES ('booking_requests'::text), ('offer_requests'::text)
        ) AS target_table(table_name)
        CROSS JOIN (
          SELECT unnest(ARRAY[
            'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE',
            'REFERENCES', 'TRIGGER'
          ]::text[]) AS privilege
        ) AS privilege
        WHERE role.rolname IN ('anon', 'authenticated')
          AND has_table_privilege(
            role.rolname,
            format('public.%I', target_table.table_name),
            privilege.privilege
          )
        UNION ALL
        SELECT role.rolname, column_info.table_name, privilege.privilege
        FROM pg_roles AS role
        CROSS JOIN information_schema.columns AS column_info
        CROSS JOIN (
          SELECT unnest(ARRAY[
            'SELECT', 'INSERT', 'UPDATE', 'REFERENCES'
          ]::text[]) AS privilege
        ) AS privilege
        WHERE role.rolname IN ('anon', 'authenticated')
          AND column_info.table_schema = 'public'
          AND column_info.table_name IN ('booking_requests', 'offer_requests')
          AND has_column_privilege(
            role.rolname,
            format('public.%I', column_info.table_name),
            column_info.column_name,
            privilege.privilege
          )
        UNION ALL
        SELECT role.rolname, target_sequence.sequence_name, privilege.privilege
        FROM pg_roles AS role
        CROSS JOIN (
          VALUES
            ('booking_requests_id_seq'::text),
            ('offer_requests_id_seq'::text)
        ) AS target_sequence(sequence_name)
        CROSS JOIN (
          SELECT unnest(ARRAY['USAGE', 'SELECT', 'UPDATE']::text[]) AS privilege
        ) AS privilege
        WHERE role.rolname IN ('anon', 'authenticated')
          AND to_regclass(format('public.%I', target_sequence.sequence_name)) IS NOT NULL
          AND has_sequence_privilege(
            role.rolname,
            format('public.%I', target_sequence.sequence_name),
            privilege.privilege
          )
      ) AS violation
    )
    SELECT canonical_columns.count AS canonical_columns,
      canonical_checks.count AS canonical_checks,
      canonical_indexes.count AS canonical_indexes,
      canonical_foreign_keys.count AS canonical_foreign_keys,
      (SELECT count(*)::int FROM target_foreign_keys) AS target_foreign_keys,
      (
        SELECT count(*)::int FROM pg_class
        WHERE oid IN (
          'public.booking_requests'::regclass,
          'public.offer_requests'::regclass
        ) AND relrowsecurity AND NOT relforcerowsecurity
      ) AS rls_tables,
      browser_roles.count AS browser_roles,
      effective_privileges.count AS effective_privileges
    FROM canonical_columns, canonical_checks, canonical_indexes,
      canonical_foreign_keys, browser_roles, effective_privileges
  `)) as unknown as Array<{
    canonical_columns: number;
    canonical_checks: number;
    canonical_indexes: number;
    canonical_foreign_keys: number;
    target_foreign_keys: number;
    rls_tables: number;
    browser_roles: number;
    effective_privileges: number;
  }>;
  assert.deepEqual(
    shape,
    {
      canonical_columns: 4,
      canonical_checks: 1,
      canonical_indexes: 2,
      canonical_foreign_keys: 3,
      target_foreign_keys: 3,
      rls_tables: 2,
      browser_roles: 2,
      effective_privileges: 0,
    },
    "apply the complete guarded migration 0033 before running this regression",
  );

  const [user] = await db
    .insert(users)
    .values({
      clerkId,
      email: clientIdentity.email,
      name: clientIdentity.name,
      phone: clientIdentity.phone,
      role: "user",
    })
    .returning({ id: users.id });
  ids.user = user.id;

  const categoryRows = await db
    .insert(categories)
    .values([
      {
        nameRo: `${mark} Artist category`,
        slug: `${mark}-artist-category`,
        type: "artist",
        isActive: true,
      },
      {
        nameRo: `${mark} Service category`,
        slug: `${mark}-service-category`,
        type: "service",
        isActive: true,
      },
      {
        nameRo: `${mark} Inactive category`,
        slug: `${mark}-inactive-category`,
        type: "artist",
        isActive: false,
      },
    ])
    .returning({ id: categories.id });
  ids.categories = categoryRows.map((row) => row.id);

  const artistRows = await db
    .insert(artists)
    .values([
      {
        nameRo: `${mark} Artist A`,
        slug: `${mark}-artist-a`,
        categoryIds: [ids.categories[0]],
        isActive: true,
      },
      {
        nameRo: `${mark} Artist B`,
        slug: `${mark}-artist-b`,
        categoryIds: [ids.categories[0]],
        isActive: true,
      },
      {
        nameRo: `${mark} Artist C`,
        slug: `${mark}-artist-c`,
        categoryIds: [ids.categories[1], ids.categories[2]],
        isActive: true,
      },
      {
        nameRo: `${mark} Artist inactive`,
        slug: `${mark}-artist-inactive`,
        categoryIds: [ids.categories[1]],
        isActive: false,
      },
    ])
    .returning({ id: artists.id });
  ids.artists = artistRows.map((row) => row.id);

  const [venue] = await db
    .insert(venues)
    .values({
      nameRo: `${mark} Venue`,
      slug: `${mark}-venue`,
      isActive: true,
      timezone: "Europe/Chisinau",
    })
    .returning({ id: venues.id });
  ids.venue = venue.id;

  const plans = await db
    .insert(eventPlans)
    .values([
      { userId: ids.user, title: `${mark} artist plan` },
      { userId: ids.user, title: `${mark} venue plan` },
    ])
    .returning({ id: eventPlans.id });
  ids.plans = plans.map((row) => row.id);
});

after(async () => {
  if (ids.user) {
    const rows = await db
      .select({ id: bookingRequests.id })
      .from(bookingRequests)
      .where(eq(bookingRequests.clientUserId, ids.user));
    if (rows.length > 0) {
      await db.delete(bookingRequests).where(
        inArray(
          bookingRequests.id,
          rows.map((row) => row.id),
        ),
      );
    }
  }
  if (ids.plans.length > 0) {
    await db.delete(eventPlans).where(inArray(eventPlans.id, ids.plans));
  }
  if (ids.artists.length > 0) {
    await db.delete(artists).where(inArray(artists.id, ids.artists));
  }
  if (ids.categories.length > 0) {
    await db.delete(categories).where(inArray(categories.id, ids.categories));
  }
  if (ids.venue) await db.delete(venues).where(eq(venues.id, ids.venue));
  if (ids.user) await db.delete(users).where(eq(users.id, ids.user));
  if (priorMultiHall === undefined) delete process.env.FEATURE_MULTI_HALL;
  else process.env.FEATURE_MULTI_HALL = priorMultiHall;
});

test("same artist key replays one booking and one linked offer", async () => {
  const key = randomUUID();
  const input = booking({ artistId: ids.artists[0] }, "2034-01-10");
  const first = await create(input, key);
  const replay = await create({ ...input }, key.toUpperCase());

  assert.equal(first.created, true);
  assert.equal(replay.created, false);
  assert.equal(replay.booking.id, first.booking.id);
  assert.equal(first.booking.clientName, clientIdentity.name);
  assert.equal(first.booking.clientPhone, clientIdentity.phone);
  assert.equal(first.booking.clientEmail, clientIdentity.email);

  const projections = await db
    .select({ id: offerRequests.id })
    .from(offerRequests)
    .where(eq(offerRequests.bookingRequestId, first.booking.id));
  assert.equal(projections.length, 1);
});

test("authenticated retry survives later server-managed profile edits", async () => {
  const key = randomUUID();
  const input = booking({ artistId: ids.artists[1] }, "2034-01-21", {
    message: `${mark} profile-edit replay`,
  });
  const first = await create(input, key);

  try {
    await db
      .update(users)
      .set({
        name: "Client Identity Changed Later",
        phone: "+37369000999",
        email: `${mark}-changed@example.invalid`,
      })
      .where(eq(users.id, ids.user));

    const replay = await create(input, key);
    assert.equal(replay.created, false);
    assert.equal(replay.booking.id, first.booking.id);
    assert.equal(replay.booking.clientName, clientIdentity.name);
    assert.equal(replay.booking.clientPhone, clientIdentity.phone);
    assert.equal(replay.booking.clientEmail, clientIdentity.email);
  } finally {
    await db
      .update(users)
      .set({
        name: clientIdentity.name,
        phone: clientIdentity.phone,
        email: clientIdentity.email,
      })
      .where(eq(users.id, ids.user));
  }
});

test("active service category is accepted transactionally", async () => {
  const key = randomUUID();
  const input = booking({ artistId: ids.artists[2] }, "2034-01-17");
  const result = await create(input, key, ids.categories[1]);
  assert.equal(result.created, true);
  const projections = await db
    .select({ id: offerRequests.id })
    .from(offerRequests)
    .where(eq(offerRequests.bookingRequestId, result.booking.id));
  assert.equal(projections.length, 1);

  // Current policy applies only to a new write. A lost-response retry must
  // recover its committed booking even if the profile/category changed later.
  try {
    await db
      .update(categories)
      .set({ isActive: false })
      .where(eq(categories.id, ids.categories[1]));
    await db
      .update(artists)
      .set({ isActive: false })
      .where(eq(artists.id, ids.artists[2]));
    const replay = await create(input, key, ids.categories[1]);
    assert.equal(replay.created, false);
    assert.equal(replay.booking.id, result.booking.id);
  } finally {
    await db
      .update(categories)
      .set({ isActive: true })
      .where(eq(categories.id, ids.categories[1]));
    await db
      .update(artists)
      .set({ isActive: true })
      .where(eq(artists.id, ids.artists[2]));
  }
});

test("category mismatch, inactive category and inactive artist write nothing", async () => {
  const attempts = [
    {
      key: randomUUID(),
      data: booking({ artistId: ids.artists[2] }, "2034-01-18", {
        message: `${mark} category mismatch`,
      }),
      categoryId: ids.categories[0],
    },
    {
      key: randomUUID(),
      data: booking({ artistId: ids.artists[2] }, "2034-01-19", {
        message: `${mark} inactive category`,
      }),
      categoryId: ids.categories[2],
    },
    {
      key: randomUUID(),
      data: booking({ artistId: ids.artists[3] }, "2034-01-20", {
        message: `${mark} inactive artist`,
      }),
      categoryId: ids.categories[1],
    },
  ];

  for (const attempt of attempts) {
    await assert.rejects(
      () => create(attempt.data, attempt.key, attempt.categoryId),
      (error: unknown) => error instanceof BookingTargetUnavailableError,
    );
  }

  const bookingRows = await db
    .select({ id: bookingRequests.id })
    .from(bookingRequests)
    .where(
      inArray(
        bookingRequests.creationRequestId,
        attempts.map((attempt) => attempt.key),
      ),
    );
  const offerRows = await db
    .select({ id: offerRequests.id })
    .from(offerRequests)
    .where(
      inArray(
        offerRequests.message,
        attempts.map((attempt) => attempt.data.message ?? ""),
      ),
    );
  assert.equal(bookingRows.length, 0);
  assert.equal(offerRows.length, 0);
});

test("concurrent venue retries resolve to one durable request", async () => {
  const key = randomUUID();
  const input = booking({ venueId: ids.venue }, "2034-01-11");
  const [left, right] = await Promise.all([
    create(input, key),
    create(input, key),
  ]);
  assert.equal(left.booking.id, right.booking.id);
  assert.equal([left.created, right.created].filter(Boolean).length, 1);

  const [counts] = await db
    .select({
      bookings: sql<number>`count(distinct ${bookingRequests.id})::int`,
      offers: sql<number>`count(${offerRequests.id})::int`,
    })
    .from(bookingRequests)
    .leftJoin(
      offerRequests,
      eq(offerRequests.bookingRequestId, bookingRequests.id),
    )
    .where(eq(bookingRequests.creationRequestId, key));
  assert.deepEqual(counts, { bookings: 1, offers: 1 });
});

test("reusing a key with changed intent fails before a second write", async () => {
  const key = randomUUID();
  const input = booking({ artistId: ids.artists[2] }, "2034-01-12");
  const first = await create(input, key);
  await assert.rejects(
    () => create({ ...input, message: `${mark} changed` }, key),
    (error: unknown) =>
      error instanceof BookingCreationIdempotencyConflictError &&
      error.code === "IDEMPOTENCY_KEY_REUSED" &&
      error.status === 409,
  );
  const rows = await db
    .select({ id: bookingRequests.id })
    .from(bookingRequests)
    .where(eq(bookingRequests.creationRequestId, key));
  assert.deepEqual(
    rows.map((row) => row.id),
    [first.booking.id],
  );
});

test("different keys cannot race two artists into one plan category", async () => {
  const attempts = await Promise.allSettled([
    create(
      booking({ artistId: ids.artists[0] }, "2034-01-13", {
        eventPlanId: ids.plans[0],
      }),
      randomUUID(),
    ),
    create(
      booking({ artistId: ids.artists[1] }, "2034-01-13", {
        eventPlanId: ids.plans[0],
      }),
      randomUUID(),
    ),
  ]);
  assert.equal(
    attempts.filter((attempt) => attempt.status === "fulfilled").length,
    1,
  );
  const rejected = attempts.find(
    (attempt): attempt is PromiseRejectedResult =>
      attempt.status === "rejected",
  );
  assert.ok(rejected?.reason instanceof PlanBookingConflictError);
  const rows = await db
    .select({ id: bookingRequests.id })
    .from(bookingRequests)
    .where(eq(bookingRequests.eventPlanId, ids.plans[0]));
  assert.equal(rows.length, 1);
});

test("different keys cannot race the same artist or venue slot", async () => {
  const artistAttempts = await Promise.allSettled([
    create(booking({ artistId: ids.artists[2] }, "2034-01-14"), randomUUID()),
    create(booking({ artistId: ids.artists[2] }, "2034-01-14"), randomUUID()),
  ]);
  assert.equal(
    artistAttempts.filter((attempt) => attempt.status === "fulfilled").length,
    1,
  );
  const artistRejected = artistAttempts.find(
    (attempt): attempt is PromiseRejectedResult =>
      attempt.status === "rejected",
  );
  assert.ok(artistRejected?.reason instanceof ArtistAvailabilityWriteError);

  const venueAttempts = await Promise.allSettled([
    create(booking({ venueId: ids.venue }, "2034-01-15"), randomUUID()),
    create(booking({ venueId: ids.venue }, "2034-01-15"), randomUUID()),
  ]);
  assert.equal(
    venueAttempts.filter((attempt) => attempt.status === "fulfilled").length,
    1,
  );
  const venueRejected = venueAttempts.find(
    (attempt): attempt is PromiseRejectedResult =>
      attempt.status === "rejected",
  );
  assert.ok(venueRejected?.reason instanceof VenueAvailabilityError);
});

test("offer failure rolls the booking back atomically", async () => {
  const suffix = randomUUID().replaceAll("-", "");
  const trigger = `booking_offer_fail_${suffix}`;
  const fn = `booking_offer_fail_fn_${suffix}`;
  const sentinel = `${mark}_force_offer_failure`;
  const key = randomUUID();
  try {
    await db.execute(
      sql.raw(`
      CREATE FUNCTION public.${fn}() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.message = '${sentinel}' THEN
          RAISE EXCEPTION 'forced offer failure';
        END IF;
        RETURN NEW;
      END $$
    `),
    );
    await db.execute(
      sql.raw(`
      CREATE TRIGGER ${trigger}
      BEFORE INSERT ON public.offer_requests
      FOR EACH ROW EXECUTE FUNCTION public.${fn}()
    `),
    );

    await assert.rejects(() =>
      create(
        booking({ artistId: ids.artists[2] }, "2034-01-16", {
          message: sentinel,
        }),
        key,
      ),
    );
    const rows = await db
      .select({ id: bookingRequests.id })
      .from(bookingRequests)
      .where(eq(bookingRequests.creationRequestId, key));
    assert.equal(rows.length, 0);
  } finally {
    await db.execute(
      sql.raw(`DROP TRIGGER IF EXISTS ${trigger} ON public.offer_requests`),
    );
    await db.execute(sql.raw(`DROP FUNCTION IF EXISTS public.${fn}()`));
  }
});

test("an exact old request replays before today's create-only policy", async () => {
  const key = randomUUID();
  const data = booking({ artistId: ids.artists[2] }, "2020-01-02", {
    message: `${mark} historical replay`,
  });
  const canonical = {
    ...data,
    clientName: clientIdentity.name,
    clientPhone: clientIdentity.phone,
    clientEmail: clientIdentity.email,
  };
  const payloadHash = bookingCreationPayloadHash(
    {
      artistId: canonical.artistId ?? null,
      venueId: canonical.venueId ?? null,
      eventPlanId: canonical.eventPlanId ?? null,
      hallId: null,
      reservationScope: null,
      clientName: canonical.clientName,
      clientPhone: canonical.clientPhone,
      clientEmail: canonical.clientEmail ?? null,
      eventDate: canonical.eventDate,
      startTime: canonical.startTime ?? null,
      endTime: canonical.endTime ?? null,
      eventType: canonical.eventType ?? null,
      guestCount: canonical.guestCount ?? null,
      message: canonical.message ?? null,
      agreedPrice: canonical.agreedPrice ?? null,
      packageId: canonical.packageId ?? null,
    },
    { serverManagedClientIdentity: true },
  );
  const [existing] = await db
    .insert(bookingRequests)
    .values({
      artistId: ids.artists[2],
      clientUserId: ids.user,
      clientName: canonical.clientName,
      clientPhone: canonical.clientPhone,
      clientEmail: canonical.clientEmail,
      eventDate: canonical.eventDate,
      startTime: canonical.startTime,
      endTime: canonical.endTime,
      eventType: canonical.eventType,
      guestCount: canonical.guestCount,
      message: canonical.message,
      status: "pending",
      source: "client",
      creationScopeHash: bookingCreationScopeHash(clerkId),
      creationRequestId: key,
      creationPayloadHash: payloadHash,
    })
    .returning({ id: bookingRequests.id });

  const replay = await create(data, key);
  assert.equal(replay.created, false);
  assert.equal(replay.booking.id, existing.id);
});
