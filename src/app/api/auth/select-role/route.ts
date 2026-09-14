// Sets the user's intended role immediately when they pick one on the
// role picker (auth-redirect page). This way they're treated as an
// artist/venue from the moment they pick — even if they don't complete
// onboarding right away — so they see the right dashboard.
//
// - role="artist"  → users.role = "artist" (the existing enum value)
// - role="venue"   → creates a stub venues row tied to the user
//                    (no "venue" enum value exists; ownership is detected
//                    via venues.userId)
// - role="client"  → no DB change, just marks onboardingComplete

import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { z } from "zod/v4";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { isMultiHallEnabled } from "@/lib/feature-flags";
import {
  completeVenueRoleSelection,
  selectRoleInDatabase,
} from "@/lib/auth/select-role";

const schema = z.object({
  role: z.enum(["client", "artist", "venue"]),
});

export async function POST(req: Request) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }

    // Look up or create the user
    let [appUser] = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
      })
      .from(users)
      .where(eq(users.clerkId, clerkId))
      .limit(1);

    if (!appUser) {
      const clerkUser = await currentUser();
      if (!clerkUser) {
        return NextResponse.json({ error: "Profile load failed" }, { status: 500 });
      }
      const email = clerkUser.primaryEmailAddress?.emailAddress;
      if (!email) {
        return NextResponse.json({ error: "No email" }, { status: 400 });
      }
      const [created] = await db
        .insert(users)
        .values({
          clerkId,
          email,
          name:
            [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") ||
            null,
          // Phone is claimed by /api/auth/set-phone under its canonical
          // identity lock; role selection must not create a duplicate.
          phone: null,
          avatarUrl: clerkUser.imageUrl || null,
          role: "user",
        })
        .onConflictDoNothing()
        .returning({
          id: users.id,
          email: users.email,
          name: users.name,
          role: users.role,
        });
      if (!created) {
        const [refound] = await db
          .select({
            id: users.id,
            email: users.email,
            name: users.name,
            role: users.role,
          })
          .from(users)
          .where(eq(users.clerkId, clerkId))
          .limit(1);
        appUser = refound;
      } else {
        appUser = created;
      }
      if (!appUser) {
        return NextResponse.json({ error: "User create failed" }, { status: 500 });
      }
    }

    const role = parsed.data.role;
    const multiHallEnabled = isMultiHallEnabled();
    const selected = await selectRoleInDatabase({
      userId: appUser.id,
      role,
      baseName: appUser.name || "Sală nouă",
      multiHallEnabled,
    });
    if (!selected.ok) {
      return NextResponse.json(
        { error: selected.error, code: selected.code },
        { status: selected.status },
      );
    }

    if (role === "venue") {
      if (!selected.venueId) {
        return NextResponse.json(
          {
            error: "Profilul localului nu a putut fi inițializat. Reîncearcă.",
            code: "VENUE_STUB_CONFLICT",
          },
          { status: 409 },
        );
      }
      const venueId = selected.venueId;
      let organizationId = selected.organizationId;
      if (selected.needsOrganizationAttachment) {
        const {
          attachVenueRoleDraftToOrganization,
          bootstrapDraftOrganization,
          OrganizationDraftUpdateError,
        } = await import("@/lib/partner/onboarding");
        const baseName = appUser.name || "Sală nouă";
        let org;
        try {
          org = await bootstrapDraftOrganization(selected.user, {
            displayName: baseName,
            type: "company",
          });
        } catch (error) {
          if (
            error instanceof OrganizationDraftUpdateError
            && error.code === "ORGANIZATION_SELECTION_REQUIRED"
          ) {
            // This is a successful venue-role choice with an unresolved
            // organization, not a role failure. Keep onboarding incomplete
            // and let the onboarding screen show its explicit org selector.
            return NextResponse.json({
              success: true,
              role,
              organizationSelectionRequired: true,
            });
          }
          throw error;
        }
        organizationId = org.id;
        const attached = await attachVenueRoleDraftToOrganization(
          selected.user,
          venueId,
          organizationId,
        );
        if (!attached.ok) {
          return NextResponse.json(
            { error: attached.error, code: "FORBIDDEN" },
            { status: attached.status },
          );
        }
        organizationId = attached.organizationId;
      }
      const completed = await completeVenueRoleSelection({
        userId: selected.user.id,
        venueId,
        multiHallEnabled,
      });
      if (!completed) {
        return NextResponse.json(
          { error: "Forbidden", code: "FORBIDDEN" },
          { status: 403 },
        );
      }
      if (multiHallEnabled) {
        return NextResponse.json({ success: true, role, organizationId, venueId });
      }
    }

    return NextResponse.json({ success: true, role });
  } catch (err) {
    const { OrganizationDraftUpdateError } = await import("@/lib/partner/onboarding");
    if (err instanceof OrganizationDraftUpdateError) {
      return NextResponse.json(
        { error: err.code, code: err.code },
        { status: err.status },
      );
    }
    console.error("[select-role] Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
