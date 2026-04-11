// F-C8 — Fullscreen slideshow for the event projector. Polls the public
// moments endpoint and fades between photos. Zero chrome, zero controls.

import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { eventPlans } from "@/lib/db/schema";
import { SlideshowClient } from "./client";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function MomentsSlideshowPage({ params }: Props) {
  const { slug } = await params;
  const [plan] = await db
    .select({
      title: eventPlans.title,
      momentsEnabled: eventPlans.momentsEnabled,
    })
    .from(eventPlans)
    .where(eq(eventPlans.momentsSlug, slug))
    .limit(1);

  if (!plan || !plan.momentsEnabled) notFound();

  return <SlideshowClient slug={slug} title={plan.title} />;
}
