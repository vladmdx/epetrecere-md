// Send invitation emails, by default ONLY to guests who haven't had one.
// Uses the design template chosen when the invitation was created.
//
// This route used to mail every guest with an address on every press,
// because invitation_guests had no record of who'd already been sent to.
// A host who added one guest on day two re-spammed day one's guests. Each
// guest is now stamped the instant their own mail succeeds — per guest,
// not once at the end — so a failure halfway through doesn't re-mail the
// ones already delivered when the host retries.
//
// Deliberate re-sends are still possible: POST { guestIds: [...] } to
// re-reach specific people, or { resend: true } for the whole list.

import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { db } from "@/lib/db";
import { invitations, invitationGuests } from "@/lib/db/schema";
import { requireAppUser } from "@/lib/planner/ownership";
import {
  getInvitationDesign,
  invitationEmailHtml,
} from "@/lib/invitations/templates";
import { sendEmail } from "@/lib/email/send";

const sendSchema = z.object({
  /** Explicit targets — a deliberate re-send to specific people,
   *  delivered whether or not they already have the invitation. */
  guestIds: z.array(z.number().int()).max(500).optional(),
  /** Re-send to the whole list, ignoring who already has it. */
  resend: z.boolean().optional(),
});

/** Migrations here are applied by hand (see migrations/README.md), so the
 *  deploy can land before 0017 does. When the column is missing we fall
 *  back to the old send-to-everyone behavior rather than 500-ing every
 *  send.
 *
 *  Only a positive answer is cached. Caching "missing" would keep a warm
 *  lambda mailing the whole list for as long as it lives after the
 *  migration lands — an error in the direction that caused this bug. The
 *  re-probe costs one trivial query, and only until 0017 is applied. */
let sentColumnPresent = false;

async function hasSentColumn(): Promise<boolean> {
  if (sentColumnPresent) return true;
  try {
    const res = await db.execute(
      sql`SELECT 1 FROM information_schema.columns
           WHERE table_name = 'invitation_guests'
             AND column_name = 'invitation_sent_at'`,
    );
    const rows = Array.isArray(res)
      ? res
      : ((res as { rows?: unknown[] }).rows ?? []);
    sentColumnPresent = rows.length > 0;
    return sentColumnPresent;
  } catch (err) {
    console.error("[invitation-send] column probe failed:", err);
    return false;
  }
}

