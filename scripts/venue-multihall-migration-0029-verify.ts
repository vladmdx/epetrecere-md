/**
 * Verifies migration 0029 (calendar_events.hall_id) on a disposable post-0028
 * local database. Applies 0029 twice, asserts constraint shape, then proves:
 *   - nonexistent hall_id is rejected;
 *   - a hall from another venue is rejected;
 *   - deleting a hall SET NULLs calendar_events.hall_id and keeps the row;
 *   - hall_id is illegal when entity_type is not 'venue'.
 *
 * Does not rewrite historical rows. drizzle-kit generate/push is forbidden.
 * Run: npm run test:multihall:migration0029
 */
import { execFileSync } from "node:child_process";
import postgres from "postgres";
import { e2eDatabaseConfig, verifyE2EDatabase } from "../e2e/helpers/safety";

const config = e2eDatabaseConfig();
process.env.DATABASE_URL = config.url;
process.env.E2E_RUNTIME = "1";
await verifyE2EDatabase(config);

const client = postgres(config.url, { max: 1, prepare: false, ssl: false });
const migration = "src/lib/db/migrations/manual/0029_calendar_hall_booking.sql";
const log = (message: string) => console.log(message);

function apply(label: string) {
  log(`-- ${label}`);
  try {
    const output = execFileSync("npx", ["tsx", "scripts/apply-sql-file.ts", migration], {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: config.url },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (output.trim()) log(output.trim());
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string };
    if (err.stdout) console.error(err.stdout);
    if (err.stderr) console.error(err.stderr);
    throw error;
  }
}

function pgCode(error: unknown): string | undefined {
  const err = error as { code?: string; cause?: { code?: string } };
  return err.code ?? err.cause?.code;
}

async function constraintShape() {
  const rows = await client<{ conname: string; def: string }[]>`
    SELECT c.conname, pg_get_constraintdef(c.oid) AS def
    FROM pg_constraint c
    JOIN pg_class rel ON rel.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = rel.relnamespace
    WHERE n.nspname = 'public'
      AND rel.relname = 'calendar_events'
      AND c.conname IN (
        'calendar_events_booking_fk',
        'calendar_events_hall_venue_fk',
        'calendar_events_hall_requires_venue_entity_chk'
      )
    ORDER BY c.conname
  `;
  return Object.fromEntries(rows.map((row) => [row.conname, row.def]));
}

