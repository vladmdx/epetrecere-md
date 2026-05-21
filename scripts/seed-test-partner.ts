// Seed a temporary test artist for the current user so we can preview
// the redesigned partner dashboard end-to-end. Idempotent on slug.
// Inserts:
//   - 1 artist row tied to the user (premium, photo, full profile)
//   - 3 booking_requests in varied states (pending, accepted, confirmed)
//     dated in the next 1–3 months so they appear as "Următorul eveniment"
//     / "Cereri recente"
//   - 1 conversation with 1 unread artist message for the inbox tile
//
// Usage:  npx tsx scripts/seed-test-partner.ts <email>
// Cleanup: npx tsx scripts/seed-test-partner.ts <email> --clean

import "dotenv/config";
import { db } from "@/lib/db";
import {
  artists,
  bookingRequests,
  chatMessages,
  conversations,
  users,
} from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";

const SLUG = "test-partner-dashboard";

async function main() {
  const email = process.argv[2];
  const clean = process.argv.includes("--clean");
  if (!email) {
    console.error("Usage: tsx scripts/seed-test-partner.ts <email> [--clean]");
    process.exit(1);
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (!user) throw new Error(`No user with email ${email}`);

  if (clean) {
    const [existing] = await db
      .select({ id: artists.id })
      .from(artists)
      .where(eq(artists.slug, SLUG))
      .limit(1);
    if (existing) {
      // cascade deletes booking_requests + conversations + chat_messages
      await db.delete(artists).where(eq(artists.id, existing.id));
      console.log(`[clean] deleted artist ${existing.id}`);
    }
    if (user.role === "artist") {
      await db.update(users).set({ role: "user" }).where(eq(users.id, user.id));
      console.log(`[clean] reset role on ${user.email} → user`);
    }
    return;
  }

  // Promote user to artist if needed so the /dashboard route doesn't
  // bounce them to /cabinet on the redirect check.
  if (user.role !== "artist") {
    await db.update(users).set({ role: "artist" }).where(eq(users.id, user.id));
    console.log(`[role] promoted ${user.email} → artist`);
  }

  // Upsert the artist row.
  const [existing] = await db
    .select({ id: artists.id })
    .from(artists)
    .where(eq(artists.slug, SLUG))
    .limit(1);

  let artistId: number;
  if (existing) {
    await db
      .update(artists)
      .set({ userId: user.id })
      .where(eq(artists.id, existing.id));
    artistId = existing.id;
    console.log(`[artist] reused ${artistId}`);
  } else {
    const [created] = await db
      .insert(artists)
      .values({
        userId: user.id,
        nameRo: "Royal Bloom Events",
        nameRu: "Royal Bloom Events",
        nameEn: "Royal Bloom Events",
        slug: SLUG,
        descriptionRo:
          "Agenție de organizare evenimente premium. Specializare în nunți, botezuri și aniversări.",
        categoryIds: [1],
        priceFrom: 800,
        priceCurrency: "EUR",
        location: "Chișinău",
        phone: "+37360000000",
        email: user.email,
        instagram: "royalbloomevents",
        facebook: "royalbloomevents",
        isPremium: true,
        isActive: true,
        isVerified: true,
        photoUrl: "/images/backgrounds/party-dance.jpg",
      })
      .returning({ id: artists.id });
    artistId = created.id;
    console.log(`[artist] created ${artistId}`);
  }

  // Wipe any previous test bookings so we don't accumulate noise.
  await db.delete(bookingRequests).where(eq(bookingRequests.artistId, artistId));

  // Pre-pick three future dates so "Următorul eveniment" picks the
  // earliest accepted one and recent-requests list has variety.
  const today = new Date();
  const inDays = (n: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  };

  await db.insert(bookingRequests).values([
    {
      artistId,
      clientUserId: user.id,
      clientName: "Andreea Popescu",
      clientPhone: "+37368111222",
      clientEmail: "andreea@test.md",
      eventDate: inDays(12),
      startTime: "17:00",
      endTime: "23:00",
      eventType: "wedding",
      guestCount: 150,
      message: "Bună! Avem nunta pe 24 mai, ne-ar plăcea să discutăm.",
      status: "accepted",
      agreedPrice: 1200,
    },
    {
      artistId,
      clientUserId: user.id,
      clientName: "Ioana & Vlad",
      clientPhone: "+37369123456",
      eventDate: inDays(25),
      eventType: "wedding",
      guestCount: 120,
      status: "pending",
    },
    {
      artistId,
      clientUserId: user.id,
      clientName: "Matei Cojocaru",
      clientPhone: "+37367445566",
      eventDate: inDays(40),
      eventType: "baptism",
      guestCount: 40,
      status: "accepted",
    },
    {
      artistId,
      clientUserId: user.id,
      clientName: "Diana & Radu",
      clientPhone: "+37360778899",
      eventDate: inDays(-5),
      eventType: "wedding",
      guestCount: 150,
      status: "confirmed_by_client",
      agreedPrice: 1500,
    },
  ]);
  console.log("[bookings] inserted 4 test bookings");

  // Wire up one conversation with an unread artist-side message so the
  // "Mesaje noi" tile lights up.
  await db
    .delete(conversations)
    .where(and(eq(conversations.artistId, artistId), eq(conversations.clientUserId, user.id)));
  const [conv] = await db
    .insert(conversations)
    .values({
      artistId,
      clientUserId: user.id,
      lastMessagePreview: "Vă mai gândiți la oferta noastră?",
      lastMessageAt: new Date(),
      artistUnread: 1,
    })
    .returning({ id: conversations.id });
  await db.insert(chatMessages).values({
    conversationId: conv.id,
    senderType: "client",
    senderName: "Andreea Popescu",
    message: "Vă mai gândiți la oferta noastră?",
    isRead: false,
  });
  console.log(`[conv] created ${conv.id} with 1 unread`);

  console.log(`✓ Test partner ready. Visit /dashboard while logged in as ${email}.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
