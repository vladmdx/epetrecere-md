// Unified CRM feed — merges leads, booking_requests, and offer_requests
// into a single normalized list keyed by a synthetic compound id
// (`<type>-<id>`) so the kanban and list views can show all customer
// activity in one place.
//
// Status mapping (DB → CRM funnel):
//   - new (leads, offer_requests), pending (booking_requests) → "new"
//   - seen (offer_requests), contacted (leads)                → "contacted"
//   - proposal_sent (leads)                                    → "proposal_sent"
//   - negotiation (leads)                                      → "negotiation"
//   - accepted (offer_requests, booking_requests)              → "accepted"
//   - confirmed (leads), confirmed_by_client (booking_requests)→ "confirmed"
//   - completed (leads, booking_requests)                      → "completed"
//   - lost (leads), declined/cancelled (booking_requests)      → "lost"
//   - follow_up (leads)                                        → "follow_up"

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  leads,
  bookingRequests,
  offerRequests,
  artists,
} from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/admin";

export type CrmItemType = "lead" | "booking" | "offer";

export interface CrmItem {
  id: string; // compound id: "<type>-<id>"
  rawId: number;
  type: CrmItemType;
  name: string;
  phone: string;
  email: string | null;
  eventType: string | null;
  eventDate: string | null;
  location: string | null;
  guestCount: number | null;
  budget: number | null;
  status: string; // normalized to CRM funnel value
  rawStatus: string; // original DB status
  source: string | null;
  score: number | null;
  message: string | null;
  artistName: string | null;
  createdAt: string;
}

function normalizeLeadStatus(s: string): string {
  return s; // leads already use the canonical funnel
}

function normalizeBookingStatus(s: string): string {
  switch (s) {
    case "pending":
      return "new";
    case "accepted":
      return "accepted";
    case "confirmed":
    case "confirmed_by_client":
      return "confirmed";
    case "declined":
    case "rejected":
    case "cancelled":
      return "lost";
    case "completed":
      return "completed";
    default:
      return s;
  }
}

function normalizeOfferStatus(s: string): string {
  switch (s) {
    case "new":
      return "new";
    case "seen":
      return "contacted";
    case "accepted":
      return "accepted";
    case "processed":
      return "completed";
    case "rejected":
    case "declined":
      return "lost";
    default:
      return s;
  }
}

export async function GET() {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return NextResponse.json({ error: admin.error }, { status: admin.status });
  }

  // Pull all three sources in parallel + artist names for resolution
  const [leadRows, bookingRows, offerRows, artistRows] = await Promise.all([
    db.select().from(leads).orderBy(desc(leads.createdAt)).limit(500),
    db
      .select()
      .from(bookingRequests)
      .orderBy(desc(bookingRequests.createdAt))
      .limit(500),
    db
      .select()
      .from(offerRequests)
      .orderBy(desc(offerRequests.createdAt))
      .limit(500),
    db.select({ id: artists.id, nameRo: artists.nameRo }).from(artists),
  ]);

  const artistMap = new Map(artistRows.map((a) => [a.id, a.nameRo]));

  const items: CrmItem[] = [
    ...leadRows.map<CrmItem>((l) => ({
      id: `lead-${l.id}`,
      rawId: l.id,
      type: "lead",
      name: l.name,
      phone: l.phone,
      email: l.email ?? null,
      eventType: l.eventType ?? null,
      eventDate: l.eventDate ?? null,
      location: l.location ?? null,
      guestCount: l.guestCount ?? null,
      budget: l.budget ?? null,
      status: normalizeLeadStatus(l.status ?? "new"),
      rawStatus: l.status ?? "new",
      source: l.source ?? null,
      score: l.score ?? null,
      message: l.message ?? null,
      artistName: null,
      createdAt: l.createdAt?.toISOString() ?? new Date().toISOString(),
    })),
    ...bookingRows.map<CrmItem>((b) => ({
      id: `booking-${b.id}`,
      rawId: b.id,
      type: "booking",
      name: b.clientName,
      phone: b.clientPhone,
      email: b.clientEmail ?? null,
      eventType: b.eventType ?? null,
      eventDate: b.eventDate ?? null,
      location: null,
      guestCount: b.guestCount ?? null,
      budget: null,
      status: normalizeBookingStatus(b.status ?? "pending"),
      rawStatus: b.status ?? "pending",
      source: "booking",
      score: null,
      message: b.message ?? null,
      artistName: b.artistId ? (artistMap.get(b.artistId) ?? null) : null,
      createdAt: b.createdAt?.toISOString() ?? new Date().toISOString(),
    })),
    ...offerRows.map<CrmItem>((o) => ({
      id: `offer-${o.id}`,
      rawId: o.id,
      type: "offer",
      name: o.clientName,
      phone: o.clientPhone,
      email: o.clientEmail ?? null,
      eventType: o.eventType ?? null,
      eventDate: o.eventDate ?? null,
      location: null,
      guestCount: null,
      budget: null,
      status: normalizeOfferStatus(o.status ?? "new"),
      rawStatus: o.status ?? "new",
      source: "offer",
      score: null,
      message: o.message ?? null,
      artistName: o.artistId ? (artistMap.get(o.artistId) ?? null) : null,
      createdAt: o.createdAt?.toISOString() ?? new Date().toISOString(),
    })),
  ].sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  return NextResponse.json(items);
}

// PATCH — update status across all three sources via compound id
export async function PATCH(req: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return NextResponse.json({ error: admin.error }, { status: admin.status });
  }

  const body = await req.json();
  const { id, status } = body as { id: string; status: string };
  if (!id || !status) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const [type, rawIdStr] = id.split("-");
  const rawId = Number(rawIdStr);
  if (!type || !rawId) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  try {
    if (type === "lead") {
      // Map CRM status straight to lead status enum
      await db
        .update(leads)
        .set({ status: status as never, updatedAt: new Date() })
        .where(eq(leads.id, rawId));
    } else if (type === "booking") {
      // Map CRM funnel back to booking_requests enum.
      // Enum values: pending|accepted|confirmed_by_client|rejected|cancelled|completed|expired
      // Some funnel stages (contacted, proposal_sent, negotiation) don't map
      // to the booking enum — fall back to "accepted" so they don't disappear.
      const dbStatus =
        status === "new"
          ? "pending"
          : status === "accepted" ||
              status === "contacted" ||
              status === "proposal_sent" ||
              status === "negotiation"
            ? "accepted"
            : status === "confirmed"
              ? "confirmed_by_client"
              : status === "completed"
                ? "completed"
                : status === "lost"
                  ? "rejected"
                  : "pending";
      await db
        .update(bookingRequests)
        .set({ status: dbStatus as never, updatedAt: new Date() })
        .where(eq(bookingRequests.id, rawId));
    } else if (type === "offer") {
      // offer_requests uses plain text — keep funnel-friendly names
      const dbStatus =
        status === "new"
          ? "new"
          : status === "contacted"
            ? "seen"
            : status === "accepted"
              ? "accepted"
              : status === "completed"
                ? "processed"
                : status === "lost"
                  ? "rejected"
                  : status; // pass through proposal_sent/negotiation/etc
      await db
        .update(offerRequests)
        .set({ status: dbStatus })
        .where(eq(offerRequests.id, rawId));
    } else {
      return NextResponse.json({ error: "Unknown type" }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[crm/items] PATCH failed", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
