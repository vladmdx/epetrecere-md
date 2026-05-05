// OCR + structured extraction of a menu image or PDF using Claude vision.
//
// Flow:
//   1. Venue owner uploads a photo/PDF via /api/upload → public URL
//   2. POST /api/venue-menu/scan { venueId, fileUrl, mimeType }
//   3. We fetch the file server-side, base64-encode it, and send it to
//      Claude Sonnet with a strict JSON extraction prompt.
//   4. We return the parsed { categories, items, packages } preview. The
//      client renders it as editable rows; the owner confirms and hits
//      /api/venue-menu/import to persist.
//
// We DO NOT persist anything here. The scan output is purely a suggestion —
// the owner must review it. This avoids dirty imports from blurry photos,
// mis-OCR'd prices, or AI hallucinations.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";
import { createHash } from "crypto";
import { db } from "@/lib/db";
import { users, venues, menuScanCache } from "@/lib/db/schema";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
// The vision call can take 20-40s on a 5-page PDF. Keep the serverless
// function alive long enough to finish.
export const maxDuration = 60;

const schema = z.object({
  venueId: z.number().int().positive(),
  fileUrl: z.string().url(),
  /** Explicit mime for uploads. For arbitrary website URLs ("source": "url")
   *  the client can omit this — we auto-detect below. */
  mimeType: z
    .string()
    .regex(/^(image\/(jpeg|png|webp|gif)|application\/pdf|text\/html)$/)
    .optional(),
  /** "upload" = we hosted it (always cache-eligible) vs
   *  "url" = arbitrary external URL the owner pasted (also cache-eligible) */
  source: z.enum(["upload", "url"]).default("upload"),
});

/** The shape we ask Claude to emit. Mirrors venue_menu_* tables. */
const MENU_JSON_SHAPE = `{
  "categories": [
    {
      "nameRo": "string (in Romanian; translate if the source is in another language)",
      "icon": "salad|beef|cake|wine|coffee|utensils",
      "items": [
        {
          "nameRo": "string",
          "descriptionRo": "string or null",
          "priceMdl": "integer or null (Moldovan leu)",
          "priceEur": "integer or null"
        }
      ]
    }
  ],
  "packages": [
    {
      "nameRo": "string",
      "pricePerPerson": "integer (EUR preferred; if only MDL available, convert using 19.5 MDL/EUR)",
      "includes": "plain text bullet list separated by \\n",
      "excludes": "plain text or null",
      "minGuests": "integer or null"
    }
  ]
}`;

const SYSTEM_PROMPT = `You extract structured menu data from Moldovan venue menus (images or PDFs).

Output ONLY a JSON object matching this exact shape — no prose, no markdown fences:
${MENU_JSON_SHAPE}

Rules:
- Translate all names/descriptions to Romanian (language = ro). If source is Russian, translate.
- Pick the best "icon" per category based on content:
  salad = appetizers / cold starters / salads
  beef = hot mains / meat / fish
  cake = desserts
  wine = alcoholic drinks / wine / cocktails
  coffee = non-alcoholic / juice / soda / coffee
  utensils = anything else / uncategorized
- Prices: parse integers. If the menu shows "150 lei" use priceMdl=150. If "15€" use priceEur=15. If both columns exist, fill both.
- "Packages" are per-person offers like "Pachet Standard 600 MDL/persoană". Extract these separately from single items.
- If you cannot read the menu reliably, return { "categories": [], "packages": [], "error": "short reason" }.
- Never invent items. Only emit what you can read.`;

async function fetchFile(
  url: string,
): Promise<{ bytes: Buffer; contentType: string }> {
  // Mimic a real browser so sites that block headless UAs (403) still serve
  // us the HTML. This is the same trick OG scrapers use.
  const res = await fetch(url, {
    redirect: "follow",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept:
        "text/html,application/xhtml+xml,image/avif,image/webp,image/*;q=0.9,*/*;q=0.8",
    },
  });
  if (!res.ok) {
    throw new Error(`Fetch failed: ${res.status}`);
  }
  const contentType = res.headers.get("content-type") || "application/octet-stream";
  const buffer = Buffer.from(await res.arrayBuffer());
  return { bytes: buffer, contentType };
}

