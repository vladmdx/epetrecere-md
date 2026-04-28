// Send invitation emails to all guests with an email set.
// Uses the design template chosen when the invitation was created.

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { invitations, invitationGuests } from "@/lib/db/schema";
import { requireAppUser } from "@/lib/planner/ownership";
import {
  getInvitationDesign,
  invitationEmailHtml,
} from "@/lib/invitations/templates";
import { sendEmail } from "@/lib/email/send";

export async function POST(
  _req: Request,
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

  // Load guests with email
  const guests = await db
    .select()
    .from(invitationGuests)
    .where(eq(invitationGuests.invitationId, invitationId));

  const withEmail = guests.filter((g) => g.email);
  if (withEmail.length === 0) {
    return NextResponse.json(
      { error: "Niciun invitat nu are email" },
      { status: 400 },
    );
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://epetrecere.md";
  const title = inv.coupleNames || inv.hostName || "Invitație";

  let sent = 0;
  let failed = 0;

  for (const guest of withEmail) {
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
    } catch (err) {
      console.error(`[invitation-send] failed for ${guest.email}:`, err);
      failed += 1;
    }
  }

  return NextResponse.json({ sent, failed, total: withEmail.length });
}
