import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { invitations, invitationGuests } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { generateMeta } from "@/lib/seo/generate-meta";
import { PublicInvitationView } from "./view";

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ rsvp?: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const [inv] = await db
    .select()
    .from(invitations)
    .where(eq(invitations.slug, slug))
    .limit(1);
  if (!inv) return generateMeta({ title: "Invitație", path: `/i/${slug}` });

  const title =
    inv.coupleNames || inv.hostName || "Ești invitat la un eveniment";
  return generateMeta({
    title,
    description:
      inv.message ||
      `${title}${inv.eventDate ? ` · ${inv.eventDate}` : ""}${inv.ceremonyLocation ? ` · ${inv.ceremonyLocation}` : ""}`,
    path: `/i/${slug}`,
  });
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
    if (row && row.invitationId === invitation.id) {
      guest = row;
    }
  }

  return <PublicInvitationView invitation={invitation} guest={guest} />;
}
