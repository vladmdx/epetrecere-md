import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { db } from "@/lib/db";
import { guestList } from "@/lib/db/schema";
import { requirePlanOwnership } from "@/lib/planner/ownership";
import { protectGuestListRecord, revealGuestListRecord } from "@/lib/privacy/guest-encryption";

// M4 — POST /api/event-plans/[id]/guests
// Add a guest to the plan's guest list.

const GUEST_TYPES = ["single", "couple", "family"] as const;
const CONTACT_CHANNELS = [
  "email",
  "sms",
  "whatsapp",
  "viber",
  "telegram",
] as const;

const createGuestSchema = z.object({
  fullName: z.string().min(1).max(120),
  phone: z.string().optional(),
  email: z.string().optional(),
  group: z.string().optional(),
  /** New shape: single | couple | family. Default single. */
  guestType: z.enum(GUEST_TYPES).optional(),
  /** Adults under this entry. 1 for single, 2 for couple, 2-8 for family. */
  partySize: z.number().int().min(1).max(8).optional(),
  /** Children expected — separate axis from adults. */
  kidsCount: z.number().int().min(0).max(20).optional(),
  /** Channel the host wants the invitation sent on. */
  contactChannel: z.enum(CONTACT_CHANNELS).optional(),
  /** Free-form contact value matched to the channel (email / phone / @user). */
  contactValue: z.string().optional(),
  /** Legacy: existing imports still send this. */
  plusOnes: z.number().int().min(0).max(20).optional(),
  rsvp: z.enum(["pending", "accepted", "declined", "maybe"]).optional(),
  notes: z.string().optional(),
});

/** Mirror contactValue into the legacy email/phone columns based on channel
 *  so existing readers (CSV export, send routes) keep working. */
function deriveLegacyContacts(
  channel: string | undefined,
  value: string | undefined,
  fallback: { email?: string; phone?: string },
) {
  let email = fallback.email;
  let phone = fallback.phone;
  if (value && channel) {
    if (channel === "email") email = value;
    else phone = value; // sms / whatsapp / viber / telegram all live on phone
  }
  return { email, phone };
}

/** Compute partySize from guestType + caller-supplied size. Couple is
 *  locked at 2; single at 1; family clamps to 2-8. */
function resolvePartySize(
  guestType: (typeof GUEST_TYPES)[number] | undefined,
  partySize: number | undefined,
): number {
  if (guestType === "couple") return 2;
  if (guestType === "family") {
    return Math.max(2, Math.min(8, partySize ?? 2));
  }
  return 1; // single (default)
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const planId = Number(id);

  const owned = await requirePlanOwnership(planId);
  if (!owned.ok) {
    return NextResponse.json({ error: owned.error }, { status: owned.status });
  }

  const body = await req.json().catch(() => null);
  const parsed = createGuestSchema.safeParse(body);
  if (!parsed.success) {
    /**
     * A sentence, not "Validation failed".
     *
     * The app puts whatever `error` says straight under the field, so a
     * person adding a guest was told "Validation failed" in English on an
     * otherwise Romanian screen, with no hint that the party size caps at 8 —
     * which is the only limit they are likely to hit.
     */
    const issue = parsed.error.issues[0];
    const field = String(issue?.path?.[0] ?? "");
    const message =
      field === "fullName"
        ? "Scrie numele invitatului."
        : field === "partySize"
          ? "Numărul de persoane trebuie să fie între 1 și 8. Pentru grupuri mai mari, adaugă mai multe intrări."
          : field === "kidsCount"
            ? "Numărul de copii trebuie să fie între 0 și 20."
            : "Verifică datele introduse și încearcă din nou.";
    return NextResponse.json(
      { error: message, details: parsed.error.issues },
      { status: 400 },
    );
  }

  const guestType = parsed.data.guestType ?? "single";
  const partySize = resolvePartySize(guestType, parsed.data.partySize);
  const { email, phone } = deriveLegacyContacts(
    parsed.data.contactChannel,
    parsed.data.contactValue,
    { email: parsed.data.email, phone: parsed.data.phone },
  );

  const [guest] = await db
    .insert(guestList)
    .values(protectGuestListRecord({
      planId,
      fullName: parsed.data.fullName,
      phone,
      email,
      group: parsed.data.group,
      guestType,
      partySize,
      kidsCount: parsed.data.kidsCount ?? 0,
      contactChannel: parsed.data.contactChannel ?? "whatsapp",
      contactValue: parsed.data.contactValue ?? null,
      plusOnes: parsed.data.plusOnes ?? 0,
      rsvp: parsed.data.rsvp ?? "pending",
      notes: parsed.data.notes,
    }))
    .returning();

  return NextResponse.json({ guest: revealGuestListRecord(guest) }, { status: 201 });
}
