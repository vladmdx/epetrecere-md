/**
 * Verifies manual migration 0032 on a guarded disposable loopback database.
 * Applies it twice, checks the exact constraint/index shape, and exercises
 * organization-scoped uniqueness. Never point this script at shared data.
 */
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import postgres from "postgres";
import { e2eDatabaseConfig, verifyE2EDatabase } from "../e2e/helpers/safety";

const config = e2eDatabaseConfig();
process.env.DATABASE_URL = config.url;
process.env.E2E_DATABASE_URL = config.url;
process.env.E2E_RUNTIME = "1";

const client = postgres(config.url, { max: 1, prepare: false, ssl: false });
const migration = "src/lib/db/migrations/manual/0032_venue_onboarding_idempotency.sql";
type MigrationShape = {
  columns: string[];
  indexdef: string | null;
  ownerIndexdef: string | null;
  constraintdef: string | null;
  organizationColumns: string[];
  organizationIndexdef: string | null;
  organizationConstraintdef: string | null;
  organizationFkdef: string | null;
  hallColumns: string[];
  hallIndexdef: string | null;
  hallConstraintdef: string | null;
  galleryIndexdef: string | null;
  galleryConstraintdef: string | null;
};

function apply(label: string) {
  console.log(`-- ${label}`);
  execFileSync("npx", ["tsx", "scripts/apply-sql-file.ts", migration], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: config.url },
    encoding: "utf8",
    stdio: ["ignore", "inherit", "inherit"],
  });
}

function expectApplyRejected(label: string, message: string) {
  try {
    apply(label);
  } catch {
    return;
  }
  throw new Error(message);
}

