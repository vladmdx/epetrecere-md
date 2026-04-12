// Email sent to the client after a completed booking, asking them to leave a review.

interface ReviewRequestProps {
  clientName: string;
  artistName: string;
  eventDate: string;
  reviewUrl: string;
}

export function reviewRequestEmail({
  clientName,
  artistName,
  eventDate,
  reviewUrl,
}: ReviewRequestProps): string {
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
      <h1 style="color:#FAF8F2;font-size:22px;margin:0 0 16px;">Cum a fost evenimentul?</h1>
      <p style="color:#A0A0B0;font-size:15px;line-height:1.6;margin:0 0 16px;">
        Salut <strong style="color:#FAF8F2;">${clientName}</strong>,
      </p>
      <p style="color:#A0A0B0;font-size:15px;line-height:1.6;margin:0 0 24px;">
        Sperăm că evenimentul tău din <strong style="color:#FAF8F2;">${eventDate}</strong> a fost de neuitat!
        Ne-ar bucura enorm dacă ai lăsa o recenzie pentru <strong style="color:#C9A84C;">${artistName}</strong>.
      </p>
      <p style="color:#A0A0B0;font-size:15px;line-height:1.6;margin:0 0 24px;">
        Recenzia ta ajută alți clienți să facă alegerea potrivită și îl motivează pe artist să continue la cel mai înalt nivel.
      </p>
      <div style="text-align:center;">
        <a href="${reviewUrl}" style="display:inline-block;background:#C9A84C;color:#0D0D0D;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:14px;">
          Lasă o Recenzie
        </a>
      </div>
      <p style="color:#6B6B7B;font-size:13px;text-align:center;margin:24px 0 0;">
        Durează mai puțin de un minut
      </p>
    </div>
    <p style="color:#6B6B7B;font-size:12px;text-align:center;margin-top:32px;">
      &copy; ${new Date().getFullYear()} ePetrecere.md &middot; Marketplace pentru Evenimente &middot; Republica Moldova
    </p>
  </div>
</body>
</html>`;
}
