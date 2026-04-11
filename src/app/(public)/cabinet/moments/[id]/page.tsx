// F-C8 — Owner control panel for Event Moments. Accessed from the event
// plan. Shows QR code, public link, slideshow link, and the live gallery.

import { notFound } from "next/navigation";
import { MomentsOwnerClient } from "./client";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function MomentsOwnerPage({ params }: Props) {
  const { id } = await params;
  const planId = Number(id);
  if (!Number.isFinite(planId)) notFound();
  return <MomentsOwnerClient planId={planId} />;
}
