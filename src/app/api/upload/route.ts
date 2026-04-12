import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") || "anonymous";
  const { success } = await rateLimit(`upload:${ip}`, 30, 60_000);
  if (!success) {
    return NextResponse.json({ error: "Too many uploads" }, { status: 429 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const folder = (formData.get("folder") as string) || "uploads";

  if (!file) {
    return NextResponse.json({ error: "No file" }, { status: 400 });
  }

  const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml"];
  if (!allowedTypes.includes(file.type)) {
    return NextResponse.json({ error: "File type not allowed" }, { status: 400 });
  }

  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: "File too large (max 10MB)" }, { status: 400 });
  }

  try {
    const blob = await put(`${folder}/${Date.now()}-${file.name}`, file, {
      access: "public",
    });
    return NextResponse.json({ url: blob.url, filename: file.name });
  } catch {
    return NextResponse.json(
      { error: "Upload not configured. Add Blob store in Vercel dashboard." },
      { status: 503 },
    );
  }
}
