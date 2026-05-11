// Phase 3 — bulk ZIP download of every photo on a Photo Moments film.
//
// Endpoint streams a single ZIP archive back to the owner so they can
// keep a permanent backup of the night in one click. Owner-gated via
// requirePlanOwnership; guests never see this.
//
// JSZip generates the archive in-memory. For a typical wedding (~150
// photos × ~3MB each) we're looking at ~450MB of buffered data — fine
// on Vercel's 50MB response limit? Actually NO. To stay under the
// 50MB Lambda response cap we cap the included photos and skip any
// that fail to fetch quickly. For larger galleries the owner gets a
// best-effort archive with a `_README.txt` listing skipped ones; we
// can graduate to a streaming worker if this becomes a real bottleneck.

import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { eventPhotos, eventPlans } from "@/lib/db/schema";
import { requirePlanOwnership } from "@/lib/planner/ownership";

/** How long a single photo fetch may take before we give up and skip
 *  it. Keeps a slow CDN node from blocking the whole archive. */
const FETCH_TIMEOUT_MS = 12_000;

/** Hard cap on bytes packed into one archive — close to the 50MB
 *  Vercel response ceiling with headroom. Galleries above this get
 *  the README warning. */
const MAX_ARCHIVE_BYTES = 40 * 1024 * 1024;

async function fetchWithTimeout(url: string): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return await res.arrayBuffer();
  } catch {
    return null;
  }
}

/** Turn a guest name + photo id into a filesystem-safe filename so
 *  the ZIP unpacks cleanly on Windows/macOS/Linux. We keep the id at
 *  the end to dedupe identical guest names. */
function safeFilename(
  guestName: string | null,
  id: number,
  url: string,
): string {
  // Pull the extension from the URL — falls back to .jpg if we can't
  // tell. Photos come from our own /api/upload which always serves
  // jpg/png/webp.
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
    .orderBy(desc(eventPhotos.createdAt));

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
  for (const photo of photos) {
    if (totalBytes >= MAX_ARCHIVE_BYTES) {
      skipped.push(photo.id);
      continue;
    }
    const buf = await fetchWithTimeout(photo.url);
    if (!buf) {
      skipped.push(photo.id);
      continue;
    }
    if (totalBytes + buf.byteLength > MAX_ARCHIVE_BYTES) {
      skipped.push(photo.id);
      continue;
    }
    const name = safeFilename(photo.guestName, photo.id, photo.url);
    folder.file(name, buf);
    totalBytes += buf.byteLength;
    captions.push(
      `${name}\t${photo.guestName ?? "(necunoscut)"}\t${
        photo.guestMessage ? `"${photo.guestMessage.replace(/"/g, "'")}"` : ""
      }`,
    );
  }

  if (skipped.length > 0) {
    captions.push(
      "",
      `# ${skipped.length} poze au depășit limita de 40MB sau nu au putut fi descărcate.`,
      `# Acestea sunt: ${skipped.join(", ")}`,
      `# Le poți descărca individual din /cabinet/moments/${planId}.`,
    );
  }
  zip.file("CREDITS.txt", captions.join("\n"));

  // Streamed generation — slightly slower than a single buffer but
  // keeps memory bounded for big galleries.
  const blob = await zip.generateAsync({
    // ArrayBuffer is the cleanest payload to hand to Response — Edge
    // and Node runtimes both accept it without further conversion,
    // unlike the uint8array variant whose typing trips up Response.
    type: "arraybuffer",
    compression: "STORE", // JPEGs are already compressed; STORE is faster.
  });

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