type GuestRow = {
  id: number;
  name: string;
  email: string | null;
  guestType: string;
  rsvpToken: string | null;
  invitationSentAt: Date | null;
};

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const invitationId = Number(id);
  if (!Number.isFinite(invitationId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const appUser = await requireAppUser();
  if (!appUser.ok) {
    return NextResponse.json(
      { error: appUser.error },
      { status: appUser.status },
    );
  }

  // Callers that just want "send to whoever is new" post no body at all.
  const rawBody = await req.json().catch(() => ({}));
  const parsedBody = sendSchema.safeParse(rawBody);
  if (!parsedBody.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsedBody.error.issues },
      { status: 400 },
    );
  }
  const { guestIds, resend } = parsedBody.data;

  const [inv] = await db
    .select()
    .from(invitations)
    .where(eq(invitations.id, invitationId))
    .limit(1);

  if (!inv) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (inv.userId !== appUser.userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (inv.status !== "published") {
    return NextResponse.json(
      { error: "Invitația trebuie să fie publicată înainte de trimitere" },
      { status: 400 },
    );
  }

  // Resolve design + host customizations. customColors is a JSON map
  // mixing the picked designId with overrides like eventName, iconImageUrl,
  // bgColor, fontHeading, etc. — passed through to the email template
  // so the rendered HTML matches what the host saw in the live preview.
  const customColors = (inv.customColors || {}) as Record<string, unknown>;
  const designId =
    typeof customColors.designId === "string" ? customColors.designId : null;
  const design = getInvitationDesign(designId);
  function strProp(k: string): string | undefined {
    const v = customColors[k];
    return typeof v === "string" ? v : undefined;
  }
  function alignProp(
    k: string,
  ): "left" | "center" | "right" | undefined {
    const v = customColors[k];
    if (v === "left" || v === "center" || v === "right") return v;
    return undefined;
  }
  const customForRender = {
    headerText: strProp("headerText"),
    eventName: strProp("eventName"),
    decorIcon: strProp("decorIcon"),
    iconImageUrl: strProp("iconImageUrl"),
    iconSize: strProp("iconSize"),
    iconAlign: alignProp("iconAlign"),
    bgColor: strProp("bgColor"),
    textColor: strProp("textColor"),
    accentColor: strProp("accentColor"),
    fontHeading: strProp("fontHeading"),
    titleSize: strProp("titleSize"),
    titleAlign: alignProp("titleAlign"),
  };

  // Load guests. Columns are listed explicitly so the query still runs on
  // a database that hasn't had 0017 applied yet — `select()` would emit
  // invitation_sent_at and fail there.
  const baseCols = {
    id: invitationGuests.id,
    name: invitationGuests.name,
    email: invitationGuests.email,
    guestType: invitationGuests.guestType,
    rsvpToken: invitationGuests.rsvpToken,
  };
  const tracksDelivery = await hasSentColumn();
  let guests: GuestRow[];
  if (tracksDelivery) {
    guests = await db
      .select({ ...baseCols, invitationSentAt: invitationGuests.invitationSentAt })
      .from(invitationGuests)
      .where(eq(invitationGuests.invitationId, invitationId));
  } else {
    console.warn(
      "[invitation-send] invitation_sent_at missing — apply migration 0017; sending to every guest",
    );
    const rows = await db
      .select(baseCols)
      .from(invitationGuests)
      .where(eq(invitationGuests.invitationId, invitationId));
    guests = rows.map((g) => ({ ...g, invitationSentAt: null }));
  }

  const withEmail = guests.filter((g) => g.email);
  if (withEmail.length === 0) {
    return NextResponse.json(
      { error: "Niciun invitat nu are email" },
      { status: 400 },
    );
  }

  // Who actually gets mail this press. An explicit id list or resend:true
  // is the host deliberately re-reaching someone, so it overrides the
  // already-sent filter; anything else is "only the ones who don't have it".
  let recipients: GuestRow[];
  if (guestIds && guestIds.length > 0) {
    const wanted = new Set(guestIds);
    recipients = withEmail.filter((g) => wanted.has(g.id));
  } else if (resend) {
    recipients = withEmail;
  } else {
    recipients = withEmail.filter((g) => !g.invitationSentAt);
  }
  const skipped = withEmail.length - recipients.length;

  // Not an error — the host pressed Send and everyone already has it. The
  // caller reports the skip count rather than claiming a send happened.
  if (recipients.length === 0) {
    return NextResponse.json({
      sent: 0,
      failed: 0,
      skipped,
      total: withEmail.length,
      tracksDelivery,
    });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://epetrecere.md";
  const title = inv.coupleNames || inv.hostName || "Invitație";

  let sent = 0;
  let failed = 0;

  for (const guest of recipients) {
    const rsvpUrl = `${appUrl}/i/${inv.slug}?rsvp=${guest.rsvpToken}`;
    const guestType = (guest.guestType as
      | "single"
      | "couple"
      | "family"
      | undefined) ?? "single";
    const html = invitationEmailHtml({
      design,
      guestName: guest.name,
      guestType,
      title,
      eventDate: inv.eventDate,
      ceremonyLocation: inv.ceremonyLocation,
      ceremonyTime: inv.ceremonyTime,
      receptionLocation: inv.receptionLocation,
      receptionTime: inv.receptionTime,
      message: inv.message,
      dressCode: inv.dressCode,
      rsvpUrl,
      custom: customForRender,
    });

    try {
      await sendEmail({
        to: guest.email!,
        subject: `Ești invitat: ${title}${inv.eventDate ? ` · ${new Date(inv.eventDate).toLocaleDateString("ro-RO", { day: "numeric", month: "long", year: "numeric" })}` : ""}`,
        html,
      });
      sent += 1;

      // Stamp immediately, the way the RSVP reminder cron does. Batching
      // this until after the loop would mean a crash at guest 40 of 100
      // re-mailed all 40 on the retry.
      if (tracksDelivery) {
        try {
          await db
            .update(invitationGuests)
            .set({ invitationSentAt: new Date() })
            .where(eq(invitationGuests.id, guest.id));
        } catch (markErr) {
          // The mail is out; losing the stamp only risks a duplicate later.
          console.error(
            `[invitation-send] delivered but could not mark guest ${guest.id}:`,
            markErr,
          );
        }
      }
    } catch (err) {
      console.error(`[invitation-send] failed for ${guest.email}:`, err);
      failed += 1;
    }
  }

  return NextResponse.json({
    sent,
    failed,
    skipped,
    total: withEmail.length,
    tracksDelivery,
  });
}
