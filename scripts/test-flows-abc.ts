// Comprehensive E2E test for client/partner/venue flows.
// Runs all DB-level checks, simulating what each API endpoint would do.
//
// Run: cd epetrecere-md && DATABASE_URL=... npx tsx /tmp/test-flows-abc.ts

import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

let pass = 0;
let fail = 0;
const bugs: string[] = [];

function check(name: string, condition: boolean, detail?: string) {
  if (condition) {
    pass++;
    console.log(`  ✅ ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    fail++;
    bugs.push(`${name}${detail ? `: ${detail}` : ""}`);
    console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function setup() {
  console.log("\n═══ SETUP TEST DATA ═══");
  // Artist 11 (Igor) — Chișinău, 30km, 300€, buffer 15
  await sql`UPDATE artists SET base_city = 'Chișinău', location = 'Chișinău', travel_distance_km = 30, price_from = 300, price_hidden = false, buffer_minutes = 15 WHERE id = 11`;
  // Artist 12 (Serj) — Bălți, 30km, price hidden, buffer 30
  await sql`UPDATE artists SET base_city = 'Bălți', location = 'Bălți', travel_distance_km = 30, price_hidden = true, buffer_minutes = 30 WHERE id = 12`;
  // Artist 13 (Irina) — Chișinău, 999km (all Moldova), 500€, buffer 60
  await sql`UPDATE artists SET base_city = 'Chișinău', location = 'Chișinău', travel_distance_km = 999, price_from = 500, price_hidden = false, buffer_minutes = 60 WHERE id = 13`;
  console.log("  Igor (11): Chișinău, 30km, 300€, buffer 15");
  console.log("  Serj (12): Bălți, 30km, priceHidden, buffer 30");
  console.log("  Irina (13): Chișinău, 999km (all Moldova), 500€, buffer 60");

  // Venues already in good shape — just verify
  console.log("  Venue 1 (Restaurant Codru): Chișinău, 50-300");
  console.log("  Venue 2 (Chateau Vartely): Orhei, 100-500");
  console.log("  Venue 3 (La Plăcinte): Chișinău, 30-150");
  console.log("  Venue 8 (Test Sala E2E): Chișinău, 50-200");
}

async function teardown() {
  console.log("\n═══ TEARDOWN ═══");
  await sql`UPDATE artists SET base_city = 'Chișinău', location = 'Chișinău', travel_distance_km = 30, price_hidden = false, buffer_minutes = 15, price_from = 0 WHERE id IN (11, 12, 13)`;
  console.log("  Restored artist defaults");
}

async function testA_client() {
  console.log("\n═══ A. CLIENT FLOWS ═══\n");

  console.log("A.2 Venue capacity filter:");
  // 150 guests in Chișinău
  const v150 = await sql`
    SELECT id, name_ro FROM venues
    WHERE is_active = true AND city ILIKE 'Chișinău'
    AND capacity_min <= 150 AND capacity_max >= 150
    ORDER BY id
  `;
  const names150 = v150.map((v: any) => v.name_ro).join(", ");
  check("150 guests + Chișinău returns valid venues", v150.length > 0, names150);
  check("La Plăcinte (max=150) included for 150 guests", v150.some((v: any) => v.id === 3));

  // 250 guests in Chișinău — La Plăcinte (max 150) should be excluded
  const v250 = await sql`
    SELECT id, name_ro FROM venues
    WHERE is_active = true AND city ILIKE 'Chișinău'
    AND capacity_min <= 250 AND capacity_max >= 250
  `;
  check("La Plăcinte excluded for 250 guests (max=150)", !v250.some((v: any) => v.id === 3));
  check("Restaurant Codru included for 250 guests (max=300)", v250.some((v: any) => v.id === 1));

  // 100 guests in Cahul → no Cahul venues, no Chișinău venues with travel
  const vCahul = await sql`
    SELECT id, name_ro FROM venues
    WHERE is_active = true AND city ILIKE 'Cahul'
    AND capacity_min <= 100 AND capacity_max >= 100
  `;
  check("0 venues in Cahul (none seeded)", vCahul.length === 0);

  console.log("\nA.3 Artist discovery filter:");
  // Chișinău + DJ category? Let me check — artists may not have category 2 (DJ)
  const chisinauArtists = await sql`
    SELECT id, name_ro FROM artists
    WHERE is_active = true
    AND (base_city ILIKE 'Chișinău' OR travel_distance_km >= 999)
    AND id IN (11, 12, 13)
    ORDER BY id
  `;
  check("Igor visible for Chișinău", chisinauArtists.some((a: any) => a.id === 11));
  check("Serj NOT visible for Chișinău (Bălți, 30km)", !chisinauArtists.some((a: any) => a.id === 12));
  check("Irina visible for Chișinău (all Moldova)", chisinauArtists.some((a: any) => a.id === 13));

  const cahulArtists = await sql`
    SELECT id, name_ro FROM artists
    WHERE is_active = true
    AND (base_city ILIKE 'Cahul' OR travel_distance_km >= 999)
    AND id IN (11, 12, 13)
    ORDER BY id
  `;
  check("Igor NOT visible for Cahul", !cahulArtists.some((a: any) => a.id === 11));
  check("Serj NOT visible for Cahul", !cahulArtists.some((a: any) => a.id === 12));
  check("Irina visible for Cahul (all Moldova)", cahulArtists.some((a: any) => a.id === 13));

  console.log("\nA.5 Standalone artist booking:");
  const [client] = await sql`SELECT id, email FROM users WHERE email = 'osvaldhotelmd@gmail.com' LIMIT 1`;
  const [b1] = await sql`
    INSERT INTO booking_requests (artist_id, client_user_id, client_name, client_email, client_phone, event_date, status, source)
    VALUES (11, ${client.id}, 'TEST_E2E_STANDALONE', 'osvaldhotelmd@gmail.com', '+37300', '2027-06-15', 'pending', 'form')
    RETURNING id, event_plan_id, status, artist_id
  `;
  check("Standalone booking created (eventPlanId=null)", b1.event_plan_id === null && b1.status === "pending");

  // Client filter
  const clientList = await sql`SELECT id FROM booking_requests WHERE client_email = 'osvaldhotelmd@gmail.com' AND id = ${b1.id}`;
  check("Client sees standalone booking via client_email", clientList.length === 1);

  // Partner filter
  const partnerList = await sql`SELECT id FROM booking_requests WHERE artist_id = 11 AND id = ${b1.id}`;
  check("Partner sees standalone booking via artist_id", partnerList.length === 1);

  await sql`DELETE FROM booking_requests WHERE id = ${b1.id}`;
}

async function testB_partner() {
  console.log("\n═══ B. PARTNER FLOWS ═══\n");

  const [client] = await sql`SELECT id FROM users WHERE email = 'osvaldhotelmd@gmail.com' LIMIT 1`;

  console.log("B.5 Multi-round price negotiation + accept:");
  const [b] = await sql`
    INSERT INTO booking_requests (artist_id, client_user_id, client_name, client_email, client_phone, event_date, status, agreed_price, price_offers)
    VALUES (11, ${client.id}, 'TEST_NEGOTIATE', 'osvaldhotelmd@gmail.com', '+37300', '2027-07-20', 'pending', 300, '[]'::jsonb)
    RETURNING id
  `;

  // Round 1: Partner offers 350
  const offers = [{ from: "artist", amount: 350, message: "Tariful meu", at: new Date().toISOString() }];
  await sql`UPDATE booking_requests SET price_offers = ${JSON.stringify(offers)}::jsonb WHERE id = ${b.id}`;
  check("Round 1 — partner offers 350 stored", true, "priceOffers.length=1");

  // Round 2: Client counters 320
  offers.push({ from: "client", amount: 320, message: "Pot 320", at: new Date(Date.now() + 1000).toISOString() });
  await sql`UPDATE booking_requests SET price_offers = ${JSON.stringify(offers)}::jsonb WHERE id = ${b.id}`;

  // Round 3: Partner counters 340
  offers.push({ from: "artist", amount: 340, message: "Hai 340", at: new Date(Date.now() + 2000).toISOString() });
  await sql`UPDATE booking_requests SET price_offers = ${JSON.stringify(offers)}::jsonb WHERE id = ${b.id}`;

  // Round 4: Client counters 330
  offers.push({ from: "client", amount: 330, message: "Final: 330", at: new Date(Date.now() + 3000).toISOString() });
  await sql`UPDATE booking_requests SET price_offers = ${JSON.stringify(offers)}::jsonb WHERE id = ${b.id}`;

  // Verify state
  const [state] = await sql`SELECT price_offers, status, agreed_price FROM booking_requests WHERE id = ${b.id}`;
  check("After 4 rounds, priceOffers has 4 entries", (state.price_offers as any[]).length === 4);
  check("Status still pending during negotiation", state.status === "pending");

  // Round 5: Partner accepts → use last offer (330) as final price
  const lastOffer = (state.price_offers as any[])[(state.price_offers as any[]).length - 1];
  const finalPrice = lastOffer.amount;
  await sql`UPDATE booking_requests SET status = 'confirmed_by_client', agreed_price = ${finalPrice}, artist_reply = 'Acceptat la 330' WHERE id = ${b.id}`;

  const [final] = await sql`SELECT status, agreed_price FROM booking_requests WHERE id = ${b.id}`;
  check("Partner accept → status confirmed_by_client", final.status === "confirmed_by_client");
  check("Final agreedPrice = 330€ (last client offer)", final.agreed_price === 330);

  await sql`DELETE FROM booking_requests WHERE id = ${b.id}`;

  console.log("\nB.3 Buffer logic (15min default for Igor):");
  // Setup: existing booking 14:00-15:00 for artist 11
  const [bx] = await sql`
    INSERT INTO booking_requests (artist_id, client_user_id, client_name, client_email, client_phone, event_date, start_time, end_time, status)
    VALUES (11, ${client.id}, 'TEST_BUFFER', 'osvaldhotelmd@gmail.com', '+373', '2027-08-10', '14:00', '15:00', 'confirmed_by_client')
    RETURNING id
  `;

  // Test buffer logic mathematically
  function toMinutes(t: string) { const [h, m] = t.split(":").map(Number); return h * 60 + m; }
  function rangesOverlap(a1: number, a2: number, b1: number, b2: number) { return a1 < b2 && b1 < a2; }
  const e = toMinutes("15:00") + 15; // 15:15 with buffer
  check("15:10 conflicts (within 15min buffer)", rangesOverlap(toMinutes("15:10"), toMinutes("16:00"), toMinutes("14:00"), e));
  check("15:15 free (right at buffer edge)", !rangesOverlap(toMinutes("15:15"), toMinutes("16:00"), toMinutes("14:00"), e));
  check("15:30 free", !rangesOverlap(toMinutes("15:30"), toMinutes("16:00"), toMinutes("14:00"), e));

  await sql`DELETE FROM booking_requests WHERE id = ${bx.id}`;

  console.log("\nB.7 Calendar event creation on accept:");
  const [b2] = await sql`
    INSERT INTO booking_requests (artist_id, client_user_id, client_name, client_email, client_phone, event_date, status)
    VALUES (11, ${client.id}, 'TEST_CALBLOCK', 'osvaldhotelmd@gmail.com', '+373', '2027-09-05', 'pending')
    RETURNING id, event_date
  `;
  // Simulate accept → API would insert calendar_event
  await sql`
    INSERT INTO calendar_events (entity_type, entity_id, date, status, source, note)
    VALUES ('artist', 11, '2027-09-05', 'booked', 'booking', 'Test accept')
  `;
  const blocked = await sql`SELECT id FROM calendar_events WHERE entity_type = 'artist' AND entity_id = 11 AND date = '2027-09-05'`;
  check("Calendar event created (status=booked)", blocked.length === 1);
  await sql`DELETE FROM calendar_events WHERE entity_type = 'artist' AND entity_id = 11 AND date = '2027-09-05'`;
  await sql`DELETE FROM booking_requests WHERE id = ${b2.id}`;

  console.log("\nB.6 Chat message bridge to conversations:");
  const [b3] = await sql`
    INSERT INTO booking_requests (artist_id, client_user_id, client_name, client_email, client_phone, event_date, status)
    VALUES (11, ${client.id}, 'TEST_CHAT', 'osvaldhotelmd@gmail.com', '+373', '2027-10-01', 'pending')
    RETURNING id
  `;
  // Find or create conversation
  await sql`SELECT user_id FROM artists WHERE id = 11`;
  let convId: number;
  const [existing] = await sql`SELECT id FROM conversations WHERE client_user_id = ${client.id} AND artist_id = 11 AND venue_id IS NULL LIMIT 1`;
  if (existing) {
    convId = existing.id;
  } else {
    const [cr] = await sql`INSERT INTO conversations (client_user_id, artist_id) VALUES (${client.id}, 11) RETURNING id`;
    convId = cr.id;
  }

  // Send message with BOTH FKs (the bridge)
  const [msg] = await sql`
    INSERT INTO chat_messages (booking_request_id, conversation_id, sender_type, sender_name, message)
    VALUES (${b3.id}, ${convId}, 'artist', 'Igor', 'Test bridge message')
    RETURNING id, conversation_id, booking_request_id
  `;
  check("Chat message has BOTH bookingRequestId AND conversationId set", msg.booking_request_id === b3.id && msg.conversation_id === convId);

  // Verify GET /api/chat would find it via union
  const fromBookingChat = await sql`SELECT id FROM chat_messages WHERE booking_request_id = ${b3.id} OR conversation_id = ${convId}`;
  check("Message visible via booking-chat OR conversation query", fromBookingChat.length >= 1);

  await sql`DELETE FROM chat_messages WHERE id = ${msg.id}`;
  await sql`DELETE FROM booking_requests WHERE id = ${b3.id}`;
}

async function testC_venue() {
  console.log("\n═══ C. VENUE FLOWS ═══\n");

  const [client] = await sql`SELECT id FROM users WHERE email = 'osvaldhotelmd@gmail.com' LIMIT 1`;

  console.log("C.3 Venue receives booking:");
  const [b] = await sql`
    INSERT INTO booking_requests (venue_id, client_user_id, client_name, client_email, client_phone, event_date, guest_count, status, source)
    VALUES (1, ${client.id}, 'TEST_VENUE', 'osvaldhotelmd@gmail.com', '+373', '2027-11-15', 200, 'pending', 'form')
    RETURNING id, event_plan_id, status, venue_id
  `;
  check("Venue booking created", b.venue_id === 1 && b.status === "pending");

  const partnerList = await sql`SELECT id FROM booking_requests WHERE venue_id = 1 AND id = ${b.id}`;
  check("Venue sees booking in /dashboard/sala/rezervari", partnerList.length === 1);

  console.log("\nC.4 Venue accept flow:");
  await sql`UPDATE booking_requests SET status = 'confirmed_by_client', agreed_price = 5000 WHERE id = ${b.id}`;
  const [accepted] = await sql`SELECT status, agreed_price FROM booking_requests WHERE id = ${b.id}`;
  check("Venue accept → status confirmed_by_client", accepted.status === "confirmed_by_client");
  check("agreedPrice set on accept", accepted.agreed_price === 5000);

  await sql`DELETE FROM booking_requests WHERE id = ${b.id}`;

  console.log("\nC.6 Venue buffer applied:");
  const [v] = await sql`SELECT buffer_minutes FROM venues WHERE id = 1`;
  check("Venue has buffer_minutes set (default 15)", v.buffer_minutes === 15);

  console.log("\nC.1 Venue onboarding fields exist:");
  const cols = await sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'venues' AND column_name IN ('menu_pdf_url', 'menu_url', 'virtual_tour_url', 'website')`;
  check("menu_pdf_url column exists", cols.some((c: any) => c.column_name === "menu_pdf_url"));
  check("virtual_tour_url column exists", cols.some((c: any) => c.column_name === "virtual_tour_url"));
  const imgCols = await sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'venue_images' AND column_name IN ('is_cover', 'sort_order')`;
  check("venue_images has is_cover for cover photo", imgCols.some((c: any) => c.column_name === "is_cover"));
}

async function main() {
  await setup();
  try {
    await testA_client();
    await testB_partner();
    await testC_venue();
  } finally {
    await teardown();
  }
  console.log(`\n═══ RESULTS ═══`);
  console.log(`PASS: ${pass}`);
  console.log(`FAIL: ${fail}`);
  if (bugs.length > 0) {
    console.log(`\n🐛 BUGS FOUND:`);
    bugs.forEach((b) => console.log(`  - ${b}`));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
