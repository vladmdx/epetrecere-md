import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { rateLimit } from "@/lib/rate-limit";
import path from "path";
import fs from "fs/promises";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { storeRegisteredBlob } from "@/lib/privacy/account-asset-erasure";
import {
  createServerLogCorrelationId,
  safeServerErrorLog,
} from "@/lib/safe-server-log";

export async function POST(req: NextRequest) {
  // Auth: require signed-in user to upload files
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const [appUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.clerkId, userId))
    .limit(1);
  if (!appUser) {
    return NextResponse.json({ error: "User not found" }, { status: 403 });
  }

  const ip = req.headers.get("x-forwarded-for") || "anonymous";
  const { success } = await rateLimit(`upload:${ip}`, 30, 60_000);
  if (!success) {
    return NextResponse.json({ error: "Too many uploads" }, { status: 429 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const allowedFolders = new Set([
    "uploads",
    "artists",
    "venues",
    "blog",
    "avatars",
    "invitations",
    "categories",
  ]);
  const rawFolder = (formData.get("folder") as string) || "uploads";
  const folder = allowedFolders.has(rawFolder) ? rawFolder : "uploads";

  if (!file) {
    return NextResponse.json({ error: "No file" }, { status: 400 });
  }

  const allowedTypes = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "image/svg+xml",
    // PDFs are whitelisted only for the "venues" folder (digital menu uploads).
    ...(folder === "venues" ? ["application/pdf"] : []),
  ];
  if (!allowedTypes.includes(file.type)) {
    return NextResponse.json({ error: "File type not allowed" }, { status: 400 });
  }

  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json(
      { error: "File too large (max 10MB)" },
      { status: 400 },
    );
  }

  const filename = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

  // Try Vercel Blob first (production), fall back to local disk (dev)
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      const url = await storeRegisteredBlob({
        pathname: `${folder}/${filename}`,
        body: file,
        access: "public",
        ownerUserId: appUser.id,
        provenance: `public_upload:${folder}`,
      });
      return NextResponse.json({ url, filename: file.name });
    } catch (err) {
      console.error(
        "[upload] Vercel Blob upload failed",
        safeServerErrorLog(err, {
          correlationId: createServerLogCorrelationId(),
        }),
      );
      return NextResponse.json(
        { error: "Upload failed. Check Blob store configuration." },
        { status: 503 },
      );
    }
  }

  // Local fallback: save to public/uploads/<folder>/
  try {
    const uploadDir = path.join(process.cwd(), "public", "uploads", folder);
    await fs.mkdir(uploadDir, { recursive: true });

    const buffer = Buffer.from(await file.arrayBuffer());
    const filePath = path.join(uploadDir, filename);
    await fs.writeFile(filePath, buffer);

    const url = `/uploads/${folder}/${filename}`;
    return NextResponse.json({ url, filename: file.name });
  } catch (err) {
    console.error(
      "[upload] local upload failed",
      safeServerErrorLog(err, {
        correlationId: createServerLogCorrelationId(),
      }),
    );
    return NextResponse.json(
      { error: "Upload failed" },
      { status: 500 },
    );
  }
}
