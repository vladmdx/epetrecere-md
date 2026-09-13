import { NextRequest, NextResponse } from "next/server";
import { drainConfirmationNotificationOutbox } from "@/lib/booking/confirmation-effects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Redundant durable-outbox runner. Vercel supplies CRON_SECRET as Bearer. */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[cron/booking-outbox] CRON_SECRET not configured");
    return NextResponse.json({ error: "Cron not configured" }, { status: 503 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const result = await drainConfirmationNotificationOutbox({ limit: 50 });
  // Non-2xx is intentional observability: durable rows remain retryable in
  // the database, while Vercel monitoring can no longer mistake a provider
  // outage or dead letter for a healthy run.
  const unhealthy = result.failed > 0 || result.failedBacklog > 0 || result.terminal > 0;
  return NextResponse.json(result, { status: unhealthy ? 503 : 200 });
}
