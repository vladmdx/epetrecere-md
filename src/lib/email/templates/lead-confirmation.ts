interface LeadConfirmationProps {
  name: string;
  eventType: string;
  eventDate: string;
}

export function leadConfirmationEmail({ name, eventType, eventDate }: LeadConfirmationProps): string {
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
      <h1 style="color:#FAF8F2;font-size:22px;margin:0 0 16px;">Mulțumim, ${name}!</h1>
      <p style="color:#A0A0B0;font-size:15px;line-height:1.6;margin:0 0 24px;">
        Am primit solicitarea ta pentru <strong style="color:#C9A84C;">${eventType}</strong> pe data de <strong style="color:#C9A84C;">${eventDate}</strong>.
      </p>
      <p style="color:#A0A0B0;font-size:15px;line-height:1.6;margin:0 0 24px;">
        Echipa noastră te va contacta în cel mult 24 de ore cu cele mai bune opțiuni.
      </p>
      <div style="text-align:center;">
        <a href="https://epetrecere.md" style="display:inline-block;background:#C9A84C;color:#0D0D0D;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:14px;">
          Vizitează ePetrecere.md
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
