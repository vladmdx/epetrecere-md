// POST /api/v1/ai/transcribe — speech-to-text via OpenAI Whisper.
//
// We use OpenAI's Whisper-1 model rather than rolling our own STT
// because (1) Romanian quality is excellent (training data has heavy
// EU coverage), (2) it's $0.006/min — basically free at our scale,
// and (3) it returns punctuation + diacritics which a "free" RN
// library can't.
//
// Mobile sends a multipart upload with the recorded m4a/webm clip.
// We forward to OpenAI as a multipart relay, then return the
// transcribed text. Clips longer than 60s are rejected (a user-
// initiated voice command rarely needs that long).
//
// Costs:  ~0.006/minute. At ~5s avg per command, ~120 commands/$1.
// Acceptable as long as we rate-limit per user.

import { auth } from "@clerk/nextjs/server";
import { MODELS } from "@/lib/ai/models";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_SIZE_BYTES = 8 * 1024 * 1024; // 8MB — generous for 60s mono m4a.

export async function POST(req: Request) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const [appUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);
  if (!appUser) {
    return NextResponse.json({ error: "user_not_found" }, { status: 404 });
  }

  // Rate limit per user — 60 transcriptions per hour is plenty for
  // legitimate use and stops accidental loops.
  const { success } = await rateLimit(`transcribe:${appUser.id}`, 60, 60 * 60_000);
  if (!success) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    return NextResponse.json({ error: "transcribe_unavailable" }, { status: 503 });
  }

  const incoming = await req.formData();
  const file = incoming.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "no_file" }, { status: 400 });
  }
  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: "too_large" }, { status: 413 });
  }

  // Build Whisper multipart manually — OpenAI accepts m4a, mp3,
  // wav, webm, mp4, mpga, mpeg. RN sends m4a (iOS) or 3gpp (Android),
  // we pass through.
  const forward = new FormData();
  forward.append("file", file, file.name || "voice.m4a");
  forward.append("model", MODELS.TRANSCRIBE);
  // Hint Romanian — Whisper's language detection is good but giving
  // it a hint shaves 100-200ms and improves diacritics.
  forward.append("language", "ro");
  forward.append("response_format", "json");

  try {
    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${openaiKey}` },
      body: forward,
      // 20s timeout — Whisper rarely takes >5s for a 60s clip.
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error("[transcribe] OpenAI error", res.status, errText.slice(0, 200));
      return NextResponse.json(
        { error: "transcribe_failed", upstream: res.status },
        { status: 502 },
      );
    }
    const data = (await res.json()) as { text?: string };
    return NextResponse.json({ text: data.text ?? "" });
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === "AbortError";
    console.error("[transcribe] failed", err);
    return NextResponse.json(
      { error: isTimeout ? "timeout" : "network_error" },
      { status: 504 },
    );
  }
}
