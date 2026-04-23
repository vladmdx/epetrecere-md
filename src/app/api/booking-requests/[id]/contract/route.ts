// Contract flow:
//   GET    /api/booking-requests/[id]/contract  → stream the PDF (existing or regenerated)
//   POST   /api/booking-requests/[id]/contract  → sign: save typed signature +
//                                                 generate PDF + upload to Blob +
//                                                 persist clientSignature/At/contractPdfUrl
//
// Auth: only the booking's client (by clientUserId OR clientEmail) can sign.
// Both parties can GET the PDF if already signed.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  users,
  venues,
  artists,
  bookingRequests,
} from "@/lib/db/schema";
import { generateContractPdf } from "@/lib/contract/generate-pdf";

const signSchema = z.object({
  signature: z.string().min(2).max(100),
});

async function loadBookingFull(id: number) {
  const [row] = await db
    .select({
      booking: bookingRequests,
      artistName: artists.nameRo,
      artistPhone: artists.phone,
      artistEmail: artists.email,
      venueName: venues.nameRo,
      venuePhone: venues.phone,
      venueEmail: venues.email,
    })
    .from(bookingRequests)
    .leftJoin(artists, eq(artists.id, bookingRequests.artistId))
    .leftJoin(venues, eq(venues.id, bookingRequests.venueId))
    .where(eq(bookingRequests.id, id))
    .limit(1);
  return row ?? null;
}

async function checkViewAccess(
  bookingRow: NonNullable<Awaited<ReturnType<typeof loadBookingFull>>>,
) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return { ok: false as const };
  const [u] = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);
  if (!u) return { ok: false as const };

  const b = bookingRow.booking;
  // Client can view their own booking
  if (b.clientUserId === u.id) return { ok: true as const, user: u };
  if (u.email && b.clientEmail === u.email)
    return { ok: true as const, user: u };

  // Vendor side: artist/venue owner
  if (b.artistId) {
    const [a] = await db
      .select({ userId: artists.userId })
      .from(artists)
      .where(eq(artists.id, b.artistId))
      .limit(1);
    if (a?.userId === u.id) return { ok: true as const, user: u };
  }
  if (b.venueId) {
    const [v] = await db
      .select({ userId: venues.userId })
      .from(venues)
      .where(eq(venues.id, b.venueId))
      .limit(1);
    if (v?.userId === u.id) return { ok: true as const, user: u };
  }
  return { ok: false as const };
}

// ─── GET ──────────────────────────────────────────────────
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const bookingId = Number(id);
  if (!Number.isFinite(bookingId)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }
  const row = await loadBookingFull(bookingId);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const access = await checkViewAccess(row);
  if (!access.ok)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const b = row.booking;
  const vendorKind: "artist" | "sala" = b.artistId ? "artist" : "sala";
  const vendorName = b.artistId
    ? row.artistName ?? "Artist"
    : row.venueName ?? "Sală";
  const vendorPhone = b.artistId ? row.artistPhone : row.venuePhone;
  const vendorEmail = b.artistId ? row.artistEmail : row.venueEmail;

  const pdf = await generateContractPdf({
    bookingId: b.id,
    clientName: b.clientName,
    clientPhone: b.clientPhone,
    clientEmail: b.clientEmail,
    clientSignature: b.clientSignature,
    clientSignedAt: b.clientSignedAt,
    vendorName,
    vendorKind,
    vendorEmail,
    vendorPhone,
    eventDate: b.eventDate,
    eventType: b.eventType,
    startTime: b.startTime,
    endTime: b.endTime,
    guestCount: b.guestCount,
    agreedPrice: b.agreedPrice,
    message: b.message,
  });

  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="contract-${b.id}.pdf"`,
      "Cache-Control": "private, no-cache",
    },
  });
}

// ─── POST: sign ────────────────────────────────────────────
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const bookingId = Number(id);
  if (!Number.isFinite(bookingId)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const parsed = signSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Signature required (min 2 chars)" },
      { status: 400 },
    );
  }

  const row = await loadBookingFull(bookingId);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Only the client can sign — not vendors or admins.
  const { userId: clerkId } = await auth();
  if (!clerkId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [u] = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const b = row.booking;
  const isClient =
    b.clientUserId === u.id || (u.email && b.clientEmail === u.email);
  if (!isClient) {
    return NextResponse.json(
      { error: "Doar clientul rezervarii poate semna contractul" },
      { status: 403 },
    );
  }

  // Booking must be at least "accepted" (artist/venue said yes) to have
  // terms worth signing.
  if (!["accepted", "confirmed_by_client"].includes(b.status)) {
    return NextResponse.json(
      {
        error:
          "Contractul poate fi semnat doar dupa ce furnizorul a acceptat rezervarea",
      },
      { status: 400 },
    );
  }

  if (b.clientSignedAt) {
    return NextResponse.json(
      { error: "Contractul este deja semnat", contractPdfUrl: b.contractPdfUrl },
      { status: 409 },
    );
  }

  const signedAt = new Date();

  // Generate PDF with the fresh signature
  const vendorKind: "artist" | "sala" = b.artistId ? "artist" : "sala";
  const vendorName = b.artistId
    ? row.artistName ?? "Artist"
    : row.venueName ?? "Sală";
  const vendorPhone = b.artistId ? row.artistPhone : row.venuePhone;
  const vendorEmail = b.artistId ? row.artistEmail : row.venueEmail;

  const pdfBytes = await generateContractPdf({
    bookingId: b.id,
    clientName: b.clientName,
    clientPhone: b.clientPhone,
    clientEmail: b.clientEmail,
    clientSignature: parsed.data.signature,
    clientSignedAt: signedAt,
    vendorName,
    vendorKind,
    vendorEmail,
    vendorPhone,
    eventDate: b.eventDate,
    eventType: b.eventType,
    startTime: b.startTime,
    endTime: b.endTime,
    guestCount: b.guestCount,
    agreedPrice: b.agreedPrice,
    message: b.message,
  });

  // Upload to Vercel Blob if configured, else skip persistence (the GET
  // endpoint can always regenerate on demand).
  let pdfUrl: string | null = null;
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      const { put } = await import("@vercel/blob");
      const filename = `contracts/contract-${b.id}-${Date.now()}.pdf`;
      const blob = await put(filename, new Blob([new Uint8Array(pdfBytes)]), {
        access: "public",
        contentType: "application/pdf",
      });
      pdfUrl = blob.url;
    } catch (err) {
      console.error("[contract] upload failed", err);
    }
  }

  await db
    .update(bookingRequests)
    .set({
      clientSignature: parsed.data.signature,
      clientSignedAt: signedAt,
      contractPdfUrl: pdfUrl,
      updatedAt: new Date(),
    })
    .where(eq(bookingRequests.id, bookingId));

  return NextResponse.json({
    success: true,
    contractPdfUrl: pdfUrl,
    // Always also return the dynamic URL so the UI can display regardless
    dynamicUrl: `/api/booking-requests/${bookingId}/contract`,
  });
}
