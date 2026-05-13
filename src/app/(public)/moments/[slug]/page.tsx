// F-C8 — Public guest upload page. Reached by scanning the QR code printed
// on the event tables. No auth required, no app install. Mobile-first.
//
// Server fetch is intentionally minimal — the client fetches the full
// gated state (photos hidden if pre-reveal, shot counter, window state)
// from /api/moments/[slug] on mount so it can poll for new shots and
// react to the reveal moment without a page reload.

import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { eventPlans } from "@/lib/db/schema";
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
      momentsOpenAt: eventPlans.momentsOpenAt,
      momentsCloseAt: eventPlans.momentsCloseAt,
      momentsRevealAt: eventPlans.momentsRevealAt,
      momentsShotLimit: eventPlans.momentsShotLimit,
      momentsVintage: eventPlans.momentsVintage,
      momentsPrompts: eventPlans.momentsPrompts,
      momentsTables: eventPlans.momentsTables,
    })
    .from(eventPlans)
    .where(eq(eventPlans.momentsSlug, slug))
    .limit(1);

  if (!plan || !plan.momentsEnabled) notFound();

  return (
    <MomentsUploadClient
      slug={slug}
      title={plan.title}
      eventDate={plan.eventDate}
      openAt={plan.momentsOpenAt?.toISOString() ?? null}
      closeAt={plan.momentsCloseAt?.toISOString() ?? null}
      revealAt={plan.momentsRevealAt?.toISOString() ?? null}
      shotLimit={plan.momentsShotLimit ?? null}
      vintage={plan.momentsVintage}
      prompts={plan.momentsPrompts ?? []}
      tables={plan.momentsTables ?? []}
    />
  );
}
