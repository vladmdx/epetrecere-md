import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { invitations, invitationGuests } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { generateMeta } from "@/lib/seo/generate-meta";
import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n/routing";
import { t } from "@/i18n";
import { PublicInvitationView } from "./view";
import { revealInvitationGuestRecord } from "@/lib/privacy/guest-encryption";

interface PageProps {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<{ rsvp?: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { locale: raw, slug } = await params;
  const locale = isLocale(raw) ? raw : DEFAULT_LOCALE;
  const [inv] = await db
    .select()
    .from(invitations)
    .where(eq(invitations.slug, slug))
    .limit(1);
  if (!inv)
    return { ...(await generateMeta({
      title: t("invite.fallbackTitle", locale),
      path: `/i/${slug}`,
      locale,
      noindex: true,
    })), referrer: "no-referrer" };

  const title =
    inv.coupleNames || inv.hostName || t("invite.meta.defaultTitle", locale);
  return { ...(await generateMeta({
    title,
    description:
      inv.message ||
      `${title}${inv.eventDate ? ` · ${inv.eventDate}` : ""}${inv.ceremonyLocation ? ` · ${inv.ceremonyLocation}` : ""}`,
    path: `/i/${slug}`,
    locale,
    noindex: true,
  })), referrer: "no-referrer" };
}

export default async function PublicInvitationPage({
  params,
  searchParams,
}: PageProps) {
  const { slug } = await params;
  const sp = await searchParams;

  const [invitation] = await db
    .select()
    .from(invitations)
    .where(eq(invitations.slug, slug))
    .limit(1);

  if (!invitation || invitation.status !== "published") {
    notFound();
  }

  // Look up guest by RSVP token if present
  let guest = null;
  if (sp.rsvp) {
    const [row] = await db
      .select()
      .from(invitationGuests)
      .where(eq(invitationGuests.rsvpToken, sp.rsvp))
      .limit(1);
    if (
      row &&
      row.invitationId === invitation.id &&
      !row.rsvpTokenRevokedAt &&
      (!row.rsvpTokenExpiresAt || row.rsvpTokenExpiresAt > new Date())
    ) {
      guest = revealInvitationGuestRecord(row);
    }
  }

  return (
    <PublicInvitationView
      invitation={{
        ...invitation,
        customColors: (invitation.customColors as { designId?: string } | null) || null,
      }}
      guest={guest}
    />
  );
}
