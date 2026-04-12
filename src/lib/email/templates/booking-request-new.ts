// Email sent to the artist/venue when a new booking request arrives.
// Gives them a heads-up with the key details + a CTA to the dashboard.

interface BookingRequestNewProps {
  vendorName: string;
  clientName: string;
  eventType: string | null;
  eventDate: string | null;
  message: string | null;
}

export function bookingRequestNewEmail({
  vendorName,
  clientName,
  eventType,
  eventDate,
  message,
}: BookingRequestNewProps): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#0D0D0D;font-family:'Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:40px 20px;">
    <div style="text-align:center;margin-bottom:32px;">
      <span style="color:#C9A84C;font-size:24px;font-weight:bold;">ePetrecere.md</span>
    </div>
    <div style="background:#1A1A2E;border-radius:12px;padding:32px;border:1px solid rgba(201,168,76,0.15);">
      <h1 style="color:#FAF8F2;font-size:22px;margin:0 0 16px;">Cerere nouă de rezervare!</h1>
      <p style="color:#A0A0B0;font-size:15px;line-height:1.6;margin:0 0 16px;">
        Salut <strong style="color:#FAF8F2;">${vendorName}</strong>,
      </p>
      <p style="color:#A0A0B0;font-size:15px;line-height:1.6;margin:0 0 24px;">
        Ai primit o cerere de rezervare de la <strong style="color:#C9A84C;">${clientName}</strong>.
      </p>
      <div style="background:rgba(201,168,76,0.08);border-radius:8px;padding:16px;margin:0 0 24px;border-left:3px solid #C9A84C;">
        ${eventType ? `<p style="color:#D4D4E0;font-size:14px;margin:0 0 8px;"><strong>Eveniment:</strong> ${eventType}</p>` : ""}
        ${eventDate ? `<p style="color:#D4D4E0;font-size:14px;margin:0 0 8px;"><strong>Data:</strong> ${eventDate}</p>` : ""}
        ${message ? `<p style="color:#D4D4E0;font-size:14px;margin:0;"><strong>Mesaj:</strong> ${message}</p>` : ""}
      </div>
      <p style="color:#A0A0B0;font-size:15px;line-height:1.6;margin:0 0 24px;">
        Responderea rapidă crește semnificativ șansele de confirmare. Te rugăm să accepți sau să refuzi cererea din dashboard.
      </p>
      <div style="text-align:center;">
        <a href="https://epetrecere.md/dashboard/rezervari" style="display:inline-block;background:#C9A84C;color:#0D0D0D;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:14px;">
          Vezi Rezervările
        </a>
      </div>
    </div>
    <p style="color:#6B6B7B;font-size:12px;text-align:center;margin-top:32px;">
      © ${new Date().getFullYear()} ePetrecere.md · Marketplace pentru Evenimente · Republica Moldova
    </p>
  </div>
</body>
</html>`;
}
