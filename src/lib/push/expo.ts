// Server-side Expo Push helper.
//
// Talks directly to exp.host's push API — no SDK needed because the
// payload is just a JSON POST. Expo handles APNs + FCM fan-out for
// us, including device-token translation and silent fallback when
// a token is invalid.
//
// Best practices applied:
//   - Always send `priority: high` for foreground-prompt events
//     (booking, message). iOS otherwise throttles to once per ~5min.
//   - Always set `channelId: "default"` on Android (required since
//     Android 8 — we registered the channel from the mobile app at
//     boot).
//   - Truncate body to ~120 chars; iOS clamps long bodies to 4 lines
//     anyway and the preview UI on lock screen looks better short.
//   - Batch up to 100 tokens per HTTP request (Expo's limit).
//   - Best-effort fire-and-forget — never block the caller's API
//     response on the push send. We log failures and prune dead
//     tokens server-side (M6).
//
// Push payload contract:
//   `data.kind` is the routing key the mobile app uses to deep-link
//   the user. Keep in sync with packages/mobile/lib/push.ts handler.

import { db } from "@/lib/db";
import { pushTokens } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

export type PushKind =
  | "booking_new"
  | "booking_accepted"
  | "booking_rejected"
  | "booking_confirmed_by_client"
  | "booking_price_proposed"
  | "booking_completed"
  | "message_new"
  | "review_new"
  | "event_upcoming";

interface ExpoMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: "default";
  priority?: "default" | "normal" | "high";
  badge?: number;
  channelId?: string;
}

interface SendOptions {
  /** Database user id whose registered devices we should push to. */
  userId: string;
  title: string;
  body: string;
  /** Routing key + entity id. Determines which screen the mobile
   *  app opens when the user taps the notification. */
  data: { kind: PushKind; id?: number } & Record<string, unknown>;
  /** Optional badge count (iOS). */
  badge?: number;
}

/**
 * Send a push to every device the user has registered. Fire-and-forget
 * by design — the caller awaits this if they want to (e.g., cron) but
 * it shouldn't block an HTTP response. Errors are caught + logged.
 */
export async function sendPushToUser(opts: SendOptions): Promise<void> {
  try {
    const tokens = await db
      .select({ token: pushTokens.expoToken })
      .from(pushTokens)
      .where(eq(pushTokens.userId, opts.userId));

    if (tokens.length === 0) return;

    const body = truncate(opts.body, 120);
    const messages: ExpoMessage[] = tokens.map((t) => ({
      to: t.token,
      title: opts.title,
      body,
      data: opts.data,
      sound: "default",
      priority: "high",
      badge: opts.badge,
      channelId: "default",
    }));

    // Expo accepts up to 100 messages per HTTP request.
    for (let i = 0; i < messages.length; i += 100) {
      const batch = messages.slice(i, i + 100);
      await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Accept-encoding": "gzip, deflate",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(batch),
        // 5s timeout — push must be fast or we skip it.
        signal: AbortSignal.timeout(5_000),
      }).catch((err) => {
        console.error("[push] expo send failed", err);
      });
    }
  } catch (err) {
    // Catch-all so a DB hiccup doesn't bring down the calling
    // endpoint. Push is best-effort by spec.
    console.error("[push] sendPushToUser failed", err);
  }
}

/**
 * Bulk variant — used by the cron that pings every user with an
 * upcoming event ~24h before the date. Avoids one round-trip per
 * userId.
 */
export async function sendPushToUsers(
  userIds: string[],
  msg: Omit<SendOptions, "userId">,
): Promise<void> {
  if (userIds.length === 0) return;
  try {
    const tokens = await db
      .select({ token: pushTokens.expoToken, userId: pushTokens.userId })
      .from(pushTokens)
      .where(inArray(pushTokens.userId, userIds));
    if (tokens.length === 0) return;

    const body = truncate(msg.body, 120);
    const messages: ExpoMessage[] = tokens.map((t) => ({
      to: t.token,
      title: msg.title,
      body,
      data: msg.data,
      sound: "default",
      priority: "high",
      channelId: "default",
    }));

    for (let i = 0; i < messages.length; i += 100) {
      const batch = messages.slice(i, i + 100);
      await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Accept-encoding": "gzip, deflate",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(batch),
        signal: AbortSignal.timeout(5_000),
      }).catch((err) => console.error("[push] expo bulk send failed", err));
    }
  } catch (err) {
    console.error("[push] sendPushToUsers failed", err);
  }
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + "…";
}
