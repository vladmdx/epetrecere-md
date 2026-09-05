// F-C8 — Fullscreen slideshow for the event projector. Polls the public
// moments endpoint and fades between photos. Zero chrome, zero controls.

import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { eventPlans } from "@/lib/db/schema";
import { SlideshowClient } from "./client";
import { isValidMomentsAccessToken, momentsCookieName } from "@/lib/moments/access";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  robots: { index: false, follow: false, noarchive: true, nosnippet: true },
  referrer: "no-referrer",
};

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function MomentsSlideshowPage({ params }: Props) {
  const { slug } = await params;
  const [plan] = await db
    .select({
      title: eventPlans.title,
      momentsEnabled: eventPlans.momentsEnabled,
      momentsMusicUrl: eventPlans.momentsMusicUrl,
    })
    .from(eventPlans)
    .where(eq(eventPlans.momentsSlug, slug))
    .limit(1);

  if (!plan || !plan.momentsEnabled) notFound();
  const cookieStore = await cookies();
  if (!isValidMomentsAccessToken(cookieStore.get(momentsCookieName(slug))?.value, slug)) {
    redirect(`/moments/${slug}`);
  }

  return (
    <SlideshowClient
      slug={slug}
      title={plan.title}
      musicUrl={plan.momentsMusicUrl ?? null}
    />
  );
}
