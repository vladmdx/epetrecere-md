// Phase 5/C2 — printable QR card. Owner picks a template, the page
// renders branded cards (event name + date + QR + decoration) at A6
// portrait. Browser print dialog converts to PDF for offline printing.

import { notFound } from "next/navigation";
import { QrCardClient } from "./client";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function QrCardPage({ params }: Props) {
  const { id } = await params;
  const planId = Number(id);
  if (!Number.isFinite(planId)) notFound();
  return <QrCardClient planId={planId} />;
}
