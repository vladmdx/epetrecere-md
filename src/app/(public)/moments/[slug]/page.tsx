// F-C8 — Public guest upload page. Reached by scanning the QR code printed
// on the event tables. No auth required, no app install. Mobile-first.

import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { eventPhotos, eventPlans } from "@/lib/db/schema";
import { MomentsUploadClient } from "./client";

interface Props {
  params: Promise<{ slug: string }>;
}

export const dynamic = "force-dynamic";

export default async function MomentsPage({ params }: Props) {
  const { slug } = await params;

  const [plan] = await db
    .select({
      id: eventPlans.id,
      title: eventPlans.title,
      eventDate: eventPlans.eventDate,
      momentsEnabled: eventPlans.momentsEnabled,
    })
    .from(eventPlans)
    .where(eq(eventPlans.momentsSlug, slug))
    .limit(1);

  if (!plan || !plan.momentsEnabled) notFound();

  const photos = await db
    .select({
      id: eventPhotos.id,
      url: eventPhotos.url,
      guestName: eventPhotos.guestName,
      guestMessage: eventPhotos.guestMessage,
    })
    .from(eventPhotos)
    .where(
      and(
        eq(eventPhotos.planId, plan.id),
        eq(eventPhotos.isApproved, true),
      ),
    )
    .orderBy(desc(eventPhotos.createdAt))
    .limit(60);

  return (
    <MomentsUploadClient
      slug={slug}
      title={plan.title}
      eventDate={plan.eventDate}
      initialPhotos={photos}
    />
  );
}
