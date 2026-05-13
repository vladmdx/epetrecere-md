// Phase 5/D2 — highlight reel.
// Full-screen Ken Burns auto-player on top 20 photos (favorites first)
// with optional background music. Owner records screen if they want
// an MP4 — avoids shipping ffmpeg into the Vercel bundle.

import { notFound } from "next/navigation";
import { ReelClient } from "./client";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ReelPage({ params }: Props) {
  const { id } = await params;
  const planId = Number(id);
  if (!Number.isFinite(planId)) notFound();
  return <ReelClient planId={planId} />;
}
