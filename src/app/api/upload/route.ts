import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { auth } from "@clerk/nextjs/server";
import { rateLimit } from "@/lib/rate-limit";

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
  const allowedFolders = new Set(["uploads", "artists", "venues", "blog", "avatars", "invitations"]);
  const rawFolder = (formData.get("folder") as string) || "uploads";
  const folder = allowedFolders.has(rawFolder) ? rawFolder : "uploads";

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
