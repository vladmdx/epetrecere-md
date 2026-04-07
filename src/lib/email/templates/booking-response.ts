interface BookingResponseProps {
  clientName: string;
  artistName: string;
  eventDate: string;
  status: "accepted" | "rejected";
  reply: string;
}

export function bookingResponseEmail({ clientName, artistName, eventDate, status, reply }: BookingResponseProps): string {
  const isAccepted = status === "accepted";
  const statusText = isAccepted ? "ACCEPTATĂ" : "REFUZATĂ";
  const statusColor = isAccepted ? "#4CAF50" : "#E74C3C";

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
      <h1 style="color:#FAF8F2;font-size:20px;margin:0 0 8px;">Rezervarea ta a fost ${statusText}</h1>
      <p style="color:${statusColor};font-size:14px;margin:0 0 24px;font-weight:bold;">${statusText}</p>
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="color:#A0A0B0;padding:8px 0;font-size:14px;">Artist</td><td style="color:#C9A84C;padding:8px 0;font-size:14px;text-align:right;font-weight:bold;">${artistName}</td></tr>
        <tr><td style="color:#A0A0B0;padding:8px 0;font-size:14px;">Data</td><td style="color:#FAF8F2;padding:8px 0;font-size:14px;text-align:right;">${eventDate}</td></tr>
      </table>
      <div style="margin-top:20px;padding:16px;background:rgba(255,255,255,0.05);border-radius:8px;">
        <p style="color:#A0A0B0;font-size:12px;margin:0 0 4px;">Mesajul artistului:</p>
        <p style="color:#FAF8F2;font-size:14px;margin:0;">${reply}</p>
      </div>
      ${isAccepted ? `
      <div style="text-align:center;margin-top:24px;">
        <a href="https://epetrecere.md/cabinet" style="display:inline-block;background:#C9A84C;color:#0D0D0D;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:14px;">
          Deschide Cabinetul →
        </a>
      </div>` : ""}
    </div>
  </div>
</body>
</html>`;
}
