interface AdminNotificationProps {
  leadName: string;
  phone: string;
  email?: string;
  eventType: string;
  eventDate: string;
  location?: string;
  guestCount?: number;
  budget?: number;
  source: string;
  score: number;
}

export function adminNotificationEmail(props: AdminNotificationProps): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#0D0D0D;font-family:'Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:40px 20px;">
    <div style="text-align:center;margin-bottom:32px;">
      <span style="color:#C9A84C;font-size:24px;font-weight:bold;">ePetrecere.md</span>
      <span style="color:#A0A0B0;font-size:14px;display:block;margin-top:4px;">Admin Notification</span>
    </div>
    <div style="background:#1A1A2E;border-radius:12px;padding:32px;border:1px solid rgba(201,168,76,0.15);">
      <h1 style="color:#FAF8F2;font-size:20px;margin:0 0 8px;">🔔 Solicitare Nouă</h1>
      <p style="color:#C9A84C;font-size:14px;margin:0 0 24px;">Scor: ${props.score}/100 · Sursa: ${props.source}</p>

      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="color:#A0A0B0;padding:8px 0;font-size:14px;border-bottom:1px solid rgba(255,255,255,0.05);">Nume</td><td style="color:#FAF8F2;padding:8px 0;font-size:14px;border-bottom:1px solid rgba(255,255,255,0.05);text-align:right;font-weight:bold;">${props.leadName}</td></tr>
        <tr><td style="color:#A0A0B0;padding:8px 0;font-size:14px;border-bottom:1px solid rgba(255,255,255,0.05);">Telefon</td><td style="color:#FAF8F2;padding:8px 0;font-size:14px;border-bottom:1px solid rgba(255,255,255,0.05);text-align:right;">${props.phone}</td></tr>
        ${props.email ? `<tr><td style="color:#A0A0B0;padding:8px 0;font-size:14px;border-bottom:1px solid rgba(255,255,255,0.05);">Email</td><td style="color:#FAF8F2;padding:8px 0;font-size:14px;border-bottom:1px solid rgba(255,255,255,0.05);text-align:right;">${props.email}</td></tr>` : ""}
        <tr><td style="color:#A0A0B0;padding:8px 0;font-size:14px;border-bottom:1px solid rgba(255,255,255,0.05);">Eveniment</td><td style="color:#C9A84C;padding:8px 0;font-size:14px;border-bottom:1px solid rgba(255,255,255,0.05);text-align:right;font-weight:bold;">${props.eventType}</td></tr>
        <tr><td style="color:#A0A0B0;padding:8px 0;font-size:14px;border-bottom:1px solid rgba(255,255,255,0.05);">Data</td><td style="color:#FAF8F2;padding:8px 0;font-size:14px;border-bottom:1px solid rgba(255,255,255,0.05);text-align:right;">${props.eventDate}</td></tr>
        ${props.location ? `<tr><td style="color:#A0A0B0;padding:8px 0;font-size:14px;border-bottom:1px solid rgba(255,255,255,0.05);">Locație</td><td style="color:#FAF8F2;padding:8px 0;font-size:14px;border-bottom:1px solid rgba(255,255,255,0.05);text-align:right;">${props.location}</td></tr>` : ""}
        ${props.guestCount ? `<tr><td style="color:#A0A0B0;padding:8px 0;font-size:14px;border-bottom:1px solid rgba(255,255,255,0.05);">Invitați</td><td style="color:#FAF8F2;padding:8px 0;font-size:14px;border-bottom:1px solid rgba(255,255,255,0.05);text-align:right;">${props.guestCount}</td></tr>` : ""}
        ${props.budget ? `<tr><td style="color:#A0A0B0;padding:8px 0;font-size:14px;">Buget</td><td style="color:#C9A84C;padding:8px 0;font-size:14px;text-align:right;font-weight:bold;">${props.budget}€</td></tr>` : ""}
      </table>

      <div style="text-align:center;margin-top:24px;">
        <a href="https://epetrecere.md/admin/crm" style="display:inline-block;background:#C9A84C;color:#0D0D0D;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:14px;">
          Deschide în CRM →
        </a>
      </div>
    </div>
  </div>
</body>
</html>`;
}
