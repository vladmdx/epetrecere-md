import { NextRequest, NextResponse } from "next/server";
import { drainConfirmationNotificationOutbox } from "@/lib/booking/confirmation-effects";
import { drainBookingCreationNotificationOutbox } from "@/lib/booking/booking-create-effects";
import { drainAccountAssetErasureOutbox } from "@/lib/privacy/account-asset-erasure";
import { drainAccountErasureIdentityOutbox } from "@/lib/privacy/account-erasure-identity";
import { reconcileOnboardedReferrals } from "@/lib/referrals/trigger";
import { retryPendingLegalContractDeliveries } from "@/lib/legal/contract-delivery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const FALLBACK_PROVIDER_TIMEOUT_MS = 4_000;
const FALLBACK_PROVIDER_BATCH = 1;

/** Daily fallback outbox runner. Inngest is primary; Vercel supplies CRON_SECRET as Bearer. */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[cron/booking-outbox] CRON_SECRET not configured");
    return NextResponse.json({ error: "Cron not configured" }, { status: 503 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Inngest remains primary. The daily fallback starts each independent
  // queue concurrently, with a single bounded item per queue and a 4s
  // provider deadline (Blob deletion has its own 5s AbortSignal). Referral
  // recovery is included in the same bounded wave instead of running a
  // sequential 25-user loop before provider work starts.
  const [
    referrals,
    identityErasure,
    assetErasure,
    legalDelivery,
    confirmation,
    creation,
  ] = await Promise.all([
    reconcileOnboardedReferrals({ limit: FALLBACK_PROVIDER_BATCH }),
    drainAccountErasureIdentityOutbox({
      limit: FALLBACK_PROVIDER_BATCH,
      providerTimeoutMs: FALLBACK_PROVIDER_TIMEOUT_MS,
    }),
    drainAccountAssetErasureOutbox({ limit: FALLBACK_PROVIDER_BATCH }),
    retryPendingLegalContractDeliveries(FALLBACK_PROVIDER_BATCH, {
      maxRecipientsPerSession: FALLBACK_PROVIDER_BATCH,
      providerTimeoutMs: FALLBACK_PROVIDER_TIMEOUT_MS,
    }),
    drainConfirmationNotificationOutbox({
      limit: FALLBACK_PROVIDER_BATCH,
      maxDeliveriesPerEffect: FALLBACK_PROVIDER_BATCH,
      providerTimeoutMs: FALLBACK_PROVIDER_TIMEOUT_MS,
    }),
    drainBookingCreationNotificationOutbox({
      limit: FALLBACK_PROVIDER_BATCH,
      maxDeliveriesPerEffect: FALLBACK_PROVIDER_BATCH,
      providerTimeoutMs: FALLBACK_PROVIDER_TIMEOUT_MS,
    }),
  ]);
  // Keep confirmation counters at the top level for backwards-compatible
  // monitoring, and attach the creation drain as a namespaced summary.
  const result = {
    ...confirmation,
    creation,
    referrals,
    assetErasure,
    identityErasure,
    legalDelivery,
  };
  // Non-2xx is intentional observability: durable rows remain retryable in
  // the database, while Vercel monitoring can no longer mistake a provider
  // outage or dead letter for a healthy run.
  const unhealthy = confirmation.failed > 0
    || confirmation.failedBacklog > 0
    || confirmation.newlyReportedTerminal > 0
    || creation.failed > 0
    || creation.failedBacklog > 0
    || creation.newlyReportedTerminal > 0
    || referrals.failed > 0
    || assetErasure.failed > 0
    || assetErasure.deadLettered > 0
    || assetErasure.leaseLost > 0
    || identityErasure.failed > 0
    || legalDelivery.failed > 0
    || legalDelivery.newlyDeadLettered > 0
    || legalDelivery.deadLetterBacklog > 0;
  return NextResponse.json(result, { status: unhealthy ? 503 : 200 });
}
