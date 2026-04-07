import { NextRequest, NextResponse } from "next/server";
import { uploadToR2, generateFilename } from "@/lib/storage/upload";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  // Rate limit: 30 uploads per minute per IP
  const ip = req.headers.get("x-forwarded-for") || "anonymous";
  const { success } = rateLimit(`upload:${ip}`, 30, 60_000);
  if (!success) {
    return NextResponse.json({ error: "Too many uploads" }, { status: 429 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const folder = (formData.get("folder") as string) || "uploads";

  if (!file) {
    return NextResponse.json({ error: "No file" }, { status: 400 });
  }

  // Validate file type
  const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml"];
  if (!allowedTypes.includes(file.type)) {
    return NextResponse.json({ error: "File type not allowed" }, { status: 400 });
  }

  // Validate file size (10MB max)
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: "File too large (max 10MB)" }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const filename = generateFilename(file.name);
    const url = await uploadToR2(buffer, filename, { folder, contentType: file.type });

    return NextResponse.json({ url, filename });
  } catch (err) {
    // R2 not configured — return local placeholder
    return NextResponse.json({
      url: `/api/placeholder?w=800&h=600`,
      filename: file.name,
      warning: "R2 not configured, using placeholder",
    });
  }
}