async function main() {
  const [state] = await client<{ has_orgs: boolean; has_halls: boolean }[]>`
    SELECT
      to_regclass('public.partner_organizations') IS NOT NULL AS has_orgs,
      to_regclass('public.venue_halls') IS NOT NULL AS has_halls
  `;
  if (!state?.has_orgs || !state.has_halls) {
    throw new Error("0029 verification requires a disposable post-0028 baseline.");
  }

  const [unique] = await client<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'venue_halls_id_venue_unique'
    ) AS exists
  `;
  if (!unique?.exists) {
    throw new Error("venue_halls_id_venue_unique is required for calendar_events_hall_venue_fk.");
  }

  apply("0029 first apply");
  const afterFirst = await constraintShape();
  if (!afterFirst.calendar_events_hall_venue_fk) {
    throw new Error("calendar_events_hall_venue_fk missing after first apply");
  }
  if (!afterFirst.calendar_events_hall_requires_venue_entity_chk) {
    throw new Error("calendar_events_hall_requires_venue_entity_chk missing after first apply");
  }
  if (!/SET NULL \(hall_id\)|ON DELETE RESTRICT/i.test(afterFirst.calendar_events_hall_venue_fk)) {
    throw new Error(`unexpected hall FK: ${afterFirst.calendar_events_hall_venue_fk}`);
  }
  if (!/REFERENCES venue_halls/i.test(afterFirst.calendar_events_hall_venue_fk)) {
    throw new Error(`hall FK must reference venue_halls: ${afterFirst.calendar_events_hall_venue_fk}`);
  }

  apply("0029 second apply (idempotent)");
  const afterSecond = await constraintShape();
  if (JSON.stringify(afterFirst) !== JSON.stringify(afterSecond)) {
    throw new Error(
      `0029 drifted on second apply:\n${JSON.stringify(afterFirst)}\n${JSON.stringify(afterSecond)}`,
    );
  }
  log("idempotent: constraint shape unchanged");

  const mark = `m29_${Date.now()}_`;
  const [owner] = await client<{ id: string }[]>`
    INSERT INTO users (clerk_id, email, name)
    VALUES (${mark + "owner"}, ${mark + "owner@example.com"}, 'M29 Owner')
    RETURNING id
  `;
  const [org] = await client<{ id: number }[]>`
    INSERT INTO partner_organizations (display_name, status)
    VALUES (${mark + "org"}, 'active')
    RETURNING id
  `;
  await client`
    INSERT INTO partner_organization_members (organization_id, user_id, role, is_active)
    VALUES (${org.id}, ${owner.id}, 'owner', true)
  `;
  const [venueA] = await client<{ id: number }[]>`
    INSERT INTO venues (user_id, organization_id, name_ro, slug, is_active)
    VALUES (${owner.id}, ${org.id}, ${mark + "A"}, ${mark + "a"}, false)
    RETURNING id
  `;
  const [venueB] = await client<{ id: number }[]>`
    INSERT INTO venues (organization_id, name_ro, slug, is_active)
    VALUES (${org.id}, ${mark + "B"}, ${mark + "b"}, false)
    RETURNING id
  `;
  const [hallA] = await client<{ id: number }[]>`
    INSERT INTO venue_halls (venue_id, slug, name_ro, status)
    VALUES (${venueA.id}, 'grand', 'Grand', 'active')
    RETURNING id
  `;
  const [hallB] = await client<{ id: number }[]>`
    INSERT INTO venue_halls (venue_id, slug, name_ro, status)
    VALUES (${venueB.id}, 'other', 'Other', 'active')
    RETURNING id
  `;
  const [deletable] = await client<{ id: number }[]>`
    INSERT INTO venue_halls (venue_id, slug, name_ro, status)
    VALUES (${venueA.id}, 'temp', 'Temp', 'active')
    RETURNING id
  `;

  try {
    try {
      await client`
        INSERT INTO calendar_events (entity_type, entity_id, date, status, source, hall_id)
        VALUES ('venue', ${venueA.id}, '2027-11-01', 'blocked', 'manual', 2147483646)
      `;
      throw new Error("expected nonexistent hall_id to be rejected");
    } catch (error) {
      if ((error as Error).message.includes("expected nonexistent")) throw error;
      if (pgCode(error) !== "23503") {
        throw new Error(`expected FK 23503 for nonexistent hall, got ${pgCode(error)}: ${error}`);
      }
      log("ok: nonexistent hall_id rejected");
    }

    try {
      await client`
        INSERT INTO calendar_events (entity_type, entity_id, date, status, source, hall_id)
        VALUES ('venue', ${venueA.id}, '2027-11-02', 'blocked', 'manual', ${hallB.id})
      `;
      throw new Error("expected cross-venue hall_id to be rejected");
    } catch (error) {
      if ((error as Error).message.includes("expected cross-venue")) throw error;
      if (pgCode(error) !== "23503") {
        throw new Error(`expected FK 23503 for cross-venue hall, got ${pgCode(error)}: ${error}`);
      }
      log("ok: hall from another venue rejected");
    }

    try {
      await client`
        INSERT INTO calendar_events (entity_type, entity_id, date, status, source, hall_id)
        VALUES ('artist', ${venueA.id}, '2027-11-03', 'blocked', 'manual', ${hallA.id})
      `;
      throw new Error("expected non-venue entity_type with hall_id to be rejected");
    } catch (error) {
      if ((error as Error).message.includes("expected non-venue")) throw error;
      if (pgCode(error) !== "23514") {
        throw new Error(`expected CHECK 23514 for artist+hall_id, got ${pgCode(error)}: ${error}`);
      }
      log("ok: hall_id requires entity_type=venue");
    }

    await client`
      INSERT INTO calendar_events (entity_type, entity_id, date, status, source, hall_id)
      VALUES ('venue', ${venueA.id}, '2027-11-05', 'blocked', 'manual', ${hallA.id})
    `;
    log("ok: same-venue hall_id accepted");

    const [kept] = await client<{ id: number }[]>`
      INSERT INTO calendar_events (entity_type, entity_id, date, status, source, hall_id, note)
      VALUES ('venue', ${venueA.id}, '2027-11-04', 'blocked', 'manual', ${deletable.id}, ${mark + "keep"})
      RETURNING id
    `;
    const [pg] = await client<{ v: number }[]>`SELECT current_setting('server_version_num')::int AS v`;
    if ((pg?.v ?? 0) >= 150000) {
      await client`DELETE FROM venue_halls WHERE id = ${deletable.id}`;
      const [afterDelete] = await client<{ hall_id: number | null; entity_id: number; note: string | null }[]>`
        SELECT hall_id, entity_id, note FROM calendar_events WHERE id = ${kept.id}
      `;
      if (afterDelete.hall_id !== null) {
        throw new Error("hall delete must SET NULL calendar_events.hall_id");
      }
      if (afterDelete.entity_id !== venueA.id) {
        throw new Error("hall delete must not rewrite entity_id");
      }
      if (afterDelete.note !== mark + "keep") {
        throw new Error("hall delete must keep the calendar row");
      }
      log("ok: hall delete SET NULL hall_id and preserves the event");
    } else {
      try {
        await client`DELETE FROM venue_halls WHERE id = ${deletable.id}`;
        throw new Error("expected PG<15 hall delete to RESTRICT");
      } catch (error) {
        if ((error as Error).message.includes("expected PG<15")) throw error;
        if (pgCode(error) !== "23503") {
          throw new Error(`expected RESTRICT 23503 on PG<15, got ${pgCode(error)}: ${error}`);
        }
        log("ok: PG<15 hall delete RESTRICT (archive instead of hard delete)");
      }
    }
    log("0029 verification PASS");
  } finally {
    await client`DELETE FROM calendar_events WHERE entity_id IN (${venueA.id}, ${venueB.id})`;
    await client`DELETE FROM venue_halls WHERE venue_id IN (${venueA.id}, ${venueB.id})`;
    await client`DELETE FROM venues WHERE id IN (${venueA.id}, ${venueB.id})`;
    await client`DELETE FROM partner_organization_members WHERE organization_id = ${org.id}`;
    await client`DELETE FROM partner_organizations WHERE id = ${org.id}`;
    await client`DELETE FROM users WHERE id = ${owner.id}`;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.end({ timeout: 1 });
  });
