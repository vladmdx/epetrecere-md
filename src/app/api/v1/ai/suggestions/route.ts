// GET /api/v1/ai/suggestions?context=partner|client
//
// Returns 4 prompts tailored to the current user's state. We don't
// invoke Claude here — that'd be wasteful for a constant-time
// pick-from-buckets decision. Instead we look at a handful of cheap
// signals and choose pre-written prompts from a curated library.
//
// Why pre-written: prompts are user-facing, so they must be in
// Romanian, never hallucinate names/numbers, and feel coherent with
// the brand voice. We can extend the library over time without
// touching the model.

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import {
  artists,
  bookingRequests,
  conversations,
  eventPlans,
  users,
} from "@/lib/db/schema";
import { and, count, eq, gte, sum } from "drizzle-orm";

interface Suggestion {
  prompt: string;
  category: "marketing" | "pricing" | "responses" | "profile" | "general" | "planning";
}

const PARTNER_LIB: Record<string, Suggestion[]> = {
  pendingMany: [
    {
      prompt:
        "Am multe cereri în așteptare. Cum prioritizez care merită răspuns mai întâi?",
      category: "responses",
    },
  ],
  pendingZero: [
    {
      prompt: "Cum atrag mai multe cereri în următoarele 2 săptămâni?",
      category: "marketing",
    },
    {
      prompt:
        "Sugerează 3 postări pentru Instagram care să-mi crească vizibilitatea.",
      category: "marketing",
    },
  ],
  lowCompletion: [
    {
      prompt: "Ce câmpuri din profil au cel mai mare impact pentru ranking?",
      category: "profile",
    },
    {
      prompt: "Scrie-mi o descriere profesională pentru profilul meu.",
      category: "profile",
    },
  ],
  upcomingEvent: [
    {
      prompt: "Am un eveniment săptămâna asta. Cum mă pregătesc fără stres?",
      category: "general",
    },
  ],
  lowBudgetRequest: [
    {
      prompt: "Cum răspund la o cerere cu un buget prea mic, dar fără să refuz brusc?",
      category: "responses",
    },
    {
      prompt: "Cum justific tariful meu față de o ofertă low-cost a unui concurent?",
      category: "pricing",
    },
  ],
  default: [
    {
      prompt: "Sfaturi pentru a primi mai multe rezervări",
      category: "marketing",
    },
    {
      prompt: "Cum optimizez profilul pentru a urca în topul artiștilor?",
      category: "profile",
    },
    {
      prompt: "Cum răspund la o cerere cu un buget prea mic?",
      category: "responses",
    },
    {
      prompt: "Ce preț recomand pentru o nuntă de 150 invitați?",
      category: "pricing",
    },
  ],
};

const CLIENT_LIB: Record<string, Suggestion[]> = {
  noPlan: [
    {
      prompt: "Cum încep planificarea unei nunți de la zero?",
      category: "planning",
    },
    {
      prompt: "De ce furnizori am nevoie pentru un botez de 60 de invitați?",
      category: "planning",
    },
  ],
  hasPlan: [
    {
      prompt: "Ce trebuie să fac în următoarele 30 de zile înainte de eveniment?",
      category: "planning",
    },
    {
      prompt: "Cum negociez tarifele cu artiștii fără să stric relația?",
      category: "pricing",
    },
  ],
  closeEvent: [
    {
      prompt: "Eveniment în câteva zile — checklist final, ce nu trebuie să uit?",
      category: "planning",
    },
  ],
  default: [
    {
      prompt: "Idei de decor pentru o nuntă cu temă rustică",
      category: "planning",
    },
    {
      prompt: "Cum aleg între cântăreț, DJ sau formație live?",
      category: "general",
    },
    {
      prompt: "Cât bani să rezerv pentru fotograf + videograf?",
      category: "pricing",
    },
    {
      prompt: "Ce întrebări să-i pun moderatorului la prima discuție?",
      category: "responses",
    },
  ],
};

