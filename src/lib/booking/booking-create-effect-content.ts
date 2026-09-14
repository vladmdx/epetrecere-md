import { escapeHtml } from "@/lib/email/escape";

export type BookingEffectContent = {
  clientName: string;
  partnerName: string;
  eventType: string | null;
  eventDate: string;
  startTime: string | null;
  endTime: string | null;
};

/** HTML fragment accepted by notificationEmail; every dynamic value is escaped. */
export function bookingAdminNotificationMessage(
  input: BookingEffectContent,
): string {
  const clientName = escapeHtml(input.clientName);
  const partnerName = escapeHtml(input.partnerName);
  const eventType = escapeHtml(input.eventType ?? "Nespecificat");
  const eventDate = escapeHtml(input.eventDate);
  const startTime = escapeHtml(input.startTime);
  const endTime = escapeHtml(input.endTime);
  const time = input.startTime
    ? ` · Ora: ${startTime}${input.endTime ? `–${endTime}` : ""}`
    : "";

  return `<strong>${clientName}</strong> a trimis o cerere pentru <strong>${partnerName}</strong>.<br>Eveniment: ${eventType} · Data: ${eventDate}${time}`;
}

export function bookingAutoReplyEmailHtml(input: {
  clientName: string;
  partnerName: string;
  autoReplyMessage: string;
  eventDate: string;
}): string {
  const clientName = escapeHtml(input.clientName);
  const partnerName = escapeHtml(input.partnerName);
  const autoReplyMessage = escapeHtml(input.autoReplyMessage).replace(
    /\r?\n/g,
    "<br/>",
  );
  const eventDate = escapeHtml(input.eventDate);

  return `
    <div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111">
      <h2 style="margin:0 0 16px;font-size:20px">Salut ${clientName},</h2>
      <p style="margin:0 0 16px;line-height:1.5">Îți mulțumim pentru cerere! Mesaj din partea <strong>${partnerName}</strong>:</p>
      <div style="padding:16px;border-left:4px solid #d4a574;background:#fafafa;margin:0 0 16px;line-height:1.5">${autoReplyMessage}</div>
      <p style="margin:0 0 8px;color:#666;font-size:13px">Data evenimentului: ${eventDate}</p>
      <p style="margin:0;color:#666;font-size:13px">Acest mesaj a fost generat automat de ePetrecere.md</p>
    </div>
  `;
}
