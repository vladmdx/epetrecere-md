// Web Push helper — wraps the `web-push` lib with graceful degradation
// when VAPID keys aren't configured (local dev, preview envs).
//
// Payload is intentionally small: title + body + optional actionUrl + tag.
// The service worker (/sw.js) does the rendering. Payload size limit is
// ~4KB so we truncate body at 500 chars.
//
// Env vars needed:
//   NEXT_PUBLIC_VAPID_PUBLIC_KEY  — exposed to browser for subscribe
//   VAPID_PRIVATE_KEY             — server-only signing key
//   VAPID_SUBJECT                 — mailto:... or https://... contact

import webpush from "web-push";
import { request as httpsRequest } from "node:https";
import { db } from "@/lib/db";
import { pushSubscriptions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

let configured = false;

function ensureConfigured(): boolean {
  if (configured) return true;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!pub || !priv || !subject) {
    return false;
  }
  try {
    webpush.setVapidDetails(subject, pub, priv);
    configured = true;
    return true;
  } catch (err) {
    console.error("[push] VAPID config invalid", err);
    return false;
  }
}

export interface PushPayload {
  title: string;
  body?: string;
  /** URL to navigate to when the user clicks the notification. */
  actionUrl?: string;
  /** Optional tag — replaces previous notification with the same tag. */
  tag?: string;
}

async function sendAbortableWebPush(
  subscription: Parameters<typeof webpush.generateRequestDetails>[0],
  payload: string,
  options: { timeoutMs: number; signal?: AbortSignal },
): Promise<void> {
  options.signal?.throwIfAborted();
  const details = webpush.generateRequestDetails(subscription, payload);

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (error?: unknown) => {
      if (settled) return;
      settled = true;
      if (error) reject(error);
      else resolve();
    };
    const request = httpsRequest(
      details.endpoint,
      {
        method: details.method,
        headers: details.headers,
        timeout: options.timeoutMs,
        // Node destroys the ClientRequest when this signal aborts. This is a
        // real transport cancellation, unlike web-push's socket-idle timeout.
        signal: options.signal,
      },
      (response) => {
        let responseText = "";
        response.setEncoding("utf8");
        response.on("data", (chunk: string) => {
          // Provider diagnostics are never persisted. Bound them anyway so a
          // hostile endpoint cannot grow memory while the barrier is held.
          if (responseText.length < 8_192) {
            responseText += chunk.slice(0, 8_192 - responseText.length);
          }
        });
        response.on("end", () => {
          const statusCode = response.statusCode ?? 0;
          if (statusCode >= 200 && statusCode <= 299) {
            finish();
            return;
          }
          finish(Object.assign(
            new Error("Received unexpected web-push response code"),
            {
              statusCode,
              headers: response.headers,
              body: responseText,
              endpoint: details.endpoint,
            },
          ));
        });
        response.on("error", finish);
      },
    );
    request.on("timeout", () => {
      request.destroy(new Error("Web-push socket timeout"));
    });
    request.on("error", finish);
    if (details.body) request.write(details.body);
    request.end();
  });
}

/** Send a push notification to ALL of a user's active subscriptions.
 *  Dead subscriptions (404/410) are pruned automatically. */
export async function sendPushToUser(
  userId: string,
  payload: PushPayload,
  options: { timeoutMs?: number; signal?: AbortSignal; executor?: typeof db } = {},
): Promise<{ sent: number; pruned: number; failed: number }> {
  if (!ensureConfigured()) return { sent: 0, pruned: 0, failed: 0 };
  options.signal?.throwIfAborted();

  const executor = options.executor ?? db;
  const subs = await executor
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId));

  if (subs.length === 0) return { sent: 0, pruned: 0, failed: 0 };

  const body = JSON.stringify({
    title: payload.title,
    body: (payload.body || "").slice(0, 500),
    actionUrl: payload.actionUrl || "/",
    tag: payload.tag,
  });

  let sent = 0;
  let pruned = 0;
  let failed = 0;
  const deadEndpoints: string[] = [];

  await Promise.all(
    subs.map(async (s) => {
      try {
        await sendAbortableWebPush(
          {
            endpoint: s.endpoint,
            keys: { p256dh: s.p256dh, auth: s.auth },
          },
          body,
          {
            timeoutMs: options.timeoutMs ?? 15_000,
            signal: options.signal,
          },
        );
        sent += 1;
      } catch (err) {
        const statusCode = (err as { statusCode?: number })?.statusCode;
        // 404 / 410 = subscription permanently invalid — clean up
        if (statusCode === 404 || statusCode === 410) {
          deadEndpoints.push(s.endpoint);
          pruned += 1;
        } else if (options.signal?.aborted) {
          failed += 1;
        } else {
          failed += 1;
          console.error("[push] send failed", statusCode, err);
        }
      }
    }),
  );

  options.signal?.throwIfAborted();

  if (deadEndpoints.length > 0) {
    // Delete dead rows. `inArray` would work but we'd need to import it;
    // a single OR'd delete via raw SQL is just as concise.
    for (const e of deadEndpoints) {
      await executor
        .delete(pushSubscriptions)
        .where(eq(pushSubscriptions.endpoint, e));
    }
  }

  return { sent, pruned, failed };
}

export function isPushConfigured(): boolean {
  return ensureConfigured();
}
