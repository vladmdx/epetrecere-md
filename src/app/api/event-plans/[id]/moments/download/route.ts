// Phase 3 — bulk ZIP download of every photo on a Photo Moments film.
//
// Endpoint returns a bounded ZIP archive to the owner so they can
// back up eligible photos. Owner-gated via
// requirePlanOwnership; guests never see this.
//
// Vercel Functions buffered responses are limited to 4.5 MB:
// https://vercel.com/docs/functions/limitations#request-body-size
// Reserve ZIP/README overhead and check the final size. This is a bounded
// best-effort export, not an unbounded fetch proxy or a streaming archive.

import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { eventPhotos, eventPlans } from "@/lib/db/schema";
import { requirePlanOwnership } from "@/lib/planner/ownership";
import { readManagedPhotoBytes } from "@/lib/moments/managed-photo";

const MAX_PHOTO_BYTES = 3.5 * 1024 * 1024;
const MAX_ARCHIVE_BYTES = 4 * 1024 * 1024;
const MAX_PHOTOS = 500;

/** Turn a guest name + photo id into a filesystem-safe filename so
 *  the ZIP unpacks cleanly on Windows/macOS/Linux. We keep the id at
 *  the end to dedupe identical guest names. */
function safeFilename(
  guestName: string | null,
  id: number,
  url: string,
): string {
  // Pull the extension from the URL — falls back to .jpg if we can't
  // tell. Only verified managed photo URLs reach this function.
  const dot = url.lastIndexOf(".");
  const qmark = url.indexOf("?", dot);
  const ext =
    dot > 0 && dot < (qmark === -1 ? url.length : qmark)
      ? url
          .slice(dot + 1, qmark === -1 ? undefined : qmark)
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "")
          .slice(0, 4)
      : "jpg";
  const safeExt = ext || "jpg";
  const base = (guestName ?? "guest")
    .normalize("NFKD")
    .replace(/[^\w\- ]+/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .slice(0, 40) || "guest";
  return `${String(id).padStart(4, "0")}_${base}.${safeExt}`;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const planId = Number(id);
  const owned = await requirePlanOwnership(planId);
  if (!owned.ok) {
    return NextResponse.json({ error: owned.error }, { status: owned.status });
  }

  // Pull the plan title so the ZIP filename is meaningful when the
  // owner saves it.
  const [plan] = await db
    .select({ title: eventPlans.title, eventDate: eventPlans.eventDate })
    .from(eventPlans)
    .where(eq(eventPlans.id, planId))
    .limit(1);
  if (!plan) {
    return NextResponse.json({ error: "Plan not found" }, { status: 404 });
  }

  // Owner sees every photo (approved or not) — they're moderating.
  const photos = await db
    .select({
      id: eventPhotos.id,
      url: eventPhotos.url,
      guestName: eventPhotos.guestName,
      guestMessage: eventPhotos.guestMessage,
      createdAt: eventPhotos.createdAt,
    })
    .from(eventPhotos)
    .where(eq(eventPhotos.planId, planId))
    .orderBy(desc(eventPhotos.createdAt))
    .limit(MAX_PHOTOS + 1);

  if (photos.length === 0) {
    return NextResponse.json(
      { error: "Nu există încă poze de descărcat." },
      { status: 404 },
    );
  }

  const zip = new JSZip();
  const folder = zip.folder("Photos") ?? zip;
  const captions: string[] = ["# Photo Moments — credits"];

  let totalBytes = 0;
  const skipped: number[] = [];
  const deadline = Date.now() + 20_000;
  for (const photo of photos) {
    if (totalBytes >= MAX_PHOTO_BYTES || Date.now() >= deadline || photo === photos[MAX_PHOTOS]) {
      skipped.push(photo.id);
      continue;
    }
    const remaining = MAX_PHOTO_BYTES - totalBytes;
    const buf = await readManagedPhotoBytes(photo.url, owned.plan, remaining, Math.max(1, Math.min(8_000, deadline - Date.now())));
    if (!buf) {
      skipped.push(photo.id);
      continue;
    }
    const name = safeFilename(photo.guestName, photo.id, photo.url);
    folder.file(name, buf);
    totalBytes += buf.byteLength;
    captions.push(
      `${name}\t${(photo.guestName ?? "(necunoscut)").slice(0, 60)}\t${
        photo.guestMessage ? `"${photo.guestMessage.slice(0, 280).replace(/"/g, "'")}"` : ""
      }`,
    );
  }

  if (skipped.length > 0) {
    captions.push(
      "",
      `# ${skipped.length} poze au fost omise: proveniență neverificată, limită de dimensiune sau indisponibilitate.`,
      `# Acestea sunt: ${skipped.join(", ")}`,
      `# Le poți descărca individual din /cabinet/moments/${planId}.`,
    );
  }
  zip.file("_README.txt", [
    "Photo Moments - export parțial / partial export / частичный экспорт",
    "Fișierele vechi cu proveniență neverificată sunt păstrate în galerie, dar nu sunt descărcate de server.",
    "Legacy files with unverified ownership remain in the gallery but are not fetched by the server.",
    "Старые файлы с неподтвержденным происхождением остаются в галерее, но не скачиваются сервером.",
    "ZIP < 4 MiB; photos <= 3.5 MiB; maximum 500 records; time-limited export.",
    `Skipped record IDs: ${skipped.join(", ") || "none"}`,
    photos.length > MAX_PHOTOS ? "Additional records beyond the first 500 were not inspected." : "",
  ].join("\n"));
  zip.file("CREDITS.txt", captions.join("\n"));

  // Buffered generation is safe only because inputs and final output are capped.
  const blob = await zip.generateAsync({
    // ArrayBuffer is the cleanest payload to hand to Response — Edge
    // and Node runtimes both accept it without further conversion,
    // unlike the uint8array variant whose typing trips up Response.
    type: "arraybuffer",
    compression: "STORE", // JPEGs are already compressed; STORE is faster.
  });
  if (blob.byteLength > MAX_ARCHIVE_BYTES) {
    return NextResponse.json({ error: "Archive exceeds the safe download limit" }, { status: 413 });
  }

  const slugifyTitle = (s: string) =>
    s
      .normalize("NFKD")
      .replace(/[^\w\- ]+/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .toLowerCase()
      .slice(0, 60) || "photo-moments";
  const filename = `${slugifyTitle(plan.title)}-${
    plan.eventDate ?? new Date().toISOString().slice(0, 10)
  }.zip`;

  return new Response(blob, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
