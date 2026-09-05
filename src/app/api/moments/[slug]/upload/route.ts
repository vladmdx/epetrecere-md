import { createHmac, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import sharp from "sharp";
import { z } from "zod/v4";
import { db } from "@/lib/db";
import { eventPhotos, eventPlans } from "@/lib/db/schema";
import { requestHasMomentsAccess } from "@/lib/moments/access";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
const CONSENT_VERSION = "moments-photo-2026-09-05.1";
const MAX_BYTES = 10 * 1024 * 1024;

const fieldsSchema = z.object({
  guestName: z.string().trim().min(1).max(60),
  guestMessage: z.string().trim().max(280).optional(),
  deviceId: z.string().min(6).max(80),
  prompt: z.string().max(80).optional(),
  tableLabel: z.string().max(40).optional(),
  rightsConfirmed: z.literal("true"),
  subjectCapacity: z.enum(["adult", "guardian"]),
});

function ipHash(ip: string): string {
  const key = process.env.MOMENTS_ACCESS_SECRET || process.env.GUEST_DATA_ENCRYPTION_KEY || "local";
  return createHmac("sha256", key).update(ip).digest("hex");
}

async function storeImage(buffer: Buffer, slug: string): Promise<string> {
  const filename = `${Date.now()}-${randomUUID()}.webp`;
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const { put } = await import("@vercel/blob");
    const blob = await put(`moments/${slug}/${filename}`, buffer, {
      access: "public",
      contentType: "image/webp",
      addRandomSuffix: false,
    });
    return blob.url;
  }
  const directory = path.join(process.cwd(), "public", "uploads", "moments", slug);
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, filename), buffer);
  return `/uploads/moments/${slug}/${filename}`;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  if (!requestHasMomentsAccess(req, slug)) {
    return NextResponse.json({ error: "Access code required" }, { status: 401 });
  }
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
  const limited = await rateLimit(`moments-upload:${ip}:${slug}`, 20, 60_000);
  if (!limited.success) {
    return NextResponse.json({ error: "Too many uploads" }, { status: 429 });
  }

  const [plan] = await db
    .select({
      id: eventPlans.id,
      enabled: eventPlans.momentsEnabled,
      openAt: eventPlans.momentsOpenAt,
      closeAt: eventPlans.momentsCloseAt,
      shotLimit: eventPlans.momentsShotLimit,
      prompts: eventPlans.momentsPrompts,
      tables: eventPlans.momentsTables,
    })
    .from(eventPlans)
    .where(eq(eventPlans.momentsSlug, slug))
    .limit(1);
  if (!plan?.enabled) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const now = new Date();
  if (plan.openAt && now < plan.openAt) return NextResponse.json({ error: "Upload not open" }, { status: 403 });
  if (plan.closeAt && now >= plan.closeAt) return NextResponse.json({ error: "Upload closed" }, { status: 403 });

  const form = await req.formData();
  const file = form.get("file");
  const parsed = fieldsSchema.safeParse({
    guestName: form.get("guestName"),
    guestMessage: form.get("guestMessage") || undefined,
    deviceId: form.get("deviceId"),
    prompt: form.get("prompt") || undefined,
    tableLabel: form.get("tableLabel") || undefined,
    rightsConfirmed: form.get("rightsConfirmed"),
    subjectCapacity: form.get("subjectCapacity"),
  });
  if (!parsed.success || !(file instanceof File)) {
    return NextResponse.json({ error: "Consent and image are required" }, { status: 400 });
  }
  if (file.size <= 0 || file.size > MAX_BYTES || !file.type.startsWith("image/")) {
    return NextResponse.json({ error: "Unsupported image or file too large" }, { status: 400 });
  }

  if (plan.shotLimit) {
    const [used] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(eventPhotos)
      .where(and(eq(eventPhotos.planId, plan.id), eq(eventPhotos.deviceId, parsed.data.deviceId)));
    if ((used?.count ?? 0) >= plan.shotLimit) {
      return NextResponse.json({ error: "Shot limit reached" }, { status: 429 });
    }
  }

  let cleaned: Buffer;
  try {
    // rotate() honors orientation before the metadata is stripped. No
    // withMetadata() call is intentional: EXIF, GPS and camera identifiers
    // are omitted from the produced WebP.
    cleaned = await sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 40_000_000 })
      .rotate()
      .resize({ width: 3000, height: 3000, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 88 })
      .toBuffer();
  } catch {
    return NextResponse.json({ error: "Image could not be processed" }, { status: 400 });
  }

  const prompt = parsed.data.prompt && plan.prompts?.includes(parsed.data.prompt)
    ? parsed.data.prompt
    : null;
  const tableLabel = parsed.data.tableLabel && plan.tables?.includes(parsed.data.tableLabel)
    ? parsed.data.tableLabel
    : null;
  const url = await storeImage(cleaned, slug);
  const [photo] = await db
    .insert(eventPhotos)
    .values({
      planId: plan.id,
      url,
      guestName: parsed.data.guestName,
      guestMessage: parsed.data.guestMessage || null,
      source: "guest",
      deviceId: parsed.data.deviceId,
      prompt,
      tableLabel,
      isApproved: false,
      isPublic: false,
      uploadConsentAt: now,
      uploadConsentVersion: `${CONSENT_VERSION}:${parsed.data.subjectCapacity}`,
      uploaderIpHash: ipHash(ip),
    })
    .returning({ id: eventPhotos.id });

  return NextResponse.json(
    { id: photo.id, url, pendingModeration: true, canDelete: true },
    { status: 201, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } },
  );
}