export async function GET(req: Request) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ suggestions: [] });
  }
  const [appUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);
  if (!appUser) {
    return NextResponse.json({ suggestions: [] });
  }

  const url = new URL(req.url);
  const context = url.searchParams.get("context") ?? "partner";

  if (context === "partner") {
    const suggestions = await partnerSuggestions(appUser.id);
    return NextResponse.json({ suggestions });
  }

  const suggestions = await clientSuggestions(appUser.id);
  return NextResponse.json({ suggestions });
}

async function partnerSuggestions(userId: string): Promise<Suggestion[]> {
  const [artist] = await db
    .select({
      id: artists.id,
      descriptionRo: artists.descriptionRo,
      photoUrl: artists.photoUrl,
      priceFrom: artists.priceFrom,
      priceHidden: artists.priceHidden,
      instagram: artists.instagram,
      facebook: artists.facebook,
    })
    .from(artists)
    .where(eq(artists.userId, userId))
    .limit(1);

  if (!artist) return PARTNER_LIB.default!;

  // Signal 1: pending booking count
  const todayIso = new Date().toISOString().slice(0, 10);
  const [pendingRow] = await db
    .select({ value: count() })
    .from(bookingRequests)
    .where(
      and(
        eq(bookingRequests.artistId, artist.id),
        eq(bookingRequests.status, "pending"),
      ),
    );
  const pending = Number(pendingRow?.value ?? 0);

  // Signal 2: upcoming events in the next 7 days
  const [upcomingRow] = await db
    .select({ value: count() })
    .from(bookingRequests)
    .where(
      and(
        eq(bookingRequests.artistId, artist.id),
        eq(bookingRequests.status, "confirmed_by_client"),
        gte(bookingRequests.eventDate, todayIso),
      ),
    );
  const upcoming = Number(upcomingRow?.value ?? 0);

  // Signal 3: profile completion
  const profileFields = [
    artist.descriptionRo,
    artist.photoUrl,
    artist.priceFrom != null || artist.priceHidden,
    artist.instagram || artist.facebook,
  ];
  const completion =
    (profileFields.filter(Boolean).length / profileFields.length) * 100;

  // Pick suggestions
  const picks: Suggestion[] = [];
  if (pending >= 5) picks.push(...(PARTNER_LIB.pendingMany ?? []));
  if (pending === 0) picks.push(...(PARTNER_LIB.pendingZero ?? []));
  if (completion < 75) picks.push(...(PARTNER_LIB.lowCompletion ?? []));
  if (upcoming > 0) picks.push(...(PARTNER_LIB.upcomingEvent ?? []));
  if (picks.length < 4) {
    for (const s of PARTNER_LIB.default!) {
      if (picks.length >= 4) break;
      if (!picks.find((p) => p.prompt === s.prompt)) picks.push(s);
    }
  }
  return picks.slice(0, 4);
}

async function clientSuggestions(userId: string): Promise<Suggestion[]> {
  // Signal: do they have an active plan, and how far away is it
  const [plan] = await db
    .select({
      id: eventPlans.id,
      eventDate: eventPlans.eventDate,
    })
    .from(eventPlans)
    .where(
      and(eq(eventPlans.userId, userId), eq(eventPlans.status, "active")),
    )
    .limit(1);

  const picks: Suggestion[] = [];
  if (!plan) {
    picks.push(...(CLIENT_LIB.noPlan ?? []));
  } else {
    picks.push(...(CLIENT_LIB.hasPlan ?? []));
    if (plan.eventDate) {
      const daysAway = Math.max(
        0,
        Math.floor(
          (new Date(plan.eventDate + "T00:00:00").getTime() - Date.now()) /
            86_400_000,
        ),
      );
      if (daysAway > 0 && daysAway <= 10) {
        picks.push(...(CLIENT_LIB.closeEvent ?? []));
      }
    }
  }
  if (picks.length < 4) {
    for (const s of CLIENT_LIB.default!) {
      if (picks.length >= 4) break;
      if (!picks.find((p) => p.prompt === s.prompt)) picks.push(s);
    }
  }
  // Reference args to keep them as future-use hints
  void [conversations, sum];
  return picks.slice(0, 4);
}
