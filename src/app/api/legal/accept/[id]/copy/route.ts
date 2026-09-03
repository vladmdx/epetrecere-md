import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { legalAcceptances, users } from "@/lib/db/schema";

const escape = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id < 1) return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  const [user] = await db.select().from(users).where(eq(users.clerkId, userId)).limit(1);
  const [doc] = await db.select().from(legalAcceptances).where(eq(legalAcceptances.id, id)).limit(1);
  if (!doc || !user || (doc.userId !== user.id && user.role !== "admin" && user.role !== "super_admin")) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (!doc.documentBlocks?.length) return NextResponse.json({ error: "historical_snapshot_unavailable" }, { status: 410 });
  const labels = doc.locale === "ru" ? ["Подписант", "Дата (UTC)", "IP-адрес", "Устройство", "Электронная подпись на экране, не квалифицированная", "Сохранённая копия подписанного документа"] : doc.locale === "en" ? ["Signed by", "Date (UTC)", "IP address", "Device", "On-screen electronic signature, not qualified", "Stored copy of the signed document"] : ["Semnat de", "Data (UTC)", "Adresă IP", "Dispozitiv", "Semnătură electronică desenată pe ecran, necalificată", "Copia păstrată a documentului semnat"];
  const html = `<!doctype html><html lang="${escape(doc.locale)}"><head><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><title>${escape(doc.documentTitle)}</title><style>body{max-width:800px;margin:40px auto;padding:0 24px;color:#17202a;font:15px/1.65 system-ui,sans-serif}h1{font-size:26px}h2{font-size:19px;margin-top:28px}header{border-bottom:2px solid #ba9536}small{color:#555}footer{margin-top:36px;padding-top:16px;border-top:1px solid #aaa;overflow-wrap:anywhere}img{width:220px;height:auto;background:white}p{white-space:pre-wrap}@media print{body{margin:0;max-width:none}h2{break-after:avoid}footer{break-inside:avoid}}</style></head><body><header><small>ePetrecere.md · ${escape(labels[5])} · #${id}</small><h1>${escape(doc.documentTitle)}</h1><p>v${escape(doc.documentVersion)} · ${escape(doc.locale.toUpperCase())}</p></header>${doc.documentBlocks.map(b => b.type === "h2" ? `<h2>${escape(b.text)}</h2>` : `<p>${escape(b.text)}</p>`).join("")}<footer><p><strong>${escape(labels[0])}: ${escape(doc.signatureName)}</strong><br>${escape(labels[1])}: ${escape(doc.acceptedAt.toISOString())}</p>${doc.signatureImage?.startsWith("data:image/png;base64,") ? `<img alt="${escape(labels[0])}" src="${escape(doc.signatureImage)}">` : ""}<p>${escape(labels[4])}</p><p>${escape(labels[2])}: ${escape(doc.ipAddress)}<br>${escape(labels[3])}: ${escape(doc.deviceSummary)}<br>User-Agent: ${escape(doc.userAgent)}<br>Email: ${escape(doc.email)}<br>Tel: ${escape(doc.phone)}<br>SHA-256: ${escape(doc.contentHash)}</p></footer></body></html>`;
  return new NextResponse(html, { headers: {
    "Content-Type": "text/html; charset=utf-8", "Content-Disposition": `attachment; filename="epetrecere-contract-${id}.html"`,
    "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox",
  }});
}
