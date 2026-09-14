// Contract flow:
//   GET    /api/booking-requests/[id]/contract  → stream the exact retained PDF
//   POST   /api/booking-requests/[id]/contract  → sign: save typed signature +
//                                                 generate PDF + upload to Blob +
//                                                 persist clientSignature/At/contractPdfUrl
//
// Auth: only the booking's client (by clientUserId OR clientEmail) can sign.
// Both parties can GET the PDF if already signed.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { auth } from "@clerk/nextjs/server";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { requireVenueCapability } from "@/lib/venue-access";
import {
  users,
  venues,
  artists,
  bookingRequests,
} from "@/lib/db/schema";
import { generateContractPdf } from "@/lib/contract/generate-pdf";
import {
  bookingContractLocale,
  bookingContractSignatureIsValid,
  type BookingContractLocale,
} from "@/lib/contract/copy";
import {
  enqueueRegisteredBlobCleanup,
  readRegisteredPrivateBlob,
  retainRegisteredBlobAsset,
  storeRegisteredBlob,
} from "@/lib/privacy/account-asset-erasure";
import {
  bookingContractBasis,
  bookingContractClientMatches,
  bookingContractCommitDecision,
  type BookingContractBasis,
} from "@/lib/booking/contract-data";
import {
  createServerLogCorrelationId,
  safeServerErrorLog,
} from "@/lib/safe-server-log";

const signSchema = z.object({
  signature: z
    .string()
    .trim()
    .min(2)
    .max(100)
    .refine(bookingContractSignatureIsValid, {
      message: "Signature must contain at least two letters",
    }),
  locale: z.enum(["ro", "ru", "en"]).default("ro"),
});

type Executor = typeof db;

async function loadBookingFull(
  id: number,
  executor: Executor = db,
) {
  const [booking] = await executor
    .select()
    .from(bookingRequests)
    .where(eq(bookingRequests.id, id))
    .limit(1);
  if (!booking) return null;

  const artistQuery = booking.artistId
    ? executor
        .select({ phone: artists.phone, email: artists.email })
        .from(artists)
        .where(eq(artists.id, booking.artistId))
    : null;
  const [artist] = artistQuery
    ? await artistQuery.limit(1)
    : [];
  const venueQuery = booking.venueId
    ? executor
        .select({ phone: venues.phone, email: venues.email })
        .from(venues)
        .where(eq(venues.id, booking.venueId))
    : null;
  const [venue] = venueQuery
    ? await venueQuery.limit(1)
    : [];
  return {
    booking,
    vendorPhone: booking.artistId ? artist?.phone ?? null : venue?.phone ?? null,
    vendorEmail: booking.artistId ? artist?.email ?? null : venue?.email ?? null,
  };
}

/**
 * Vendor DELETE takes the parent row lock before PostgreSQL applies the
 * booking FK SET NULL action. Signing must use the same vendor -> booking
 * order; taking a vendor lock after booking would deadlock with that action.
 */
async function lockPreparedBookingVendor(
  booking: Pick<typeof bookingRequests.$inferSelect, "artistId" | "venueId">,
  executor: Executor,
) {
  if (booking.artistId != null) {
    const [artist] = await executor
      .select({ phone: artists.phone, email: artists.email })
      .from(artists)
      .where(eq(artists.id, booking.artistId))
      .for("share")
      .limit(1);
    return {
      vendorPhone: artist?.phone ?? null,
      vendorEmail: artist?.email ?? null,
    };
  }
  if (booking.venueId != null) {
    const [venue] = await executor
      .select({ phone: venues.phone, email: venues.email })
      .from(venues)
      .where(eq(venues.id, booking.venueId))
      .for("share")
      .limit(1);
    return {
      vendorPhone: venue?.phone ?? null,
      vendorEmail: venue?.email ?? null,
    };
  }
  return { vendorPhone: null, vendorEmail: null };
}

async function lockBookingForContractCommit(id: number, executor: Executor) {
  const [booking] = await executor
    .select()
    .from(bookingRequests)
    .where(eq(bookingRequests.id, id))
    .for("update")
    .limit(1);
  return booking ?? null;
}

function pdfData(
  basis: BookingContractBasis,
  clientSignature: string | null,
  clientSignedAt: Date | null,
  generationDate: Date,
  locale: BookingContractLocale,
) {
  const {
    clientUserId: _clientUserId,
    vendorArtistId: _vendorArtistId,
    vendorVenueId: _vendorVenueId,
    ...data
  } = basis;
  return { ...data, clientSignature, clientSignedAt, generationDate, locale };
}