/** Extract the visible text content from an HTML page. Strips scripts/styles
 *  AND boilerplate chrome (header/nav/footer/cart) so the menu items dominate
 *  what we send to the model. Caps at 60 000 chars — large enough for a
 *  full e-commerce restaurant menu, small enough to stay well below
 *  Claude's context budget. */
function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    // Drop chrome that just adds noise on shop-style menu pages (cart UI,
    // breadcrumbs, footer links). The menu data itself stays in <main>/
    // <article>/<section> and isn't affected.
    .replace(/<header[\s\S]*?<\/header>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60_000);
}

/** Resolve the effective mime type: client-declared first, then sniffed from
 *  the response's content-type header. Handles the `charset=...` suffix and
 *  trims octet-stream masks from Blob. */
function resolveMime(
  declared: string | undefined,
  fetched: string,
): string {
  if (declared) return declared;
  const first = fetched.split(";")[0].trim().toLowerCase();
  if (first.startsWith("image/")) return first;
  if (first === "application/pdf") return first;
  if (first.startsWith("text/html")) return "text/html";
  // Unknown — default to HTML because the common "paste a URL" case is web pages.
  return "text/html";
}

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

export async function POST(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Vision calls are expensive + slow. Cap per-IP at 5/min.
  const ip = req.headers.get("x-forwarded-for") || "anonymous";
  const { success } = await rateLimit(`menu-scan:${ip}`, 5, 60_000);
  if (!success) {
    return NextResponse.json(
      { error: "Prea multe scanări. Încearcă peste un minut." },
      { status: 429 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.issues },
      { status: 400 },
    );
  }

  // Ownership gate — the signed-in user must own the target venue.
  const [appUser] = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);
  if (!appUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const isAdmin = appUser.role === "admin" || appUser.role === "super_admin";
  if (!isAdmin) {
    const [venue] = await db
      .select({ userId: venues.userId })
      .from(venues)
      .where(eq(venues.id, parsed.data.venueId))
      .limit(1);
    if (!venue || venue.userId !== appUser.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  // Fetch the file once. We need the raw bytes to (a) compute the cache
  // hash and (b) build base64 for Claude.
  let fetched: { bytes: Buffer; contentType: string };
  try {
    fetched = await fetchFile(parsed.data.fileUrl);
  } catch (err) {
    console.error("[menu-scan] fetch failed", err);
    return NextResponse.json(
      {
        error:
          parsed.data.source === "url"
            ? "URL-ul nu e accesibil. Verifică linkul."
            : "Nu s-a putut citi fișierul uploadat",
      },
      { status: 400 },
    );
  }

  const mime = resolveMime(parsed.data.mimeType, fetched.contentType);

  // Cache lookup — SHA-256 of the bytes keyed per-venue. A blurry re-upload
  // of the same photo should not re-hit Claude's vision endpoint.
  const fileHash = createHash("sha256").update(fetched.bytes).digest("hex");
  const [cached] = await db
    .select({ resultJson: menuScanCache.resultJson })
    .from(menuScanCache)
    .where(
      and(
        eq(menuScanCache.venueId, parsed.data.venueId),
        eq(menuScanCache.fileHash, fileHash),
      ),
    )
    .limit(1);
  if (cached) {
    return NextResponse.json({
      ...cached.resultJson,
      cached: true,
    });
  }

  const base64 = fetched.bytes.toString("base64");

  // Build content blocks per mime: Claude accepts image/pdf/text natively.
  let contentBlocks: Anthropic.Messages.ContentBlockParam[];
  if (mime === "application/pdf") {
    contentBlocks = [
      {
        type: "document",
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: base64,
        },
      },
      {
        type: "text",
        text: "Parse this menu PDF and return the JSON described in the system prompt.",
      },
    ];
  } else if (mime === "text/html") {
    // Websites: strip tags locally so we're not feeding a 500KB HTML doc to
    // the model. Send as plain text with a brief note about the source.
    const text = htmlToText(fetched.bytes.toString("utf-8"));
    if (text.length < 100) {
      return NextResponse.json(
        {
          error:
            "Pagina nu conține suficient text vizibil. Probabil meniul se încarcă cu JavaScript — încearcă o pagină statică (PDF/poză a meniului) sau un screenshot.",
        },
        { status: 400 },
      );
    }
    // Cloudflare/CAPTCHA challenge detection: the marker pages are short
    // and contain known signal phrases. Surface a clear explanation
    // instead of feeding garbage to the model.
    const lower = text.toLowerCase();
    const isChallenge =
      (lower.includes("just a moment") ||
        lower.includes("checking your browser") ||
        lower.includes("verify you are human") ||
        lower.includes("cloudflare")) &&
      text.length < 5_000;
    if (isChallenge) {
      return NextResponse.json(
        {
          error:
            "Site-ul este protejat de Cloudflare/anti-bot și nu putem accesa meniul de pe server. Încarcă un PDF sau o poză a meniului.",
        },
        { status: 400 },
      );
    }
    contentBlocks = [
      {
        type: "text",
        text: `The following is the extracted text of a website menu page (${parsed.data.fileUrl}). Parse it and return the JSON described in the system prompt.\n\nIMPORTANT: be aggressive in extraction. E-commerce menus often mix item names with "Adaugă în coș" / "Add to cart" labels and prices in MDL or EUR. Ignore the cart UI and pull every distinct food item with its price. Map similar categories (e.g. "Plăcinte" → utensils icon, "Salate" → salad).\n\n---\n\n${text}`,
      },
    ];
  } else {
    // image/*
    contentBlocks = [
      {
        type: "image",
        source: {
          type: "base64",
          media_type: mime as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
          data: base64,
        },
      },
      {
        type: "text",
        text: "Parse this menu photo and return the JSON described in the system prompt.",
      },
    ];
  }

  // Use the latest Sonnet for both better extraction quality and a longer
  // output window. 8K tokens is enough for ~150 menu items with prices.
  let rawText = "";
  try {
    const message = await getClient().messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 8000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: contentBlocks }],
    });
    const block = message.content[0];
    rawText = block?.type === "text" ? block.text : "";
  } catch (err) {
    console.error("[menu-scan] anthropic error", err);
    return NextResponse.json(
      { error: "Serviciul AI a eșuat. Încearcă din nou." },
      { status: 503 },
    );
  }

  // Strip accidental markdown fences, then parse.
  const cleaned = rawText
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();

  // If the model returned extra prose before/after the JSON, try to isolate
  // the first {...} block.
  let payload: unknown;
  try {
    payload = JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) {
      return NextResponse.json(
        {
          error: "AI-ul nu a putut extrage meniul. Încearcă o poză mai clară.",
          raw: cleaned.slice(0, 400),
        },
        { status: 502 },
      );
    }
    try {
      payload = JSON.parse(match[0]);
    } catch {
      return NextResponse.json(
        {
          error: "Răspuns AI invalid (JSON malformat)",
          raw: cleaned.slice(0, 400),
        },
        { status: 502 },
      );
    }
  }

  // Basic shape sanity check — we don't enforce strict zod here because the
  // client re-validates each row on import, but we do refuse complete garbage.
  const p = payload as {
    categories?: unknown;
    packages?: unknown;
    error?: string;
  };
  if (p.error && (!Array.isArray(p.categories) || p.categories.length === 0)) {
    return NextResponse.json(
      { error: p.error || "AI-ul nu a putut extrage meniul" },
      { status: 502 },
    );
  }

  const result = {
    categories: Array.isArray(p.categories) ? p.categories : [],
    packages: Array.isArray(p.packages) ? p.packages : [],
  };

  // Store in cache for future re-scans of the same file. Non-blocking — if
  // the insert fails we still return the successful result.
  void db
    .insert(menuScanCache)
    .values({
      venueId: parsed.data.venueId,
      fileHash,
      mimeType: mime,
      resultJson: result as {
        categories: Array<Record<string, unknown>>;
        packages: Array<Record<string, unknown>>;
      },
    })
    .catch((err) => {
      console.warn("[menu-scan] cache insert skipped", err);
    });

  return NextResponse.json(result);
}
