interface RegistrationStatusProps {
  name: string;
  type: "artist" | "venue";
  approved: boolean;
}

export function registrationStatusEmail(props: RegistrationStatusProps): string {
  const typeLabel = props.type === "artist" ? "artistul" : "sala";
  const emoji = props.approved ? "🎉" : "😔";
  const statusColor = props.approved ? "#22c55e" : "#ef4444";
  const statusText = props.approved ? "APROBAT" : "REFUZAT";

  const message = props.approved
    ? `Felicitări! Profilul <strong>${props.name}</strong> a fost verificat și aprobat de echipa noastră. Acum ${typeLabel} tău este vizibil pe platforma ePetrecere.md și poți primi cereri de ofertă.`
    : `Din păcate, profilul <strong>${props.name}</strong> nu a fost aprobat de echipa noastră. Dacă consideri că este o greșeală, te rugăm să ne contactezi.`;

  const ctaUrl = props.approved
    ? "https://epetrecere.md/dashboard"
    : "https://epetrecere.md/contact";
  const ctaText = props.approved ? "Deschide Dashboard →" : "Contactează-ne →";

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
      <div style="text-align:center;margin-bottom:24px;">
        <span style="font-size:48px;">${emoji}</span>
      </div>
      <h1 style="color:#FAF8F2;font-size:22px;margin:0 0 8px;text-align:center;">
        Înregistrare ${statusText}
      </h1>
      <div style="text-align:center;margin-bottom:24px;">
        <span style="display:inline-block;background:${statusColor}20;color:${statusColor};padding:4px 16px;border-radius:20px;font-size:13px;font-weight:bold;">
          ${statusText}
        </span>
      </div>
      <p style="color:#B0B0C0;font-size:15px;line-height:1.6;text-align:center;margin:0 0 24px;">
        ${message}
      </p>
      <div style="text-align:center;margin-top:24px;">
        <a href="${ctaUrl}" style="display:inline-block;background:#C9A84C;color:#0D0D0D;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:14px;">
          ${ctaText}
        </a>
      </div>
    </div>
    <p style="color:#666;font-size:12px;text-align:center;margin-top:24px;">
      Ai primit acest email deoarece ai un cont pe ePetrecere.md
    </p>
  </div>
</body>
</html>`;
}
