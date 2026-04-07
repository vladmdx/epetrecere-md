import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { chatWithAI } from "@/lib/ai";

const chatSchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string(),
    }),
  ),
  context: z.enum(["admin", "vendor"]),
});

const ADMIN_SYSTEM = `Ești un asistent AI pentru platforma ePetrecere.md — un marketplace de servicii pentru evenimente din Republica Moldova.
Ajuți administratorii cu:
- Gestionarea artiștilor, sălilor și categoriilor
- Analiza solicitărilor și lead-urilor
- Generarea de texte SEO, descrieri, articole blog
- Răspunsuri la întrebări despre platforma
Răspunde concis și profesional în limba în care ți se adresează utilizatorul.`;

const VENDOR_SYSTEM = `Ești un asistent AI personal pentru artiștii/furnizorii de pe platforma ePetrecere.md.
Ajuți cu:
- Gestionarea calendarului și rezervărilor
- Îmbunătățirea descrierii profilului
- Răspunsuri la recenzii
- Sfaturi de marketing și promovare
Răspunde prietenos și util în limba utilizatorului.`;

export async function POST(req: Request) {
  const body = await req.json();
  const parsed = chatSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const systemPrompt = parsed.data.context === "admin" ? ADMIN_SYSTEM : VENDOR_SYSTEM;

  try {
    const reply = await chatWithAI(parsed.data.messages, systemPrompt);
    return NextResponse.json({ reply });
  } catch (err) {
    return NextResponse.json(
      { error: "AI service unavailable" },
      { status: 503 },
    );
  }
}
