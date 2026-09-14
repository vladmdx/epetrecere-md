// POST /api/v1/me/role-preference — set the user's role after the
// onboarding role picker on mobile.
//
// Body: { role: "user" | "artist" }
//
// Effect:
//   - "user": no change to db.users.role (the default already is "user")
//   - "artist": sets db.users.role = "artist". This unlocks the
//     /dashboard route and the "Profile incomplete" shell for vendors
//     who haven't filled their artist row yet.
//
// We do NOT promote to "admin" or "super_admin" from this endpoint —
// those roles are assigned manually.

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { isMultiHallEnabled } from "@/lib/feature-flags";
import { setMobileRolePreferenceInDatabase } from "@/lib/auth/select-role";

const BodySchema = z.object({
  role: z.enum(["user", "artist"]),
});

export async function POST(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: "validation_error", details: err },
      { status: 400 },
    );
  }

  const [appUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);
  if (!appUser) {
    return NextResponse.json({ error: "user_not_found" }, { status: 404 });
  }

  const result = await setMobileRolePreferenceInDatabase({
    userId: appUser.id,
    role: body.role,
    multiHallEnabled: isMultiHallEnabled(),
  });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status: result.status },
    );
  }
  return NextResponse.json(result);
}
