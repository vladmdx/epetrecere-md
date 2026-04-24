// PUT /api/me/timezone — update user's IANA timezone.
//
// Validates against Intl.supportedValuesOf("timeZone") when available
// (Node 18+), otherwise trusts the client's string (common IANA names).

import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

const schema = z.object({
  timezone: z.string().min(3).max(64),
});

/** Return true if the given string is a known IANA timezone. Gracefully
 *  skips validation on older runtimes where supportedValuesOf is missing. */
function isValidTimeZone(tz: string): boolean {
  try {
    const supported = (
      Intl as typeof Intl & {
        supportedValuesOf?: (k: string) => string[];
      }
    ).supportedValuesOf?.("timeZone");
    if (Array.isArray(supported)) return supported.includes(tz);
    // Fallback: try constructing a formatter — throws on invalid zone.
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export async function PUT(req: Request) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Timezone required" }, { status: 400 });
  }
  if (!isValidTimeZone(parsed.data.timezone)) {
    return NextResponse.json(
      { error: "Timezone invalid (foloseste format IANA, ex: Europe/Chisinau)" },
      { status: 400 },
    );
  }

  const result = await db
    .update(users)
    .set({ timezone: parsed.data.timezone, updatedAt: new Date() })
    .where(eq(users.clerkId, clerkId))
    .returning({ id: users.id });

  if (result.length === 0) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true, timezone: parsed.data.timezone });
}
