/**
 * Real route + PostgreSQL transaction smoke test for booking confirmation.
 *
 * The route handler, confirmation transition, commission/calendar persistence,
 * and outbox insert are production modules. Only Clerk authentication and
 * Next.js `after()` are replaced at their framework boundaries. The booking is
 * committed as `accepted`, the real HTTP handler runs inside an outer database
 * transaction, and a sentinel error rolls that transaction back. Assertions
 * then prove that the status update and outbox insert disappeared together.
 *
 * Run only through scripts/run-guarded-db-test.ts. The test independently
 * re-checks the loopback URL and disposable-database marker before connecting.
 */
/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS loader interception is required to inject the real route's transaction and auth boundary. */
const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const postgres = require("postgres");
const { drizzle } = require("drizzle-orm/postgres-js");
const { and, eq, sql } = require("drizzle-orm");
const {
  e2eDatabaseConfig,
  verifyE2EDatabase,
} = require("../e2e/helpers/safety");

const ROLLBACK = new Error("EXPECTED_BOOKING_API_TRANSACTION_ROLLBACK");
const EFFECT_KEY = "confirm_notify";

async function main() {
  if (process.env.E2E_RUNTIME !== "1") {
    throw new Error(
      "Refusing an unguarded run. Use scripts/run-guarded-db-test.ts with a marked disposable local database.",
    );
  }

  const config = e2eDatabaseConfig();
  if (process.env.DATABASE_URL !== config.url) {
    throw new Error(
      "Refusing split-brain test run: DATABASE_URL must equal E2E_DATABASE_URL.",
    );
  }
  await verifyE2EDatabase(config);

  const parsed = new URL(config.url);
  assert.ok(
    ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname),
    "test database must be loopback-only",
  );

  const client = postgres(config.url, {
    ssl: false,
    prepare: false,
    max: 1,
    connect_timeout: 5,
  });
  const schema = require("../src/lib/db/schema");
  const testDb = drizzle(client, { schema });
  const originalLoad = Module._load;
  const originalFetch = global.fetch;
  const root = path.resolve(__dirname, "..");
  const marker = `booking_api_tx_${randomUUID()}`;
  let clientUserId = "";
  let artistUserId = "";
  let artistId = 0;
  let bookingId = 0;
  let transactionDb;
  let currentClerkId = "";
  const deferred = [];

  try {
    const fixture = await testDb.transaction(async (tx) => {
      const [clientUser] = await tx
        .insert(schema.users)
        .values({
          clerkId: `${marker}_client`,
          email: `${marker}_client@example.invalid`,
          name: "Booking API transaction client",
        })
        .returning({ id: schema.users.id, clerkId: schema.users.clerkId });
      const [artistUser] = await tx
        .insert(schema.users)
        .values({
          clerkId: `${marker}_artist`,
          email: `${marker}_artist@example.invalid`,
          name: "Booking API transaction artist",
        })
        .returning({ id: schema.users.id });
      const [artist] = await tx
        .insert(schema.artists)
        .values({
          userId: artistUser.id,
          nameRo: "Artist API transaction rollback",
          slug: `${marker}-artist`,
          isActive: true,
        })
        .returning({ id: schema.artists.id });
      const [booking] = await tx
        .insert(schema.bookingRequests)
        .values({
          artistId: artist.id,
          clientUserId: clientUser.id,
          clientName: "Client API transaction rollback",
          clientPhone: "+37360000000",
          clientEmail: `${marker}_client@example.invalid`,
          eventType: "wedding",
          eventDate: "2099-10-20",
          guestCount: 50,
          agreedPrice: 500,
          status: "accepted",
          source: "platform",
        })
        .returning({ id: schema.bookingRequests.id });
      return { clientUser, artistUser, artist, booking };
    });

    clientUserId = fixture.clientUser.id;
    artistUserId = fixture.artistUser.id;
    artistId = fixture.artist.id;
    bookingId = fixture.booking.id;
    currentClerkId = fixture.clientUser.clerkId;

    const nextServer = require("next/server");
    global.fetch = async () => {
      throw new Error("Outbound HTTP is disabled in the API transaction test.");
    };
    Module._load = function (request, parent, isMain) {
      if (request === "@clerk/nextjs/server") {
        return { auth: async () => ({ userId: currentClerkId }) };
      }
      if (request === "next/server") {
        return {
          ...nextServer,
          after: (callback) => deferred.push(callback),
        };
      }
      if (request === "next/cache") {
        return { revalidatePath: () => undefined };
      }
      let resolved;
      try {
        resolved = Module._resolveFilename(request, parent);
      } catch {
        // Let the original loader produce the canonical module error.
      }
      if (
        request === "@/lib/db" ||
        resolved === path.join(root, "src/lib/db/index.ts")
      ) {
        return { db: transactionDb };
      }
      return originalLoad.call(this, request, parent, isMain);
    };

    let rollbackObserved = false;
    try {
      await testDb.transaction(async (tx) => {
        transactionDb = tx;
        const bookingRoute = require("../src/app/api/booking-requests/[id]/route");
        const request = () => new nextServer.NextRequest(
            `http://127.0.0.1:3000/api/booking-requests/${bookingId}`,
            {
              method: "PUT",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ action: "client_confirm" }),
            },
          );
        const invokeRoute = () => bookingRoute.PUT(request(), {
          params: Promise.resolve({ id: String(bookingId) }),
        });

        // Force the durable-outbox insert to fail after the status, fee, and
        // calendar writes. The production route's own nested transaction must
        // roll all of them back to its savepoint.
        const ddlSuffix = randomUUID().replaceAll("-", "");
        const triggerName = `qa_reject_booking_outbox_${ddlSuffix}`;
        const functionName = `qa_reject_booking_outbox_${ddlSuffix}`;
        await tx.execute(sql.raw(`
          CREATE FUNCTION "${functionName}"() RETURNS trigger
          LANGUAGE plpgsql AS $$
          BEGIN
            IF NEW.booking_id = ${bookingId} THEN
              RAISE EXCEPTION 'forced_booking_outbox_failure';
            END IF;
            RETURN NEW;
          END
          $$
        `));
        await tx.execute(sql.raw(`
          CREATE TRIGGER "${triggerName}"
          BEFORE INSERT ON booking_effect_outbox
          FOR EACH ROW EXECUTE FUNCTION "${functionName}"()
        `));

        await assert.rejects(invokeRoute, (error) => {
          assert.match(String(error?.cause ?? error), /forced_booking_outbox_failure/);
          return true;
        });

        const [afterFailedInsert] = await tx
          .select({ status: schema.bookingRequests.status })
          .from(schema.bookingRequests)
          .where(eq(schema.bookingRequests.id, bookingId));
        assert.equal(afterFailedInsert.status, "accepted");
        assert.equal(
          (await tx
            .select({ id: schema.bookingEffectOutbox.id })
            .from(schema.bookingEffectOutbox)
            .where(eq(schema.bookingEffectOutbox.bookingId, bookingId))).length,
          0,
        );
        assert.equal(
          (await tx
            .select({ id: schema.commissions.id })
            .from(schema.commissions)
            .where(eq(schema.commissions.bookingRequestId, bookingId))).length,
          0,
        );
        assert.equal(
          (await tx
            .select({ id: schema.calendarEvents.id })
            .from(schema.calendarEvents)
            .where(eq(schema.calendarEvents.bookingId, bookingId))).length,
          0,
        );
        assert.equal(deferred.length, 0);

        await tx.execute(sql.raw(
          `DROP TRIGGER "${triggerName}" ON booking_effect_outbox`,
        ));
        await tx.execute(sql.raw(`DROP FUNCTION "${functionName}"()`));

        const response = await invokeRoute();
        assert.equal(response.status, 200, await response.clone().text());

        const [confirmed] = await tx
          .select({ status: schema.bookingRequests.status })
          .from(schema.bookingRequests)
          .where(eq(schema.bookingRequests.id, bookingId));
        assert.equal(confirmed.status, "confirmed_by_client");

        const effects = await tx
          .select({
            bookingId: schema.bookingEffectOutbox.bookingId,
            effectKey: schema.bookingEffectOutbox.effectKey,
            status: schema.bookingEffectOutbox.status,
          })
          .from(schema.bookingEffectOutbox)
          .where(
            and(
              eq(schema.bookingEffectOutbox.bookingId, bookingId),
              eq(schema.bookingEffectOutbox.effectKey, EFFECT_KEY),
            ),
          );
        assert.deepEqual(effects, [
          { bookingId, effectKey: EFFECT_KEY, status: "pending" },
        ]);
        assert.ok(
          deferred.length >= 1,
          "the route should schedule post-response acceleration only after durable persistence",
        );

        throw ROLLBACK;
      });
    } catch (error) {
      if (error !== ROLLBACK) throw error;
      rollbackObserved = true;
    }
    assert.equal(rollbackObserved, true, "the enclosing transaction must roll back");

    const [afterRollback] = await testDb
      .select({ status: schema.bookingRequests.status })
      .from(schema.bookingRequests)
      .where(eq(schema.bookingRequests.id, bookingId));
    assert.equal(afterRollback.status, "accepted");

    const effectsAfterRollback = await testDb
      .select({ id: schema.bookingEffectOutbox.id })
      .from(schema.bookingEffectOutbox)
      .where(eq(schema.bookingEffectOutbox.bookingId, bookingId));
    assert.equal(effectsAfterRollback.length, 0);

    const commissionsAfterRollback = await testDb
      .select({ id: schema.commissions.id })
      .from(schema.commissions)
      .where(eq(schema.commissions.bookingRequestId, bookingId));
    assert.equal(commissionsAfterRollback.length, 0);

    const calendarAfterRollback = await testDb
      .select({ id: schema.calendarEvents.id })
      .from(schema.calendarEvents)
      .where(eq(schema.calendarEvents.bookingId, bookingId));
    assert.equal(calendarAfterRollback.length, 0);

    console.log(
      "PASS real booking API confirmation and outbox persistence roll back atomically",
    );
  } finally {
    Module._load = originalLoad;
    global.fetch = originalFetch;
    // Defensive cleanup if an assertion interrupted the expected rollback.
    if (bookingId) {
      await client`
        DELETE FROM booking_effect_deliveries
        WHERE effect_id IN (
          SELECT id FROM booking_effect_outbox WHERE booking_id = ${bookingId}
        )
      `;
      await client`DELETE FROM booking_effect_outbox WHERE booking_id = ${bookingId}`;
      await client`DELETE FROM commissions WHERE booking_request_id = ${bookingId}`;
      await client`DELETE FROM calendar_events WHERE booking_id = ${bookingId}`;
      await client`DELETE FROM booking_requests WHERE id = ${bookingId}`;
    }
    if (artistId) await client`DELETE FROM artists WHERE id = ${artistId}`;
    if (clientUserId) await client`DELETE FROM users WHERE id = ${clientUserId}`;
    if (artistUserId) await client`DELETE FROM users WHERE id = ${artistUserId}`;
    await client.end({ timeout: 1 });
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
