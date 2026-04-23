// WhatsApp Business Cloud API helper.
//
// We send **session messages** when the user has opted in via a recent
// interaction (within 24h) and **template messages** otherwise. For this
// platform's use case — transactional booking/status notifications — we
// default to a template flow because the user may not have messaged us
// first.
//
// Env vars required:
//   WHATSAPP_ACCESS_TOKEN       — Meta system-user access token
//   WHATSAPP_PHONE_NUMBER_ID    — Phone number ID from WhatsApp Business
//   WHATSAPP_TEMPLATE_NAME      — (optional) approved template name, default "platform_notification"
//   WHATSAPP_TEMPLATE_LANG      — (optional) language code, default "ro"
//
// Meta template setup (one-time):
//   1. Go to WhatsApp Manager → Message Templates
//   2. Create template category = "UTILITY"
//   3. Name: platform_notification (or set WHATSAPP_TEMPLATE_NAME)
//   4. Body: "{{1}}\n\n{{2}}\n\nVezi detalii: {{3}}"
//      (3 placeholders: title, message, url)
//   5. Submit for approval (usually < 1h)
//
// Safe no-op if env vars aren't set or the recipient's phone is null.

import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const META_API_VERSION = "v21.0";

interface WhatsAppPayload {
  title: string;
  body: string;
  actionUrl?: string;
}

/** Normalize a Moldovan phone to the E.164 format WhatsApp expects.
 *  Accepts "+3736…", "3736…", "06…", "6…" and returns "3736…" (no "+"). */
function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("373")) return digits;
  if (digits.startsWith("0")) return "373" + digits.slice(1);
  if (digits.length === 8) return "373" + digits; // local 8-digit
  return digits; // assume already E.164
}

function isConfigured(): boolean {
  return !!(
    process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID
  );
}

async function callMeta(phoneE164: string, payload: WhatsAppPayload) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN!;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID!;
  const templateName =
    process.env.WHATSAPP_TEMPLATE_NAME || "platform_notification";
  const language = process.env.WHATSAPP_TEMPLATE_LANG || "ro";
  const url = `https://graph.facebook.com/${META_API_VERSION}/${phoneId}/messages`;

  const body = {
    messaging_product: "whatsapp",
    to: phoneE164,
    type: "template",
    template: {
      name: templateName,
      language: { code: language },
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: payload.title.slice(0, 60) },
            { type: "text", text: payload.body.slice(0, 500) },
            {
              type: "text",
              text: payload.actionUrl || "https://epetrecere.md",
            },
          ],
        },
      ],
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`WhatsApp API ${res.status}: ${text.slice(0, 200)}`);
  }
  return await res.json();
}

/** Send a WhatsApp template notification to a user by their DB userId.
 *  Fire-and-forget from callers — logs errors, never throws. */
export async function sendWhatsAppToUser(
  userId: string,
  payload: WhatsAppPayload,
): Promise<{ sent: boolean; reason?: string }> {
  if (!isConfigured()) {
    return { sent: false, reason: "not-configured" };
  }

  const [user] = await db
    .select({ phone: users.phone })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const phone = normalizePhone(user?.phone);
  if (!phone) return { sent: false, reason: "no-phone" };

  try {
    await callMeta(phone, payload);
    return { sent: true };
  } catch (err) {
    console.error("[whatsapp] send failed", err);
    return { sent: false, reason: "api-error" };
  }
}

export function isWhatsAppConfigured(): boolean {
  return isConfigured();
}
