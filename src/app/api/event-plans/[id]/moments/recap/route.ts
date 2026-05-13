// Phase 5/D3 — email recap.
//
// POST sends a single recap email to the owner with:
//   - Event title + date
//   - Total photo count, unique contributors, peak hour
//   - Up to 6 favorite (or most-recent) thumbnails inlined
//   - Deep links back to gallery, slideshow, collage, album, ZIP
//
// This is the manual-trigger MVP. A daily cron firing N days post-
// event is a later iteration — for now the owner taps the button
// when they want it.

import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { eventPhotos, eventPlans, users } from "@/lib/db/schema";
import { requirePlanOwnership } from "@/lib/planner/ownership";
import { sendEmail } from "@/lib/email/send";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const planId = Number(id);
  const owned = await requirePlanOwnership(planId);
  if (!owned.ok) {
    return NextResponse.json({ error: owned.error }, { status: owned.status });
  }

  // Pull plan + owner email in one go.
  const [plan] = await db
    .select({
      id: eventPlans.id,
      title: eventPlans.title,
      eventDate: eventPlans.eventDate,
      slug: eventPlans.momentsSlug,
      ownerEmail: users.email,
    })
    .from(eventPlans)
    .innerJoin(users, eq(users.id, eventPlans.userId))
    .where(eq(eventPlans.id, planId))
    .limit(1);
  if (!plan) {
    return NextResponse.json({ error: "Plan not found" }, { status: 404 });
  }
  if (!plan.ownerEmail) {
    return NextResponse.json(
      { error: "Nu am email pe contul tău — adaugă unul în Setări." },
      { status: 400 },
    );
  }

  const photos = await db
    .select({
      id: eventPhotos.id,
      url: eventPhotos.url,
      guestName: eventPhotos.guestName,
      isFavorite: eventPhotos.isFavorite,
      isApproved: eventPhotos.isApproved,
      deviceId: eventPhotos.deviceId,
      createdAt: eventPhotos.createdAt,
    })
    .from(eventPhotos)
    .where(eq(eventPhotos.planId, planId))
    .orderBy(desc(eventPhotos.createdAt));

  const approved = photos.filter((p) => p.isApproved !== false);
  const favorites = approved.filter((p) => p.isFavorite);
  const hero = (favorites.length > 0 ? favorites : approved).slice(0, 6);

  const devices = new Set<string>();
  const byHour = new Map<number, number>();
  for (const p of approved) {
    if (p.deviceId) devices.add(p.deviceId);
    const h = new Date(p.createdAt).getHours();
    byHour.set(h, (byHour.get(h) ?? 0) + 1);
  }
  const peak = [...byHour.entries()].sort((a, b) => b[1] - a[1])[0];
  const peakHour = peak ? `${String(peak[0]).padStart(2, "0")}:00` : "—";

  const dateLabel = plan.eventDate
    ? new Date(plan.eventDate + "T00:00:00").toLocaleDateString("ro-MD", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL || "https://epetrecere.md";
  const dashboardUrl = `${baseUrl}/cabinet/moments/${planId}`;
  const galleryUrl = plan.slug ? `${baseUrl}/moments/${plan.slug}` : null;

  // Inline-styled HTML — keeps the email tidy across Gmail / Outlook
  // / Apple Mail without pulling in a templating dep.
  const photosHtml = hero
    .map(
      (p) => `<td style="padding:4px;width:33%;vertical-align:top;">
        <img src="${p.url}" alt="${(p.guestName ?? "").replace(/"/g, "")}"
             style="width:100%;border-radius:6px;display:block;object-fit:cover;aspect-ratio:1/1;" />
      </td>`,
    )
    .join("");

  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#0D0D0D;font-family:-apple-system,BlinkMacSystemFont,sans-serif;color:#FAF8F2;">
    <div style="max-width:540px;margin:0 auto;padding:32px 20px;">
      <p style="text-transform:uppercase;letter-spacing:4px;font-size:11px;color:#C9A84C;margin:0 0 8px;">Photo Moments — recap</p>
      <h1 style="font-size:28px;font-weight:700;margin:0 0 4px;color:#FAF8F2;">${plan.title}</h1>
      ${dateLabel ? `<p style="font-size:13px;color:#B0B0C0;margin:0 0 24px;">${dateLabel}</p>` : ""}

      <div style="display:flex;gap:8px;margin-bottom:24px;flex-wrap:wrap;">
        <div style="flex:1;min-width:120px;background:#1A1A2E;border:1px solid #C9A84C33;border-radius:12px;padding:12px;">
          <p style="font-size:10px;text-transform:uppercase;letter-spacing:2px;color:#888;margin:0;">Cadre</p>
          <p style="font-size:24px;font-weight:700;color:#FAF8F2;margin:4px 0 0;">${approved.length}</p>
        </div>
        <div style="flex:1;min-width:120px;background:#1A1A2E;border:1px solid #C9A84C33;border-radius:12px;padding:12px;">
          <p style="font-size:10px;text-transform:uppercase;letter-spacing:2px;color:#888;margin:0;">Invitați</p>
          <p style="font-size:24px;font-weight:700;color:#FAF8F2;margin:4px 0 0;">${devices.size}</p>
        </div>
        <div style="flex:1;min-width:120px;background:#1A1A2E;border:1px solid #C9A84C33;border-radius:12px;padding:12px;">
          <p style="font-size:10px;text-transform:uppercase;letter-spacing:2px;color:#888;margin:0;">Vârf</p>
          <p style="font-size:24px;font-weight:700;color:#FAF8F2;margin:4px 0 0;">${peakHour}</p>
        </div>
      </div>

      ${
        hero.length > 0
          ? `<p style="font-size:13px;color:#B0B0C0;margin:0 0 8px;">${favorites.length > 0 ? "Cele ⭐ favorite ale tale" : "Cele mai recente cadre"}</p>
             <table cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;margin-bottom:24px;">
               <tr>${photosHtml.slice(0, photosHtml.length / 2 || photosHtml.length)}</tr>
               ${hero.length > 3 ? `<tr>${photosHtml.slice(photosHtml.length / 2)}</tr>` : ""}
             </table>`
          : ""
      }

      <a href="${dashboardUrl}"
         style="display:inline-block;background:#C9A84C;color:#0D0D0D;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:8px;margin:0 8px 8px 0;">
        Deschide galeria
      </a>
      ${
        galleryUrl
          ? `<a href="${galleryUrl}" style="display:inline-block;background:transparent;color:#C9A84C;text-decoration:none;padding:12px 24px;border:1px solid #C9A84C;border-radius:8px;margin:0 8px 8px 0;">Vezi linkul public</a>`
          : ""
      }

      <p style="font-size:11px;color:#666;margin:24px 0 0;line-height:1.5;">
        Trimis automat din panoul tău Photo Moments pe ePetrecere.md.
        Galeria rămâne disponibilă online — descarcă ZIP-ul sau printează
        colajul / albumul oricând.
      </p>
    </div>
  </body></html>`;

  try {
    await sendEmail({
      to: plan.ownerEmail,
      subject: `📸 Recap Photo Moments — ${plan.title}`,
      html,
    });
    return NextResponse.json({
      sent: true,
      to: plan.ownerEmail,
      photoCount: approved.length,
    });
  } catch (err) {
    console.error("[moments-recap] send failed", err);
    return NextResponse.json(
      { error: "Nu am putut trimite emailul. Încearcă din nou." },
      { status: 503 },
    );
  }
}
