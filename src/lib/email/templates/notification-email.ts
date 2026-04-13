/** Universal notification email template with dark theme and gold accents. */
export function notificationEmail(opts: {
  title: string;
  message: string;
  ctaUrl?: string;
  ctaText?: string;
  emoji?: string;
}): string {
  const cta = opts.ctaUrl
    ? `<div style="text-align:center;margin-top:24px;">
        <a href="${opts.ctaUrl}" style="display:inline-block;background:#C9A84C;color:#0D0D0D;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:14px;">
          ${opts.ctaText || "Deschide →"}
        </a>
      </div>`
    : "";

  const emojiBlock = opts.emoji
    ? `<div style="text-align:center;margin-bottom:16px;font-size:40px;">${opts.emoji}</div>`
    : "";

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#0D0D0D;font-family:'Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:40px 20px;">
    <div style="text-align:center;margin-bottom:32px;">
      <span style="color:#C9A84C;font-size:24px;font-weight:bold;">ePetrecere.md</span>
    </div>
    <div style="background:#1A1A2E;border-radius:12px;padding:32px;border:1px solid rgba(201,168,76,0.15);">
      ${emojiBlock}
      <h1 style="color:#FAF8F2;font-size:20px;margin:0 0 16px;text-align:center;">${opts.title}</h1>
      <p style="color:#B0B0C0;font-size:15px;line-height:1.6;text-align:center;margin:0;">${opts.message}</p>
      ${cta}
    </div>
    <p style="color:#666;font-size:12px;text-align:center;margin-top:24px;">
      ePetrecere.md — Marketplace pentru Evenimente
    </p>
  </div>
</body></html>`;
}