function contractTemporarilyUnavailable() {
  return NextResponse.json(
    {
      error: "contract_pdf_repair_required",
      code: "CONTRACT_PDF_REPAIR_REQUIRED",
      retryable: true,
    },
    {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

async function cleanupUnusedPdf(pdfUrl: string | null): Promise<void> {
  if (!pdfUrl) return;
  const queued = await enqueueRegisteredBlobCleanup(pdfUrl).catch(() => false);
  if (!queued) {
    console.error("[contract] unused registered PDF cleanup was not queued");
  }
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
  if (bookingContractClientMatches(b, u)) {
    return { ok: true as const, user: u };
  }

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
    const access = await requireVenueCapability(b.venueId, "manage_financials");
    if (access.ok) return { ok: true as const, user: u };
  }
  return { ok: false as const };
}

// ─── GET ──────────────────────────────────────────────────
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const bookingId = Number(id);
  if (!Number.isSafeInteger(bookingId) || bookingId <= 0) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }
  const row = await loadBookingFull(bookingId);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const access = await checkViewAccess(row);
  if (!access.ok)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const b = row.booking;
  if (!b.clientSignedAt && !["confirmed_by_client", "completed"].includes(b.status)) {
    return NextResponse.json({ error: "booking_confirmation_required" }, { status: 403 });
  }
  const basis = bookingContractBasis(b, row);

  let pdf: Uint8Array;
  if (b.clientSignedAt) {
    // A signed document is immutable evidence. Never substitute a render from
    // mutable live rows when the exact retained private object needs repair.
    if (!b.contractPdfUrl) return contractTemporarilyUnavailable();
    const storedPdf = await readRegisteredPrivateBlob({
      url: b.contractPdfUrl,
      provenance: "legal_contract",
      contentType: "application/pdf",
    });
    if (!storedPdf) return contractTemporarilyUnavailable();
    pdf = storedPdf;
  } else {
    // Unsigned preview generation remains separate and deterministic.
    try {
      pdf = await generateContractPdf(
        pdfData(
          basis,
          null,
          null,
          b.createdAt,
          bookingContractLocale(req.nextUrl.searchParams.get("locale")),
        ),
      );
    } catch (error) {
      console.error(
        "[contract] unsigned PDF render failed",
        safeServerErrorLog(error, {
          correlationId: createServerLogCorrelationId(),
        }),
      );
      return contractTemporarilyUnavailable();
    }
  }

  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="contract-${b.id}.pdf"`,
      "Cache-Control": "private, no-store",
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
  if (!Number.isSafeInteger(bookingId) || bookingId <= 0) {
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
  const isClient = bookingContractClientMatches(b, u);
  if (!isClient) {
    return NextResponse.json(
      { error: "Doar clientul rezervarii poate semna contractul" },
      { status: 403 },
    );
  }

  if (b.clientSignedAt) {
    return NextResponse.json(
      {
        error: "Contractul este deja semnat",
        contractPdfUrl: `/api/booking-requests/${bookingId}/contract`,
      },
      { status: 409 },
    );
  }

  // Booking must be at least "accepted" (artist/venue said yes) to have
  // terms worth signing.
  if (!["confirmed_by_client", "completed"].includes(b.status)) {
    return NextResponse.json(
      {
        error:
          "Contractul poate fi semnat doar dupa ce furnizorul a acceptat rezervarea",
      },
      { status: 400 },
    );
  }

  const signedAt = new Date();

  // Render outside the transaction, then revalidate the complete basis under
  // canonical user -> vendor -> booking locks before publishing the signature.
  const preparedBasis = bookingContractBasis(b, row);
  let pdfBytes: Uint8Array;
  try {
    pdfBytes = await generateContractPdf(
      pdfData(
        preparedBasis,
        parsed.data.signature,
        signedAt,
        signedAt,
        parsed.data.locale,
      ),
    );
  } catch (error) {
    console.error(
      "[contract] signed PDF render failed",
      safeServerErrorLog(error, {
        correlationId: createServerLogCorrelationId(),
      }),
    );
    return contractTemporarilyUnavailable();
  }

  // A new signature is committed only after its exact private object and
  // registry receipt both exist. Signed evidence is never regenerated later.
  let pdfUrl: string;
  const legalBlobToken = process.env.LEGAL_BLOB_READ_WRITE_TOKEN
    ?? process.env.MOMENTS_BLOB_READ_WRITE_TOKEN;
  if (!legalBlobToken) return contractTemporarilyUnavailable();
  try {
    const filename = `legal-contracts/contract-${b.id}-${signedAt.toISOString()}.pdf`;
    pdfUrl = await storeRegisteredBlob({
      pathname: filename,
      body: new Blob([new Uint8Array(pdfBytes)]),
      access: "private",
      token: legalBlobToken,
      ownerUserId: u.id,
      provenance: "legal_contract_pending",
      contentType: "application/pdf",
    });
  } catch (error) {
    console.error(
      "[contract] private PDF or registry creation failed",
      safeServerErrorLog(error, {
        correlationId: createServerLogCorrelationId(),
      }),
    );
    return contractTemporarilyUnavailable();
  }

  let commit: "signed" | "unauthorized" | "booking_changed" | "already_signed";
  try {
    commit = await db.transaction(async (tx) => {
      const executor = tx as unknown as Executor;

      // Account erasure locks the same user row before it minimizes bookings.
      // Holding SHARE here makes signing and erasure linearizable, while the
      // booking UPDATE lock serializes sign against cancellation.
      const [currentUser] = await tx
        .select({ id: users.id, email: users.email })
        .from(users)
        .where(and(eq(users.id, u.id), eq(users.clerkId, clerkId)))
        .for("share")
        .limit(1);
      if (!currentUser) return "unauthorized" as const;

      // Keep the global user -> vendor -> booking order. Artist/venue DELETE
      // uses vendor -> booking through its FK action, so neither path can hold
      // the booking while waiting for the vendor. The FK ids in the basis make
      // a vendor replacement/deletion after the optimistic render lose safely.
      const currentVendor = await lockPreparedBookingVendor(b, executor);
      const currentBooking = await lockBookingForContractCommit(bookingId, executor);
      if (!currentBooking) return "booking_changed" as const;
      const currentBasis = bookingContractBasis(currentBooking, currentVendor);
      const decision = bookingContractCommitDecision({
        prepared: preparedBasis,
        current: currentBasis,
        authenticatedClient: bookingContractClientMatches(currentBooking, currentUser),
        currentStatus: currentBooking.status,
        currentSignedAt: currentBooking.clientSignedAt,
      });
      if (decision !== "sign") return decision;

      if (!currentBooking.clientUserId && !currentUser.email) {
        return "unauthorized" as const;
      }
      const ownership = currentBooking.clientUserId
        ? eq(bookingRequests.clientUserId, currentUser.id)
        : currentUser.email
          ? and(
              isNull(bookingRequests.clientUserId),
              sql`lower(btrim(${bookingRequests.clientEmail})) = lower(btrim(${currentUser.email}))`,
            )
          : undefined;
      if (!ownership) return "unauthorized" as const;
      const [updated] = await tx
        .update(bookingRequests)
        .set({
          clientSignature: parsed.data.signature,
          clientSignedAt: signedAt,
          contractPdfUrl: pdfUrl,
          updatedAt: new Date(),
        })
        .where(and(
          eq(bookingRequests.id, bookingId),
          inArray(bookingRequests.status, ["confirmed_by_client", "completed"]),
          isNull(bookingRequests.clientSignedAt),
          ownership,
        ))
        .returning({ id: bookingRequests.id });
      if (!updated) return "booking_changed" as const;

      await retainRegisteredBlobAsset(
        tx,
        pdfUrl,
        currentUser.id,
        "legal_contract",
      );
      return "signed" as const;
    });
  } catch (error) {
    await cleanupUnusedPdf(pdfUrl);
    console.error(
      "[contract] signature commit failed after private PDF creation",
      safeServerErrorLog(error, {
        correlationId: createServerLogCorrelationId(),
      }),
    );
    return contractTemporarilyUnavailable();
  }

  if (commit !== "signed") {
    await cleanupUnusedPdf(pdfUrl);
    if (commit === "unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (commit === "already_signed") {
      return NextResponse.json(
        {
          error: "Contractul este deja semnat",
          contractPdfUrl: `/api/booking-requests/${bookingId}/contract`,
        },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: "booking_changed" }, { status: 409 });
  }

  return NextResponse.json({
    success: true,
    // Never expose the provider URL; all reads remain authorization-gated.
    contractPdfUrl: `/api/booking-requests/${bookingId}/contract`,
    // Always also return the dynamic URL so the UI can display regardless
    dynamicUrl: `/api/booking-requests/${bookingId}/contract`,
  });
}