async function main() {
  await verifyE2EDatabase(config);
  const migrationSource = readFileSync(migration, "utf8");
  for (const required of [
    "HAVING count(*) > 1",
    "0032 cannot enforce unique venues.user_id",
    "Resolve each listed user to one canonical legacy venue",
    "0032 found a non-canonical public.venues_user_id_not_null_uidx",
    "the canonical index is UNIQUE (user_id) WHERE user_id IS NOT NULL",
    "creation_actor_user_id",
    "creation_request_id",
    "creation_request_hash",
    "ON DELETE SET NULL",
    "partner_organizations_actor_creation_request_uidx",
    "0032 found a non-canonical organization creation-request index",
    "0032 found non-canonical venues onboarding columns",
    "0032 found a non-canonical venue onboarding-submission check",
    "0032 found a non-canonical venue onboarding-submission index",
    "venue_halls_venue_creation_request_uidx",
    "0032 found a non-canonical hall creation-request check",
    "venue_images_hall_cannot_be_cover_chk",
    "venue_images_one_general_cover_per_venue_uidx",
    "REVOKE ALL ON TABLE public.venues",
    "REVOKE ALL ON TABLE public.venue_images",
    "ALTER TABLE public.venues ENABLE ROW LEVEL SECURITY",
    "ALTER TABLE public.venue_images ENABLE ROW LEVEL SECURITY",
    "legal_acceptances_org_profile_scope_chk",
    "0032 cannot enforce organization legal scope",
    "ORDER BY sort_order ASC NULLS LAST, id ASC",
    "UPDATE public.venue_halls AS hall",
    "SET status = 'pending'",
    "hall.venue_id = venue.id",
    "hall.is_legacy_default = true",
    "hall.status = 'draft'",
    "venue.organization_id IS NULL",
    "venue.user_id IS NOT NULL",
    "venue.is_active = false",
  ]) {
    if (!migrationSource.includes(required)) {
      throw new Error(`0032 required migration guarantee is missing: ${required}`);
    }
  }
  const legacyBackfillSource = migrationSource.match(
    /UPDATE public\.venue_halls AS hall[\s\S]*?venue\.is_active = false;/,
  )?.[0];
  if (!legacyBackfillSource || /updated_at/i.test(legacyBackfillSource)) {
    throw new Error("0032 legacy-default backfill must be status-only with exact predicates");
  }
  const [baseline] = await client<{
    venues: boolean;
    organizations: boolean;
    users: boolean;
  }[]>`
    SELECT
      to_regclass('public.venues') IS NOT NULL AS venues,
      to_regclass('public.partner_organizations') IS NOT NULL AS organizations,
      to_regclass('public.users') IS NOT NULL AS users
  `;
  if (!baseline?.venues || !baseline.organizations || !baseline.users) {
    throw new Error("0032 requires a disposable post-0028 baseline.");
  }

  // This verifier is destructive by design, but verifyE2EDatabase above
  // guarantees a disposable loopback target. Recreate an actual pre-0032
  // baseline so a broken first-apply migration cannot be hidden by leftovers
  // from an earlier test run.
  await client.begin(async (sql) => {
    await sql`ALTER TABLE public.legal_acceptances DROP CONSTRAINT IF EXISTS legal_acceptances_org_profile_scope_chk`;
    await sql`ALTER TABLE public.venue_images DROP CONSTRAINT IF EXISTS venue_images_hall_cannot_be_cover_chk`;
    await sql`DROP INDEX IF EXISTS public.venue_images_one_general_cover_per_venue_uidx`;
    await sql`ALTER TABLE public.venue_halls DROP CONSTRAINT IF EXISTS venue_halls_creation_request_shape_chk`;
    await sql`DROP INDEX IF EXISTS public.venue_halls_venue_creation_request_uidx`;
    await sql`ALTER TABLE public.venue_halls
      DROP COLUMN IF EXISTS creation_request_id,
      DROP COLUMN IF EXISTS creation_payload_hash`;
    await sql`ALTER TABLE public.partner_organizations DROP CONSTRAINT IF EXISTS partner_organizations_creation_request_shape_chk`;
    await sql`ALTER TABLE public.partner_organizations DROP CONSTRAINT IF EXISTS partner_organizations_creation_actor_user_id_fkey`;
    await sql`DROP INDEX IF EXISTS public.partner_organizations_actor_creation_request_uidx`;
    await sql`ALTER TABLE public.partner_organizations
      DROP COLUMN IF EXISTS creation_actor_user_id,
      DROP COLUMN IF EXISTS creation_request_id,
      DROP COLUMN IF EXISTS creation_request_hash`;
    await sql`ALTER TABLE public.venues DROP CONSTRAINT IF EXISTS venues_onboarding_submission_shape_chk`;
    await sql`DROP INDEX IF EXISTS public.venues_org_onboarding_submission_uidx`;
    await sql`DROP INDEX IF EXISTS public.venues_user_id_not_null_uidx`;
    await sql`ALTER TABLE public.venues
      DROP COLUMN IF EXISTS onboarding_submission_id,
      DROP COLUMN IF EXISTS onboarding_submission_hash`;
  });
  const preMigrationColumns = await client<{ table_name: string; column_name: string }[]>`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND (
        (table_name = 'venues'
          AND column_name IN ('onboarding_submission_id', 'onboarding_submission_hash'))
        OR
        (table_name = 'partner_organizations'
          AND column_name IN ('creation_actor_user_id', 'creation_request_id', 'creation_request_hash'))
        OR
        (table_name = 'venue_halls'
          AND column_name IN ('creation_request_id', 'creation_payload_hash'))
      )
  `;
  if (preMigrationColumns.length !== 0) {
    throw new Error("0032 verifier could not establish a pre-migration baseline");
  }

  // Seed before the first apply so the compatibility backfill itself—not a
  // post-migration fixture—gets exercised. Each control differs by exactly
  // one guard that must keep it out of the target set.
  const backfillMark = `m32_backfill_${Date.now()}_${randomUUID().slice(0, 8)}`;
  const backfillUsers = await client<{ id: string }[]>`
    INSERT INTO users (clerk_id, email, name)
    VALUES
      (${`${backfillMark}_target`}, ${`${backfillMark}_target@example.invalid`}, 'M32 target'),
      (${`${backfillMark}_active`}, ${`${backfillMark}_active@example.invalid`}, 'M32 active'),
      (${`${backfillMark}_rejected`}, ${`${backfillMark}_rejected@example.invalid`}, 'M32 rejected')
    RETURNING id
  `;
  const [backfillTargetUser, backfillActiveUser, backfillRejectedUser] = backfillUsers;
  if (!backfillTargetUser || !backfillActiveUser || !backfillRejectedUser) {
    throw new Error("0032 legacy-backfill users were not created");
  }
  const [backfillOrganization] = await client<{ id: number }[]>`
    INSERT INTO partner_organizations (display_name, status)
    VALUES (${`${backfillMark}_organization`}, 'draft')
    RETURNING id
  `;
  if (!backfillOrganization) {
    throw new Error("0032 legacy-backfill organization was not created");
  }
  const backfillVenues = await client<{ id: number; fixture: string }[]>`
    INSERT INTO venues (user_id, organization_id, name_ro, slug, is_active)
    VALUES
      (${backfillTargetUser.id}, NULL, 'M32 legacy inactive', ${`${backfillMark}-target`}, false),
      (NULL, ${backfillOrganization.id}, 'M32 organization backed', ${`${backfillMark}-organization`}, false),
      (${backfillActiveUser.id}, NULL, 'M32 legacy active', ${`${backfillMark}-active`}, true),
      (${backfillRejectedUser.id}, NULL, 'M32 legacy rejected', ${`${backfillMark}-rejected`}, false)
    RETURNING id, slug AS fixture
  `;
  const venueByFixture = new Map(backfillVenues.map((row) => [row.fixture, row.id]));
  const targetVenueId = venueByFixture.get(`${backfillMark}-target`);
  const organizationVenueId = venueByFixture.get(`${backfillMark}-organization`);
  const activeVenueId = venueByFixture.get(`${backfillMark}-active`);
  const rejectedVenueId = venueByFixture.get(`${backfillMark}-rejected`);
  if (!targetVenueId || !organizationVenueId || !activeVenueId || !rejectedVenueId) {
    throw new Error("0032 legacy-backfill venues were not created");
  }
  const backfillHalls = await client<{ id: number; fixture: string }[]>`
    INSERT INTO venue_halls (venue_id, slug, name_ro, is_legacy_default, status)
    VALUES
      (${targetVenueId}, 'legacy-default', 'Legacy target', true, 'draft'),
      (${organizationVenueId}, 'legacy-default', 'Organization control', true, 'draft'),
      (${activeVenueId}, 'legacy-default', 'Active control', true, 'draft'),
      (${rejectedVenueId}, 'legacy-default', 'Rejected control', true, 'rejected')
    RETURNING id, name_ro AS fixture
  `;
  const hallByFixture = new Map(backfillHalls.map((row) => [row.fixture, row.id]));
  const backfillHallIds = {
    target: hallByFixture.get("Legacy target"),
    organization: hallByFixture.get("Organization control"),
    active: hallByFixture.get("Active control"),
    rejected: hallByFixture.get("Rejected control"),
  };
  if (Object.values(backfillHallIds).some((id) => !id)) {
    throw new Error("0032 legacy-backfill halls were not created");
  }
  const legacyGalleryRows = await client<{
    id: number;
    hallId: number | null;
    sortOrder: number | null;
  }[]>`
    INSERT INTO venue_images (venue_id, hall_id, url, sort_order, is_cover)
    VALUES
      (${targetVenueId}, NULL, ${`${backfillMark}-late-cover`}, 9, true),
      (${targetVenueId}, NULL, ${`${backfillMark}-first-cover`}, 1, true),
      (${targetVenueId}, NULL, ${`${backfillMark}-tie-cover`}, 1, true),
      (${targetVenueId}, ${backfillHallIds.target!}, ${`${backfillMark}-hall-cover`}, 0, true)
    RETURNING id, hall_id AS "hallId", sort_order AS "sortOrder"
  `;
  const expectedGeneralCoverId = legacyGalleryRows
    .filter((row) => row.hallId == null)
    .sort((left, right) =>
      (left.sortOrder ?? Number.MAX_SAFE_INTEGER)
        - (right.sortOrder ?? Number.MAX_SAFE_INTEGER)
      || left.id - right.id)[0]?.id;
  if (!expectedGeneralCoverId) {
    throw new Error("0032 gallery-repair fixtures were not created");
  }

  async function legacyBackfillStatuses() {
    const rows = await client<{ id: number; status: string }[]>`
      SELECT id, status
      FROM venue_halls
      WHERE id IN (
        ${backfillHallIds.target!},
        ${backfillHallIds.organization!},
        ${backfillHallIds.active!},
        ${backfillHallIds.rejected!}
      )
    `;
    return new Map(rows.map((row) => [row.id, row.status]));
  }

  function assertLegacyBackfill(
    state: Map<number, string>,
    stage: string,
  ) {
    const expected = new Map<number, string>([
      [backfillHallIds.target!, "pending"],
      [backfillHallIds.organization!, "draft"],
      [backfillHallIds.active!, "draft"],
      [backfillHallIds.rejected!, "rejected"],
    ]);
    for (const [id, status] of expected) {
      if (state.get(id) !== status) {
        throw new Error(
          `0032 legacy-default backfill mismatch after ${stage}: hall ${id} expected ${status}, got ${state.get(id) ?? "missing"}`,
        );
      }
    }
  }

  async function assertGalleryRepair(stage: string) {
    const rows = await client<{
      id: number;
      hallId: number | null;
      isCover: boolean;
    }[]>`
      SELECT id, hall_id AS "hallId", is_cover AS "isCover"
      FROM venue_images
      WHERE id = ANY(${legacyGalleryRows.map((row) => row.id)})
      ORDER BY id
    `;
    const coverIds = rows.filter((row) => row.isCover).map((row) => row.id);
    if (
      rows.length !== legacyGalleryRows.length
      || rows.some((row) => row.hallId != null && row.isCover)
      || coverIds.length !== 1
      || coverIds[0] !== expectedGeneralCoverId
    ) {
      throw new Error(
        `0032 gallery repair mismatch after ${stage}: ${JSON.stringify(rows)}`,
      );
    }
  }

  async function assertLegacyTableSecurity(stage: string) {
    const tables = await client<{ tableName: string; rowSecurity: boolean }[]>`
      SELECT relname AS "tableName", relrowsecurity AS "rowSecurity"
      FROM pg_class
      WHERE oid IN ('public.venues'::regclass, 'public.venue_images'::regclass)
      ORDER BY relname
    `;
    if (tables.length !== 2 || tables.some((table) => !table.rowSecurity)) {
      throw new Error(`0032 RLS mismatch after ${stage}: ${JSON.stringify(tables)}`);
    }
    const grants = await client<{ roleName: string; objectName: string; privilege: string }[]>`
      WITH target_tables(object_name) AS (
        VALUES ('public.venues'::text), ('public.venue_images'::text)
      ), table_privileges(privilege) AS (
        SELECT unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']::text[])
      )
      SELECT role.rolname AS "roleName", target.object_name AS "objectName", privilege.privilege
      FROM pg_roles AS role
      CROSS JOIN target_tables AS target
      CROSS JOIN table_privileges AS privilege
      WHERE role.rolname IN ('anon', 'authenticated')
        AND has_table_privilege(role.rolname, target.object_name, privilege.privilege)
      UNION ALL
      SELECT role.rolname, target.object_name, 'ANY_COLUMN'
      FROM pg_roles AS role
      CROSS JOIN target_tables AS target
      WHERE role.rolname IN ('anon', 'authenticated')
        AND has_any_column_privilege(role.rolname, target.object_name, 'SELECT,INSERT,UPDATE,REFERENCES')
      UNION ALL
      SELECT role.rolname, sequence_name, privilege.privilege
      FROM pg_roles AS role
      CROSS JOIN (
        VALUES ('public.venues_id_seq'::text), ('public.venue_images_id_seq'::text)
      ) AS target_sequence(sequence_name)
      CROSS JOIN (
        SELECT unnest(ARRAY['SELECT','USAGE','UPDATE']::text[]) AS privilege
      ) AS privilege
      WHERE role.rolname IN ('anon', 'authenticated')
        AND to_regclass(target_sequence.sequence_name) IS NOT NULL
        AND has_sequence_privilege(
          role.rolname,
          target_sequence.sequence_name,
          privilege.privilege
        )
      ORDER BY 1, 2, 3
    `;
    if (grants.length > 0) {
      throw new Error(`0032 browser-role grants remain after ${stage}: ${JSON.stringify(grants)}`);
    }
  }

  async function assertOrganizationLegalScope(stage: string) {
    const [constraint] = await client<{ definition: string; validated: boolean }[]>`
      SELECT pg_get_constraintdef(oid) AS definition, convalidated AS validated
      FROM pg_constraint
      WHERE conrelid = 'public.legal_acceptances'::regclass
        AND conname = 'legal_acceptances_org_profile_scope_chk'
        AND contype = 'c'
    `;
    if (
      !constraint?.validated
      || !constraint.definition.includes("organization_id IS NULL")
      || !constraint.definition.includes("artist_id IS NULL")
      || !constraint.definition.includes("venue_id IS NULL")
    ) {
      throw new Error(`0032 organization legal-scope constraint mismatch after ${stage}`);
    }
  }

  apply("0032 first apply");
  const firstBackfillState = await legacyBackfillStatuses();
  assertLegacyBackfill(firstBackfillState, "first apply");
  await assertLegacyTableSecurity("first apply");
  await assertOrganizationLegalScope("first apply");
  const [firstShape] = await client<MigrationShape[]>`
    SELECT
      ARRAY(
        SELECT column_name::text
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'venues'
          AND column_name IN ('onboarding_submission_id', 'onboarding_submission_hash')
        ORDER BY column_name
      ) AS columns,
      (
        SELECT indexdef
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND indexname = 'venues_org_onboarding_submission_uidx'
      ) AS indexdef,
      (
        SELECT indexdef
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND indexname = 'venues_user_id_not_null_uidx'
      ) AS "ownerIndexdef",
      (
        SELECT pg_get_constraintdef(oid)
        FROM pg_constraint
        WHERE conrelid = 'public.venues'::regclass
          AND conname = 'venues_onboarding_submission_shape_chk'
      ) AS constraintdef,
      ARRAY(
        SELECT column_name::text
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'partner_organizations'
          AND column_name IN (
            'creation_actor_user_id',
            'creation_request_id',
            'creation_request_hash'
          )
        ORDER BY column_name
      ) AS "organizationColumns",
      (
        SELECT indexdef
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND indexname = 'partner_organizations_actor_creation_request_uidx'
      ) AS "organizationIndexdef",
      (
        SELECT pg_get_constraintdef(oid)
        FROM pg_constraint
        WHERE conrelid = 'public.partner_organizations'::regclass
          AND conname = 'partner_organizations_creation_request_shape_chk'
      ) AS "organizationConstraintdef",
      (
        SELECT pg_get_constraintdef(oid)
        FROM pg_constraint
        WHERE conrelid = 'public.partner_organizations'::regclass
          AND conname = 'partner_organizations_creation_actor_user_id_fkey'
      ) AS "organizationFkdef",
      ARRAY(
        SELECT column_name::text
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'venue_halls'
          AND column_name IN ('creation_request_id', 'creation_payload_hash')
        ORDER BY column_name
      ) AS "hallColumns",
      (
        SELECT indexdef FROM pg_indexes
        WHERE schemaname = 'public'
          AND indexname = 'venue_halls_venue_creation_request_uidx'
      ) AS "hallIndexdef",
      (
        SELECT pg_get_constraintdef(oid) FROM pg_constraint
        WHERE conrelid = 'public.venue_halls'::regclass
          AND conname = 'venue_halls_creation_request_shape_chk'
      ) AS "hallConstraintdef",
      (
        SELECT indexdef FROM pg_indexes
        WHERE schemaname = 'public'
          AND indexname = 'venue_images_one_general_cover_per_venue_uidx'
      ) AS "galleryIndexdef",
      (
        SELECT pg_get_constraintdef(oid) FROM pg_constraint
        WHERE conrelid = 'public.venue_images'::regclass
          AND conname = 'venue_images_hall_cannot_be_cover_chk'
      ) AS "galleryConstraintdef"
  `;
  await assertGalleryRepair("first apply");
  apply("0032 second apply");
  const secondBackfillState = await legacyBackfillStatuses();
  assertLegacyBackfill(secondBackfillState, "second apply");
  await assertGalleryRepair("second apply");
  await assertLegacyTableSecurity("second apply");
  await assertOrganizationLegalScope("second apply");
  if (
    JSON.stringify([...secondBackfillState.entries()].sort())
    !== JSON.stringify([...firstBackfillState.entries()].sort())
  ) {
    throw new Error("0032 second apply changed legacy-default backfill controls");
  }
  const [secondShape] = await client<MigrationShape[]>`
    SELECT
      ARRAY(
        SELECT column_name::text
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'venues'
          AND column_name IN ('onboarding_submission_id', 'onboarding_submission_hash')
        ORDER BY column_name
      ) AS columns,
      (
        SELECT indexdef
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND indexname = 'venues_org_onboarding_submission_uidx'
      ) AS indexdef,
      (
        SELECT indexdef
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND indexname = 'venues_user_id_not_null_uidx'
      ) AS "ownerIndexdef",
      (
        SELECT pg_get_constraintdef(oid)
        FROM pg_constraint
        WHERE conrelid = 'public.venues'::regclass
          AND conname = 'venues_onboarding_submission_shape_chk'
      ) AS constraintdef,
      ARRAY(
        SELECT column_name::text
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'partner_organizations'
          AND column_name IN (
            'creation_actor_user_id',
            'creation_request_id',
            'creation_request_hash'
          )
        ORDER BY column_name
      ) AS "organizationColumns",
      (
        SELECT indexdef
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND indexname = 'partner_organizations_actor_creation_request_uidx'
      ) AS "organizationIndexdef",
      (
        SELECT pg_get_constraintdef(oid)
        FROM pg_constraint
        WHERE conrelid = 'public.partner_organizations'::regclass
          AND conname = 'partner_organizations_creation_request_shape_chk'
      ) AS "organizationConstraintdef",
      (
        SELECT pg_get_constraintdef(oid)
        FROM pg_constraint
        WHERE conrelid = 'public.partner_organizations'::regclass
          AND conname = 'partner_organizations_creation_actor_user_id_fkey'
      ) AS "organizationFkdef",
      ARRAY(
        SELECT column_name::text
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'venue_halls'
          AND column_name IN ('creation_request_id', 'creation_payload_hash')
        ORDER BY column_name
      ) AS "hallColumns",
      (
        SELECT indexdef FROM pg_indexes
        WHERE schemaname = 'public'
          AND indexname = 'venue_halls_venue_creation_request_uidx'
      ) AS "hallIndexdef",
      (
        SELECT pg_get_constraintdef(oid) FROM pg_constraint
        WHERE conrelid = 'public.venue_halls'::regclass
          AND conname = 'venue_halls_creation_request_shape_chk'
      ) AS "hallConstraintdef",
      (
        SELECT indexdef FROM pg_indexes
        WHERE schemaname = 'public'
          AND indexname = 'venue_images_one_general_cover_per_venue_uidx'
      ) AS "galleryIndexdef",
      (
        SELECT pg_get_constraintdef(oid) FROM pg_constraint
        WHERE conrelid = 'public.venue_images'::regclass
          AND conname = 'venue_images_hall_cannot_be_cover_chk'
      ) AS "galleryConstraintdef"
  `;
  if (JSON.stringify(secondShape) !== JSON.stringify(firstShape)) {
    throw new Error("0032 second apply changed the schema shape");
  }

  await client`DELETE FROM venue_images WHERE id = ANY(${legacyGalleryRows.map((row) => row.id)})`;
  await client`DELETE FROM venue_halls WHERE id IN (
    ${backfillHallIds.target!},
    ${backfillHallIds.organization!},
    ${backfillHallIds.active!},
    ${backfillHallIds.rejected!}
  )`;
  await client`DELETE FROM venues WHERE id IN (
    ${targetVenueId},
    ${organizationVenueId},
    ${activeVenueId},
    ${rejectedVenueId}
  )`;
  await client`DELETE FROM partner_organizations WHERE id = ${backfillOrganization.id}`;
  await client`DELETE FROM users WHERE id IN (
    ${backfillTargetUser.id},
    ${backfillActiveUser.id},
    ${backfillRejectedUser.id}
  )`;

  const columns = await client<{
    column_name: string;
    udt_name: string;
    is_nullable: string;
    column_default: string | null;
    is_identity: string;
    is_generated: string;
  }[]>`
    SELECT column_name, udt_name, is_nullable, column_default, is_identity, is_generated
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'venues'
      AND column_name IN ('onboarding_submission_id', 'onboarding_submission_hash')
    ORDER BY column_name
  `;
  if (columns.length !== 2) throw new Error("0032 onboarding columns are missing");
  const idColumn = columns.find((row) => row.column_name === "onboarding_submission_id");
  const hashColumn = columns.find((row) => row.column_name === "onboarding_submission_hash");
  if (
    idColumn?.udt_name !== "uuid"
    || hashColumn?.udt_name !== "text"
    || columns.some((row) =>
      row.is_nullable !== "YES"
      || row.column_default !== null
      || row.is_identity !== "NO"
      || row.is_generated !== "NEVER")
  ) {
    throw new Error(`0032 column shape mismatch: ${JSON.stringify(columns)}`);
  }

  const [index] = await client<{
    indexdef: string;
    isUnique: boolean;
    isValid: boolean;
    isReady: boolean;
    isPrimary: boolean;
    keyAttributes: number;
    totalAttributes: number;
    firstColumn: string;
    secondColumn: string;
    accessMethod: string;
    predicate: string | null;
    expressionCount: number;
  }[]>`
    SELECT
      pg_get_indexdef(index_shape.indexrelid) AS indexdef,
      index_shape.indisunique AS "isUnique",
      index_shape.indisvalid AS "isValid",
      index_shape.indisready AS "isReady",
      index_shape.indisprimary AS "isPrimary",
      index_shape.indnkeyatts AS "keyAttributes",
      index_shape.indnatts AS "totalAttributes",
      first_attribute.attname AS "firstColumn",
      second_attribute.attname AS "secondColumn",
      access_method.amname AS "accessMethod",
      pg_get_expr(index_shape.indpred, index_shape.indrelid) AS predicate,
      CASE WHEN index_shape.indexprs IS NULL THEN 0 ELSE 1 END AS "expressionCount"
    FROM pg_class AS index_relation
    JOIN pg_namespace AS index_namespace
      ON index_namespace.oid = index_relation.relnamespace
    JOIN pg_am AS access_method
      ON access_method.oid = index_relation.relam
    JOIN pg_index AS index_shape
      ON index_shape.indexrelid = index_relation.oid
    JOIN pg_attribute AS first_attribute
      ON first_attribute.attrelid = index_shape.indrelid
     AND first_attribute.attnum = index_shape.indkey[0]
    JOIN pg_attribute AS second_attribute
      ON second_attribute.attrelid = index_shape.indrelid
     AND second_attribute.attnum = index_shape.indkey[1]
    WHERE index_namespace.nspname = 'public'
      AND index_relation.relname = 'venues_org_onboarding_submission_uidx'
      AND index_shape.indrelid = 'public.venues'::regclass
  `;
  const indexPredicate = index?.predicate?.toLowerCase().replace(/[\s()]/g, "");
  if (
    index?.isUnique !== true
    || index.isValid !== true
    || index.isReady !== true
    || index.isPrimary !== false
    || index.keyAttributes !== 2
    || index.totalAttributes !== 2
    || index.firstColumn !== "organization_id"
    || index.secondColumn !== "onboarding_submission_id"
    || index.accessMethod !== "btree"
    || index.expressionCount !== 0
    || indexPredicate !== "onboarding_submission_idisnotnull"
  ) {
    throw new Error(`0032 unique index shape mismatch: ${index?.indexdef ?? "missing"}`);
  }

  const [ownerIndex] = await client<{
    indexdef: string;
    isUnique: boolean;
    isValid: boolean;
    isReady: boolean;
    keyAttributes: number;
    totalAttributes: number;
    keyColumn: string;
    predicate: string | null;
  }[]>`
    SELECT
      pg_get_indexdef(owner_index.indexrelid) AS indexdef,
      owner_index.indisunique AS "isUnique",
      owner_index.indisvalid AS "isValid",
      owner_index.indisready AS "isReady",
      owner_index.indnkeyatts AS "keyAttributes",
      owner_index.indnatts AS "totalAttributes",
      key_attribute.attname AS "keyColumn",
      pg_get_expr(owner_index.indpred, owner_index.indrelid) AS predicate
    FROM pg_class AS index_relation
    JOIN pg_namespace AS index_namespace
      ON index_namespace.oid = index_relation.relnamespace
    JOIN pg_index AS owner_index
      ON owner_index.indexrelid = index_relation.oid
    JOIN pg_attribute AS key_attribute
      ON key_attribute.attrelid = owner_index.indrelid
     AND key_attribute.attnum = owner_index.indkey[0]
    WHERE index_namespace.nspname = 'public'
      AND index_relation.relname = 'venues_user_id_not_null_uidx'
      AND owner_index.indrelid = 'public.venues'::regclass
  `;
  const ownerPredicate = ownerIndex?.predicate
    ?.toLowerCase()
    .replace(/[\s()]/g, "");
  if (
    ownerIndex?.isUnique !== true
    || ownerIndex.isValid !== true
    || ownerIndex.isReady !== true
    || ownerIndex.keyAttributes !== 1
    || ownerIndex.totalAttributes !== 1
    || ownerIndex.keyColumn !== "user_id"
    || ownerPredicate !== "user_idisnotnull"
  ) {
    throw new Error(
      `0032 venue-owner unique index shape mismatch: ${ownerIndex?.indexdef ?? "missing"}`,
    );
  }

  const [constraint] = await client<{
    definition: string;
    expression: string;
    isValidated: boolean;
    isInheritable: boolean;
  }[]>`
    SELECT
      pg_get_constraintdef(oid) AS definition,
      pg_get_expr(conbin, conrelid) AS expression,
      convalidated AS "isValidated",
      NOT connoinherit AS "isInheritable"
    FROM pg_constraint
    WHERE conrelid = 'public.venues'::regclass
      AND conname = 'venues_onboarding_submission_shape_chk'
  `;
  const constraintExpression = constraint?.expression
    .toLowerCase()
    .replace(/[\s()]/g, "");
  if (
    constraint?.isValidated !== true
    || constraint.isInheritable !== true
    || constraintExpression !==
      "onboarding_submission_idisnullandonboarding_submission_hashisnulloronboarding_submission_idisnotnullandonboarding_submission_hashisnotnullandorganization_idisnotnull"
  ) {
    throw new Error(`0032 check constraint shape mismatch: ${constraint?.definition ?? "missing"}`);
  }

  const organizationColumns = await client<{
    column_name: string;
    udt_name: string;
    is_nullable: string;
    column_default: string | null;
    is_identity: string;
    is_generated: string;
  }[]>`
    SELECT column_name, udt_name, is_nullable, column_default, is_identity, is_generated
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'partner_organizations'
      AND column_name IN (
        'creation_actor_user_id',
        'creation_request_id',
        'creation_request_hash'
      )
    ORDER BY column_name
  `;
  if (organizationColumns.length !== 3) {
    throw new Error("0032 organization creation columns are missing");
  }
  const actorColumn = organizationColumns.find((row) =>
    row.column_name === "creation_actor_user_id");
  const requestColumn = organizationColumns.find((row) =>
    row.column_name === "creation_request_id");
  const requestHashColumn = organizationColumns.find((row) =>
    row.column_name === "creation_request_hash");
  if (
    actorColumn?.udt_name !== "uuid" || actorColumn.is_nullable !== "YES"
    || requestColumn?.udt_name !== "uuid" || requestColumn.is_nullable !== "YES"
    || requestHashColumn?.udt_name !== "text" || requestHashColumn.is_nullable !== "YES"
    || organizationColumns.some((row) =>
      row.column_default !== null
      || row.is_identity !== "NO"
      || row.is_generated !== "NEVER")
  ) {
    throw new Error(
      `0032 organization column shape mismatch: ${JSON.stringify(organizationColumns)}`,
    );
  }

  const [organizationIndex] = await client<{
    indexdef: string;
    isUnique: boolean;
    isValid: boolean;
    isReady: boolean;
    isPrimary: boolean;
    keyAttributes: number;
    totalAttributes: number;
    firstColumn: string;
    secondColumn: string;
    accessMethod: string;
    expressionCount: number;
    predicate: string | null;
  }[]>`
    SELECT
      pg_get_indexdef(index_shape.indexrelid) AS indexdef,
      index_shape.indisunique AS "isUnique",
      index_shape.indisvalid AS "isValid",
      index_shape.indisready AS "isReady",
      index_shape.indisprimary AS "isPrimary",
      index_shape.indnkeyatts AS "keyAttributes",
      index_shape.indnatts AS "totalAttributes",
      first_attribute.attname AS "firstColumn",
      second_attribute.attname AS "secondColumn",
      access_method.amname AS "accessMethod",
      CASE WHEN index_shape.indexprs IS NULL THEN 0 ELSE 1 END AS "expressionCount",
      pg_get_expr(index_shape.indpred, index_shape.indrelid) AS predicate
    FROM pg_class AS index_relation
    JOIN pg_namespace AS index_namespace
      ON index_namespace.oid = index_relation.relnamespace
    JOIN pg_am AS access_method
      ON access_method.oid = index_relation.relam
    JOIN pg_index AS index_shape
      ON index_shape.indexrelid = index_relation.oid
    JOIN pg_attribute AS first_attribute
      ON first_attribute.attrelid = index_shape.indrelid
     AND first_attribute.attnum = index_shape.indkey[0]
    JOIN pg_attribute AS second_attribute
      ON second_attribute.attrelid = index_shape.indrelid
     AND second_attribute.attnum = index_shape.indkey[1]
    WHERE index_namespace.nspname = 'public'
      AND index_relation.relname = 'partner_organizations_actor_creation_request_uidx'
      AND index_shape.indrelid = 'public.partner_organizations'::regclass
  `;
  const organizationPredicate = organizationIndex?.predicate
    ?.toLowerCase()
    .replace(/[\s()]/g, "");
  if (
    organizationIndex?.isUnique !== true
    || organizationIndex.isValid !== true
    || organizationIndex.isReady !== true
    || organizationIndex.isPrimary !== false
    || organizationIndex.keyAttributes !== 2
    || organizationIndex.totalAttributes !== 2
    || organizationIndex.firstColumn !== "creation_actor_user_id"
    || organizationIndex.secondColumn !== "creation_request_id"
    || organizationIndex.accessMethod !== "btree"
    || organizationIndex.expressionCount !== 0
    || organizationPredicate !==
      "creation_actor_user_idisnotnullandcreation_request_idisnotnull"
  ) {
    throw new Error(
      `0032 organization unique index mismatch: ${organizationIndex?.indexdef ?? "missing"}`,
    );
  }

  const [organizationFk] = await client<{
    definition: string;
    deleteAction: string;
    sourceColumn: string;
    targetColumn: string;
    targetTable: string;
  }[]>`
    SELECT
      pg_get_constraintdef(creation_fk.oid) AS definition,
      creation_fk.confdeltype::text AS "deleteAction",
      source_attribute.attname AS "sourceColumn",
      target_attribute.attname AS "targetColumn",
      creation_fk.confrelid::regclass::text AS "targetTable"
    FROM pg_constraint AS creation_fk
    JOIN pg_attribute AS source_attribute
      ON source_attribute.attrelid = creation_fk.conrelid
     AND source_attribute.attnum = creation_fk.conkey[1]
    JOIN pg_attribute AS target_attribute
      ON target_attribute.attrelid = creation_fk.confrelid
     AND target_attribute.attnum = creation_fk.confkey[1]
    WHERE creation_fk.conrelid = 'public.partner_organizations'::regclass
      AND creation_fk.conname = 'partner_organizations_creation_actor_user_id_fkey'
      AND creation_fk.contype = 'f'
  `;
  if (
    organizationFk?.deleteAction !== "n"
    || organizationFk.sourceColumn !== "creation_actor_user_id"
    || organizationFk.targetColumn !== "id"
    || !organizationFk.targetTable.endsWith("users")
  ) {
    throw new Error(
      `0032 organization actor FK mismatch: ${organizationFk?.definition ?? "missing"}`,
    );
  }

  const [organizationConstraint] = await client<{
    definition: string;
    expression: string;
    isValidated: boolean;
    isInheritable: boolean;
  }[]>`
    SELECT
      pg_get_constraintdef(oid) AS definition,
      pg_get_expr(conbin, conrelid) AS expression,
      convalidated AS "isValidated",
      NOT connoinherit AS "isInheritable"
    FROM pg_constraint
    WHERE conrelid = 'public.partner_organizations'::regclass
      AND conname = 'partner_organizations_creation_request_shape_chk'
      AND contype = 'c'
  `;
  const organizationConstraintExpression = organizationConstraint?.expression
    .toLowerCase()
    .replace(/[\s()]/g, "");
  if (
    organizationConstraint?.isValidated !== true
    || organizationConstraint.isInheritable !== true
    || organizationConstraintExpression !==
      "creation_actor_user_idisnullandcreation_request_idisnullandcreation_request_hashisnullorcreation_request_idisnotnullandcreation_request_hashisnotnull"
  ) {
    throw new Error(
      `0032 organization check mismatch: ${organizationConstraint?.definition ?? "missing"}`,
    );
  }

  const hallColumns = await client<{
    column_name: string;
    udt_name: string;
    is_nullable: string;
    column_default: string | null;
    is_identity: string;
    is_generated: string;
  }[]>`
    SELECT column_name, udt_name, is_nullable, column_default, is_identity, is_generated
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'venue_halls'
      AND column_name IN ('creation_request_id', 'creation_payload_hash')
    ORDER BY column_name
  `;
  if (
    hallColumns.length !== 2
    || hallColumns.find((row) => row.column_name === "creation_request_id")?.udt_name !== "uuid"
    || hallColumns.find((row) => row.column_name === "creation_payload_hash")?.udt_name !== "text"
    || hallColumns.some((row) =>
      row.is_nullable !== "YES"
      || row.column_default !== null
      || row.is_identity !== "NO"
      || row.is_generated !== "NEVER")
  ) {
    throw new Error(`0032 hall column shape mismatch: ${JSON.stringify(hallColumns)}`);
  }

  const [hallIndex] = await client<{
    indexdef: string;
    isUnique: boolean;
    isValid: boolean;
    isReady: boolean;
    isPrimary: boolean;
    keyAttributes: number;
    totalAttributes: number;
    firstColumn: string;
    secondColumn: string;
    accessMethod: string;
    expressionCount: number;
    predicate: string | null;
  }[]>`
    SELECT
      pg_get_indexdef(index_shape.indexrelid) AS indexdef,
      index_shape.indisunique AS "isUnique",
      index_shape.indisvalid AS "isValid",
      index_shape.indisready AS "isReady",
      index_shape.indisprimary AS "isPrimary",
      index_shape.indnkeyatts AS "keyAttributes",
      index_shape.indnatts AS "totalAttributes",
      first_attribute.attname AS "firstColumn",
      second_attribute.attname AS "secondColumn",
      access_method.amname AS "accessMethod",
      CASE WHEN index_shape.indexprs IS NULL THEN 0 ELSE 1 END AS "expressionCount",
      pg_get_expr(index_shape.indpred, index_shape.indrelid) AS predicate
    FROM pg_class AS index_relation
    JOIN pg_namespace AS index_namespace
      ON index_namespace.oid = index_relation.relnamespace
    JOIN pg_am AS access_method
      ON access_method.oid = index_relation.relam
    JOIN pg_index AS index_shape
      ON index_shape.indexrelid = index_relation.oid
    JOIN pg_attribute AS first_attribute
      ON first_attribute.attrelid = index_shape.indrelid
     AND first_attribute.attnum = index_shape.indkey[0]
    JOIN pg_attribute AS second_attribute
      ON second_attribute.attrelid = index_shape.indrelid
     AND second_attribute.attnum = index_shape.indkey[1]
    WHERE index_namespace.nspname = 'public'
      AND index_relation.relname = 'venue_halls_venue_creation_request_uidx'
      AND index_shape.indrelid = 'public.venue_halls'::regclass
  `;
  const hallIndexPredicate = hallIndex?.predicate
    ?.toLowerCase()
    .replace(/[\s()]/g, "");
  if (
    hallIndex?.isUnique !== true
    || hallIndex.isValid !== true
    || hallIndex.isReady !== true
    || hallIndex.isPrimary !== false
    || hallIndex.keyAttributes !== 2
    || hallIndex.totalAttributes !== 2
    || hallIndex.firstColumn !== "venue_id"
    || hallIndex.secondColumn !== "creation_request_id"
    || hallIndex.accessMethod !== "btree"
    || hallIndex.expressionCount !== 0
    || hallIndexPredicate !== "creation_request_idisnotnull"
  ) {
    throw new Error(`0032 hall unique index mismatch: ${hallIndex?.indexdef ?? "missing"}`);
  }

  const [hallConstraint] = await client<{
    definition: string;
    expression: string;
    isValidated: boolean;
    isInheritable: boolean;
  }[]>`
    SELECT
      pg_get_constraintdef(oid) AS definition,
      pg_get_expr(conbin, conrelid) AS expression,
      convalidated AS "isValidated",
      NOT connoinherit AS "isInheritable"
    FROM pg_constraint
    WHERE conrelid = 'public.venue_halls'::regclass
      AND conname = 'venue_halls_creation_request_shape_chk'
      AND contype = 'c'
  `;
  const hallConstraintExpression = hallConstraint?.expression
    .toLowerCase()
    .replace(/[\s()]/g, "");
  if (
    hallConstraint?.isValidated !== true
    || hallConstraint.isInheritable !== true
    || hallConstraintExpression !==
      "creation_request_idisnull=creation_payload_hashisnull"
  ) {
    throw new Error(`0032 hall check mismatch: ${hallConstraint?.definition ?? "missing"}`);
  }

  const [galleryConstraint] = await client<{
    definition: string;
    expression: string;
    isValidated: boolean;
    isInheritable: boolean;
  }[]>`
    SELECT
      pg_get_constraintdef(oid) AS definition,
      pg_get_expr(conbin, conrelid) AS expression,
      convalidated AS "isValidated",
      NOT connoinherit AS "isInheritable"
    FROM pg_constraint
    WHERE conrelid = 'public.venue_images'::regclass
      AND conname = 'venue_images_hall_cannot_be_cover_chk'
      AND contype = 'c'
  `;
  const galleryConstraintExpression = galleryConstraint?.expression
    .toLowerCase()
    .replace(/[\s()]/g, "");
  if (
    galleryConstraint?.isValidated !== true
    || galleryConstraint.isInheritable !== true
    || galleryConstraintExpression !== "hall_idisnullornotis_cover"
  ) {
    throw new Error(
      `0032 gallery check mismatch: ${galleryConstraint?.definition ?? "missing"}`,
    );
  }

  const [galleryIndex] = await client<{
    indexdef: string;
    isUnique: boolean;
    isValid: boolean;
    isReady: boolean;
    isPrimary: boolean;
    keyAttributes: number;
    totalAttributes: number;
    keyColumn: string;
    accessMethod: string;
    expressionCount: number;
    predicate: string | null;
  }[]>`
    SELECT
      pg_get_indexdef(index_shape.indexrelid) AS indexdef,
      index_shape.indisunique AS "isUnique",
      index_shape.indisvalid AS "isValid",
      index_shape.indisready AS "isReady",
      index_shape.indisprimary AS "isPrimary",
      index_shape.indnkeyatts AS "keyAttributes",
      index_shape.indnatts AS "totalAttributes",
      key_attribute.attname AS "keyColumn",
      access_method.amname AS "accessMethod",
      CASE WHEN index_shape.indexprs IS NULL THEN 0 ELSE 1 END AS "expressionCount",
      pg_get_expr(index_shape.indpred, index_shape.indrelid) AS predicate
    FROM pg_class AS index_relation
    JOIN pg_namespace AS index_namespace
      ON index_namespace.oid = index_relation.relnamespace
    JOIN pg_am AS access_method
      ON access_method.oid = index_relation.relam
    JOIN pg_index AS index_shape
      ON index_shape.indexrelid = index_relation.oid
    JOIN pg_attribute AS key_attribute
      ON key_attribute.attrelid = index_shape.indrelid
     AND key_attribute.attnum = index_shape.indkey[0]
    WHERE index_namespace.nspname = 'public'
      AND index_relation.relname = 'venue_images_one_general_cover_per_venue_uidx'
      AND index_shape.indrelid = 'public.venue_images'::regclass
  `;
  const galleryIndexPredicate = galleryIndex?.predicate
    ?.toLowerCase()
    .replace(/[\s()]/g, "");
  if (
    galleryIndex?.isUnique !== true
    || galleryIndex.isValid !== true
    || galleryIndex.isReady !== true
    || galleryIndex.isPrimary !== false
    || galleryIndex.keyAttributes !== 1
    || galleryIndex.totalAttributes !== 1
    || galleryIndex.keyColumn !== "venue_id"
    || galleryIndex.accessMethod !== "btree"
    || galleryIndex.expressionCount !== 0
    || galleryIndexPredicate !== "hall_idisnullandis_cover"
  ) {
    throw new Error(
      `0032 gallery unique index mismatch: ${galleryIndex?.indexdef ?? "missing"}`,
    );
  }

  const mark = `m32_${Date.now()}_${randomUUID().slice(0, 8)}`;
  const key = randomUUID();
  const organizationKey = randomUUID();
  const fixtureUsers = await client<{ id: string }[]>`
    INSERT INTO users (clerk_id, email, name)
    VALUES
      (${`${mark}_owner`}, ${`${mark}_owner@example.invalid`}, 'M32 owner'),
      (${`${mark}_tombstone`}, ${`${mark}_tombstone@example.invalid`}, 'M32 tombstone')
    RETURNING id
  `;
  const [owner, tombstoneOwner] = fixtureUsers;
  if (!owner || !tombstoneOwner) throw new Error("0032 fixture owners were not created");
  const organizations = await client<{ id: number }[]>`
    INSERT INTO partner_organizations (display_name, status)
    VALUES (${`${mark}_a`}, 'draft'), (${`${mark}_b`}, 'draft')
    RETURNING id
  `;
  const [orgA, orgB] = organizations;
  if (!orgA || !orgB) throw new Error("0032 fixture organizations were not created");
  const createdOrganizationIds = [orgA.id, orgB.id];
  try {
    const [idempotentOrganization] = await client<{ id: number }[]>`
      INSERT INTO partner_organizations (
        display_name,
        status,
        creation_actor_user_id,
        creation_request_id,
        creation_request_hash
      ) VALUES (
        ${`${mark}_organization_create`},
        'draft',
        ${owner.id},
        ${organizationKey},
        ${"a".repeat(64)}
      )
      RETURNING id
    `;
    if (!idempotentOrganization) {
      throw new Error("0032 organization-idempotency fixture was not created");
    }
    createdOrganizationIds.push(idempotentOrganization.id);

    let duplicateOrganizationKeyRejected = false;
    try {
      await client`
        INSERT INTO partner_organizations (
          display_name,
          status,
          creation_actor_user_id,
          creation_request_id,
          creation_request_hash
        ) VALUES (
          ${`${mark}_organization_duplicate`},
          'draft',
          ${owner.id},
          ${organizationKey},
          ${"b".repeat(64)}
        )
      `;
    } catch (error) {
      duplicateOrganizationKeyRejected = (error as { code?: string }).code === "23505";
    }
    if (!duplicateOrganizationKeyRejected) {
      throw new Error("0032 did not reject a duplicate organization actor/request key");
    }

    for (const invalid of [
      { actor: owner.id, requestId: null, hash: null, suffix: "actor-only" },
      { actor: null, requestId: randomUUID(), hash: null, suffix: "request-only" },
    ]) {
      let invalidOrganizationShapeRejected = false;
      try {
        await client`
          INSERT INTO partner_organizations (
            display_name,
            status,
            creation_actor_user_id,
            creation_request_id,
            creation_request_hash
          ) VALUES (
            ${`${mark}_${invalid.suffix}`},
            'draft',
            ${invalid.actor},
            ${invalid.requestId},
            ${invalid.hash}
          )
        `;
      } catch (error) {
        invalidOrganizationShapeRejected = (error as { code?: string }).code === "23514";
      }
      if (!invalidOrganizationShapeRejected) {
        throw new Error(`0032 accepted invalid organization shape: ${invalid.suffix}`);
      }
    }

    const [tombstoneOrganization] = await client<{ id: number }[]>`
      INSERT INTO partner_organizations (
        display_name,
        status,
        creation_actor_user_id,
        creation_request_id,
        creation_request_hash
      ) VALUES (
        ${`${mark}_tombstone_org`},
        'draft',
        ${tombstoneOwner.id},
        ${randomUUID()},
        ${"c".repeat(64)}
      )
      RETURNING id
    `;
    if (!tombstoneOrganization) throw new Error("0032 tombstone organization was not created");
    createdOrganizationIds.push(tombstoneOrganization.id);
    await client`DELETE FROM users WHERE id = ${tombstoneOwner.id}`;
    const [tombstone] = await client<{
      actor: string | null;
      requestId: string | null;
      requestHash: string | null;
    }[]>`
      SELECT
        creation_actor_user_id AS actor,
        creation_request_id AS "requestId",
        creation_request_hash AS "requestHash"
      FROM partner_organizations
      WHERE id = ${tombstoneOrganization.id}
    `;
    if (
      tombstone?.actor !== null
      || !tombstone.requestId
      || tombstone.requestHash !== "c".repeat(64)
    ) {
      throw new Error("0032 ON DELETE SET NULL did not preserve the idempotency tombstone");
    }

    await client`
      INSERT INTO venues (user_id, name_ro, slug)
      VALUES (${owner.id}, 'M32 owner A', ${`${mark}-owner-a`})
    `;
    let duplicateOwnerRejected = false;
    try {
      await client`
        INSERT INTO venues (user_id, name_ro, slug)
        VALUES (${owner.id}, 'M32 owner B', ${`${mark}-owner-b`})
      `;
    } catch (error) {
      duplicateOwnerRejected = (error as { code?: string }).code === "23505";
    }
    if (!duplicateOwnerRejected) {
      throw new Error("0032 did not reject two venues with the same non-null user_id");
    }

    const [venueA] = await client<{ id: number }[]>`
      INSERT INTO venues (
        organization_id, onboarding_submission_id, onboarding_submission_hash,
        name_ro, slug
      ) VALUES (${orgA.id}, ${key}, 'hash-a', 'M32 A', ${`${mark}-a`})
      RETURNING id
    `;

    const [venueB] = await client<{ id: number }[]>`
      INSERT INTO venues (
        organization_id, onboarding_submission_id, onboarding_submission_hash,
        name_ro, slug
      ) VALUES (${orgB.id}, ${key}, 'hash-b', 'M32 B', ${`${mark}-b`})
      RETURNING id
    `;
    if (!venueA || !venueB) throw new Error("0032 venue fixtures were not created");

    let duplicateRejected = false;
    try {
      await client`
        INSERT INTO venues (
          organization_id, onboarding_submission_id, onboarding_submission_hash,
          name_ro, slug
        ) VALUES (${orgA.id}, ${key}, 'hash-c', 'M32 duplicate', ${`${mark}-duplicate`})
      `;
    } catch (error) {
      duplicateRejected = (error as { code?: string }).code === "23505";
    }
    if (!duplicateRejected) throw new Error("0032 did not reject a duplicate key in one organization");

    let invalidShapeRejected = false;
    try {
      await client`
        INSERT INTO venues (
          organization_id, onboarding_submission_id, onboarding_submission_hash,
          name_ro, slug
        ) VALUES (${orgA.id}, ${randomUUID()}, NULL, 'M32 invalid', ${`${mark}-invalid`})
      `;
    } catch (error) {
      invalidShapeRejected = (error as { code?: string }).code === "23514";
    }
    if (!invalidShapeRejected) throw new Error("0032 did not reject a partial idempotency identity");

    const hallKey = randomUUID();
    const [hallA] = await client<{ id: number }[]>`
      INSERT INTO venue_halls (
        venue_id, creation_request_id, creation_payload_hash, slug, name_ro
      ) VALUES (${venueA.id}, ${hallKey}, ${"d".repeat(64)}, 'same-name-a', 'Same name')
      RETURNING id
    `;
    const [sameNameHall] = await client<{ id: number }[]>`
      INSERT INTO venue_halls (
        venue_id, creation_request_id, creation_payload_hash, slug, name_ro
      ) VALUES (${venueA.id}, ${randomUUID()}, ${"e".repeat(64)}, 'same-name-b', 'Same name')
      RETURNING id
    `;
    const [sameKeyOtherVenueHall] = await client<{ id: number }[]>`
      INSERT INTO venue_halls (
        venue_id, creation_request_id, creation_payload_hash, slug, name_ro
      ) VALUES (${venueB.id}, ${hallKey}, ${"f".repeat(64)}, 'same-key-other-venue', 'Same key other venue')
      RETURNING id
    `;
    if (!hallA || !sameNameHall || !sameKeyOtherVenueHall) {
      throw new Error("0032 hall idempotency fixtures were not created");
    }

    let duplicateHallKeyRejected = false;
    try {
      await client`
        INSERT INTO venue_halls (
          venue_id, creation_request_id, creation_payload_hash, slug, name_ro
        ) VALUES (${venueA.id}, ${hallKey}, ${"0".repeat(64)}, 'duplicate-key', 'Duplicate key')
      `;
    } catch (error) {
      duplicateHallKeyRejected = (error as { code?: string }).code === "23505";
    }
    if (!duplicateHallKeyRejected) {
      throw new Error("0032 did not reject a duplicate hall venue/request key");
    }

    let invalidHallShapeRejected = false;
    try {
      await client`
        INSERT INTO venue_halls (
          venue_id, creation_request_id, creation_payload_hash, slug, name_ro
        ) VALUES (${venueA.id}, ${randomUUID()}, NULL, 'partial-key', 'Partial key')
      `;
    } catch (error) {
      invalidHallShapeRejected = (error as { code?: string }).code === "23514";
    }
    if (!invalidHallShapeRejected) {
      throw new Error("0032 accepted a partial hall creation identity");
    }

    await client`
      INSERT INTO venue_images (venue_id, hall_id, url, is_cover)
      VALUES (${venueA.id}, NULL, ${`${mark}-general-cover`}, true)
    `;
    let duplicateGeneralCoverRejected = false;
    try {
      await client`
        INSERT INTO venue_images (venue_id, hall_id, url, is_cover)
        VALUES (${venueA.id}, NULL, ${`${mark}-second-general-cover`}, true)
      `;
    } catch (error) {
      duplicateGeneralCoverRejected = (error as { code?: string }).code === "23505";
    }
    if (!duplicateGeneralCoverRejected) {
      throw new Error("0032 did not reject a second general venue cover");
    }

    let hallCoverRejected = false;
    try {
      await client`
        INSERT INTO venue_images (venue_id, hall_id, url, is_cover)
        VALUES (${venueA.id}, ${hallA.id}, ${`${mark}-invalid-hall-cover`}, true)
      `;
    } catch (error) {
      hallCoverRejected = (error as { code?: string }).code === "23514";
    }
    if (!hallCoverRejected) {
      throw new Error("0032 accepted a hall-scoped cover image");
    }
  } finally {
    await client`DELETE FROM venues WHERE organization_id IN (${orgA.id}, ${orgB.id})`;
    await client`DELETE FROM venues WHERE user_id = ${owner.id}`;
    await client`DELETE FROM partner_organizations WHERE id = ANY(${createdOrganizationIds})`;
    await client`DELETE FROM users WHERE id = ANY(${[owner.id, tombstoneOwner.id]})`;
  }

  // IF NOT EXISTS must not silently accept a same-name/wrong-shape object.
  await client`DROP INDEX public.partner_organizations_actor_creation_request_uidx`;
  await client`CREATE INDEX partner_organizations_actor_creation_request_uidx
    ON public.partner_organizations (creation_request_id)`;
  expectApplyRejected(
    "0032 rejects wrong organization index",
    "0032 silently accepted a wrong-shaped organization idempotency index",
  );
  await client`DROP INDEX public.partner_organizations_actor_creation_request_uidx`;
  apply("0032 restores canonical organization index");

  // The canonical clauses as substrings are insufficient: an extra OR can
  // turn a same-name CHECK into a much weaker guarantee.
  await client`ALTER TABLE public.partner_organizations
    DROP CONSTRAINT partner_organizations_creation_request_shape_chk`;
  await client`ALTER TABLE public.partner_organizations
    ADD CONSTRAINT partner_organizations_creation_request_shape_chk CHECK (
      (
        creation_actor_user_id IS NULL
        AND creation_request_id IS NULL
        AND creation_request_hash IS NULL
      )
      OR (creation_request_id IS NOT NULL AND creation_request_hash IS NOT NULL)
      OR creation_request_hash IS NULL
    )`;
  expectApplyRejected(
    "0032 rejects weaker organization check",
    "0032 silently accepted an organization check with an extra OR branch",
  );
  await client`ALTER TABLE public.partner_organizations
    DROP CONSTRAINT partner_organizations_creation_request_shape_chk`;
  apply("0032 restores canonical organization check");

  // A same-name column with a default changes the meaning of omitted values.
  // ADD COLUMN IF NOT EXISTS must fail closed instead of masking it.
  await client`ALTER TABLE public.venues
    ALTER COLUMN onboarding_submission_hash SET DEFAULT 'non-canonical'`;
  expectApplyRejected(
    "0032 rejects wrong venue column",
    "0032 silently accepted a venue onboarding column with a default",
  );
  await client`ALTER TABLE public.venues
    ALTER COLUMN onboarding_submission_hash DROP DEFAULT`;
  apply("0032 accepts restored venue columns");

  await client`ALTER TABLE public.venues
    DROP CONSTRAINT venues_onboarding_submission_shape_chk`;
  await client`ALTER TABLE public.venues
    ADD CONSTRAINT venues_onboarding_submission_shape_chk CHECK (
      (
        onboarding_submission_id IS NULL
        AND onboarding_submission_hash IS NULL
      )
      OR (
        onboarding_submission_id IS NOT NULL
        AND onboarding_submission_hash IS NOT NULL
        AND organization_id IS NOT NULL
      )
      OR organization_id IS NULL
    )`;
  expectApplyRejected(
    "0032 rejects weaker venue check",
    "0032 silently accepted a venue onboarding check with an extra OR branch",
  );
  await client`ALTER TABLE public.venues
    DROP CONSTRAINT venues_onboarding_submission_shape_chk`;
  apply("0032 restores canonical venue check");

  await client`DROP INDEX public.venues_org_onboarding_submission_uidx`;
  await client`CREATE UNIQUE INDEX venues_org_onboarding_submission_uidx
    ON public.venues (onboarding_submission_id, organization_id)
    WHERE onboarding_submission_id IS NOT NULL`;
  expectApplyRejected(
    "0032 rejects wrong venue index",
    "0032 silently accepted a reversed venue onboarding index",
  );
  await client`DROP INDEX public.venues_org_onboarding_submission_uidx`;
  apply("0032 restores canonical venue index");

  await client`ALTER TABLE public.venue_halls
    DROP CONSTRAINT venue_halls_creation_request_shape_chk`;
  await client`ALTER TABLE public.venue_halls
    ADD CONSTRAINT venue_halls_creation_request_shape_chk CHECK (
      (creation_request_id IS NULL) = (creation_payload_hash IS NULL)
      OR creation_request_id IS NULL
    )`;
  expectApplyRejected(
    "0032 rejects weaker hall check",
    "0032 silently accepted a hall creation check with an extra OR branch",
  );
  await client`ALTER TABLE public.venue_halls
    DROP CONSTRAINT venue_halls_creation_request_shape_chk`;
  apply("0032 restores canonical hall check");

  await client`DROP INDEX public.venue_halls_venue_creation_request_uidx`;
  await client`CREATE UNIQUE INDEX venue_halls_venue_creation_request_uidx
    ON public.venue_halls (creation_request_id, venue_id)
    WHERE creation_request_id IS NOT NULL`;
  expectApplyRejected(
    "0032 rejects wrong hall index",
    "0032 silently accepted a reversed hall creation index",
  );
  await client`DROP INDEX public.venue_halls_venue_creation_request_uidx`;
  apply("0032 restores canonical hall index");

  await client`ALTER TABLE public.venue_images
    DROP CONSTRAINT venue_images_hall_cannot_be_cover_chk`;
  await client`ALTER TABLE public.venue_images
    ADD CONSTRAINT venue_images_hall_cannot_be_cover_chk CHECK (
      hall_id IS NULL OR NOT is_cover OR is_cover
    )`;
  expectApplyRejected(
    "0032 rejects weaker gallery check",
    "0032 silently accepted a gallery check with an extra OR branch",
  );
  await client`ALTER TABLE public.venue_images
    DROP CONSTRAINT venue_images_hall_cannot_be_cover_chk`;
  apply("0032 restores canonical gallery check");

  await client`DROP INDEX public.venue_images_one_general_cover_per_venue_uidx`;
  await client`CREATE INDEX venue_images_one_general_cover_per_venue_uidx
    ON public.venue_images (venue_id)
    WHERE hall_id IS NULL AND is_cover`;
  expectApplyRejected(
    "0032 rejects wrong gallery index",
    "0032 silently accepted a non-unique gallery cover index",
  );
  await client`DROP INDEX public.venue_images_one_general_cover_per_venue_uidx`;
  apply("0032 restores canonical gallery index");

  console.log("0032 venue onboarding migration verification: PASS");
}

void main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.end({ timeout: 1 });
  });
