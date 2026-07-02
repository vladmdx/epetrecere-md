// AI event timeline generator — client asks Claude to propose a full
// event agenda based on their eventType + guestCount + startTime +
// duration. Result is an ordered list of time slots (check-in, ceremony,
// cocktail, dinner, first dance, etc.) the client can then edit/approve.
//
// Auth: the caller must own the event plan. The generated timeline is
// persisted directly to event_plans.timeline (user is one click away
// from their own plan — no reason to return-then-save in two steps).

import { NextRequest, NextResponse } from "next/server";
import { MODELS } from "@/lib/ai/models";
import { z } from "zod/v4";
import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, eventPlans } from "@/lib/db/schema";
import { rateLimit } from "@/lib/rate-limit";

const MODEL = MODELS.CHAT;

const schema = z.object({
  planId: z.number().int().positive(),
});

function getClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY missing");
  return new Anthropic({ apiKey });
}

export async function POST(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip = req.headers.get("x-forwarded-for") || "anonymous";
  const { success } = await rateLimit(`timeline-ai:${ip}`, 10, 60_000);
  if (!success) {
    return NextResponse.json(
      { error: "Prea multe cereri AI. Încearcă peste câteva secunde." },
      { status: 429 },
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "planId required" }, { status: 400 });
  }

  const [appUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);
  if (!appUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [plan] = await db
    .select()
    .from(eventPlans)
    .where(
      and(
        eq(eventPlans.id, parsed.data.planId),
        eq(eventPlans.userId, appUser.id),
      ),
    )
    .limit(1);
  if (!plan) {
    return NextResponse.json({ error: "Plan not found" }, { status: 404 });
  }

  const startTime = plan.startTime || "16:00";
  const durationHours = plan.durationHours || 6;
  const eventType = plan.eventType || "other";
  const guestCount = plan.guestCountTarget || 100;

  const SYSTEM_PROMPT = `Ești un wedding/event planner profesionist pentru piața din Republica Moldova.
Primești parametrii unui eveniment și generezi o AGENDĂ completă cu momente cheie și orele lor.

Răspunde DOAR cu JSON valid, fără markdown fence. Structură:
{
  "items": [
    { "time": "HH:MM", "label": "denumire în română", "durationMin": 30 }
  ]
}

Reguli:
- Primul item = startTime exact cum e primit
- Orele trebuie să crească cronologic
- Suma durationMin ≈ durationHours * 60 (poate varia ±30 min)
- Întreaga agendă trebuie să se încadreze în durata totală — NU depășești cu mai mult de 30 min
- Labels scurte (≤50 chars), în română
- Pentru NUNTĂ: check-in invitați, cununie (dacă din tip), cocktail, masă festivă servită pe 2-3 sesiuni, prima dansare, momente speciale (Hora Miresei, etc), tăierea tortului, dans liber, închidere
- Pentru BOTEZ / CUMĂTRIE: check-in, masă, momente religioase/tradiționale, tăierea tortului, dans liber
- Pentru CORPORATE: check-in + welcome, keynote/program, coffee break, cină, networking, închidere
- Pentru BIRTHDAY: check-in, cocktail, masă, tort + urări, dans, închidere
- Pentru nr invitați mari (>150), alocă mai mult timp la check-in (45-60 min)
- Între momente, include câte 10-15 min tranziție când e nevoie
- NU genera mai mult de 12-15 items — agenda trebuie să fie citibilă
`;

  let out;
  try {
    const msg = await getClient().messages.create({
      model: MODEL,
      max_tokens: 1500,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Tip eveniment: ${eventType}
Start: ${startTime}
Durată: ${durationHours}h
Invitați: ${guestCount}
${plan.location ? `Locație: ${plan.location}` : ""}
${plan.notes ? `Note extra: ${plan.notes.slice(0, 200)}` : ""}

Generează agenda completă.`,
        },
      ],
    });
    const block = msg.content[0];
    const text = block.type === "text" ? block.text : "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("No JSON");
    out = JSON.parse(match[0]);
  } catch (err) {
    console.error("[timeline-ai] failed", err);
    return NextResponse.json(
      { error: "AI indisponibil" },
      { status: 503 },
    );
  }

  // Validate the returned items shape defensively
  if (!Array.isArray(out.items) || out.items.length === 0) {
    return NextResponse.json(
      { error: "AI a returnat un format neașteptat" },
      { status: 502 },
    );
  }
  const validated = out.items
    .slice(0, 20)
    .map(
      (it: { time?: string; label?: string; durationMin?: number | string }) => ({
        time: String(it.time ?? "").slice(0, 5) || "00:00",
        label: String(it.label ?? "").slice(0, 100),
        durationMin: Math.max(0, Math.min(360, Number(it.durationMin) || 30)),
      }),
    )
    .filter((it: { label: string }) => it.label.length > 0);

  // Persist on the plan
  await db
    .update(eventPlans)
    .set({ timeline: validated })
    .where(eq(eventPlans.id, plan.id));

  return NextResponse.json({ items: validated });
}

// PUT — user manually edits the timeline (drag reorder, text edit).
export async function PUT(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const saveSchema = z.object({
    planId: z.number().int().positive(),
    items: z
      .array(
        z.object({
          time: z.string().min(4).max(5),
          label: z.string().min(1).max(100),
          durationMin: z.number().int().min(0).max(360),
        }),
      )
      .max(30),
  });
  const parsed = saveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid" }, { status: 400 });
  }

  const [appUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);
  if (!appUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await db
    .update(eventPlans)
    .set({ timeline: parsed.data.items })
    .where(
      and(
        eq(eventPlans.id, parsed.data.planId),
        eq(eventPlans.userId, appUser.id),
      ),
    )
    .returning({ id: eventPlans.id });

  if (result.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
