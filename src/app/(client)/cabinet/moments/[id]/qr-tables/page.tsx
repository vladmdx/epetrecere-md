// Phase 5/C3 — printable sheet with one QR card per table.
// Owner declared the table list in settings; this page renders them
// in a compact grid sized for A4 with 3 cards per row.

import { notFound } from "next/navigation";
import { QrTablesClient } from "./client";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function QrTablesPage({ params }: Props) {
  const { id } = await params;
  const planId = Number(id);
  if (!Number.isFinite(planId)) notFound();
  return <QrTablesClient planId={planId} />;
}
