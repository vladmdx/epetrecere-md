// Phase 2 — Photo Moments collage maker. Owner picks a layout, the
// page renders all approved photos for the plan, and the browser
// "Print to PDF" dialog turns it into a printable poster.
//
// The page intentionally avoids any image-processing library: the
// collage IS the page. Browser print rasterizes it at 300 DPI which
// is plenty for an A3 poster. This keeps deploy size flat and avoids
// the Sharp / canvas binary on Vercel.

import { notFound } from "next/navigation";
import { ColajClient } from "./client";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ColajPage({ params }: Props) {
  const { id } = await params;
  const planId = Number(id);
  if (!Number.isFinite(planId)) notFound();
  return <ColajClient planId={planId} />;
}
