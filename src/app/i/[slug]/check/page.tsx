// Public check-in page — what opens when a guest's QR code is scanned.
// The QR encodes: /i/<slug>/check?token=<rsvpToken>
// On mount we auto-POST the token to /api/invitations/checkin and show
// a friendly "Bun venit!" splash with the guest's name.

import { Metadata } from "next";
import { Suspense } from "react";
import { CheckInClient } from "./client";

export const metadata: Metadata = {
  title: "Check-in — ePetrecere.md",
  robots: { index: false, follow: false }, // never indexed
};

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ token?: string }>;
}

export default async function CheckInPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;
  const token = sp.token ?? null;

  return (
    <Suspense>
      <CheckInClient slug={slug} token={token} />
    </Suspense>
  );
}
