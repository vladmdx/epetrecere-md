import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { rateLimit } from "@/lib/rate-limit";
import path from "path";
import fs from "fs/promises";

// Verify the real content by magic bytes — `file.type` is set by the client
// and is trivially spoofable (upload an HTML/JS payload labelled image/png).
// Returns the detected MIME, or null if the signature isn't a format we serve.
function sniffFileType(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  ) return "image/png";
  // GIF: "GIF8"
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38)
    return "image/gif";
  // WEBP: "RIFF"...."WEBP"
  if (
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) return "image/webp";
  // PDF: "%PDF-"
  if (
    buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46 &&
    buf[4] === 0x2d
  ) return "application/pdf";
  return null;
}

export async function POST(req: NextRequest) {
  // Auth: require signed-in user to upload files
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

  // SVG is intentionally NOT allowed: it can carry <script> / event handlers
  // and, served inline from our own origin, becomes stored XSS. Raster images
  // only (+ PDF for venue digital menus). The magic-byte check below is the
  // real gate — this fast pre-check just rejects obviously wrong types.
  const allowedTypes = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
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

  // Authoritative check: sniff the real content and require it to match an
  // allowed type. This defeats content-type spoofing regardless of file.type.
  const buffer = Buffer.from(await file.arrayBuffer());
  const detectedType = sniffFileType(buffer);
  if (!detectedType || !allowedTypes.includes(detectedType)) {
    return NextResponse.json(
      { error: "File content not allowed" },
      { status: 400 },
    );
  }

  const filename = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

  // Try Vercel Blob first (production), fall back to local disk (dev). Store
  // with the verified content type so it's never served as something else.
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      const { put } = await import("@vercel/blob");
      const blob = await put(`${folder}/${filename}`, buffer, {
        access: "public",
        contentType: detectedType,
      });
      return NextResponse.json({ url: blob.url, filename: file.name });
    } catch (err) {
      console.error("Vercel Blob upload failed:", err);
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

    const filePath = path.join(uploadDir, filename);
    await fs.writeFile(filePath, buffer);

    const url = `/uploads/${folder}/${filename}`;
    return NextResponse.json({ url, filename: file.name });
  } catch (err) {
    console.error("Local upload failed:", err);
    return NextResponse.json(
      { error: "Upload failed" },
      { status: 500 },
    );
  }
}
