// Phase 5/D1 — printable multi-page album.
//
// Renders a cover page + photo grid pages + thanks page, sized for A4
// portrait. Owner uses File → Print → Save as PDF to ship an offline
// book. Reuses the print CSS from Phase 2.

import { notFound } from "next/navigation";
import { AlbumClient } from "./client";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function AlbumPage({ params }: Props) {
  const { id } = await params;
  const planId = Number(id);
  if (!Number.isFinite(planId)) notFound();
  return <AlbumClient planId={planId} />;
}
