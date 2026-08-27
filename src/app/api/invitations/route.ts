// M8 Invitations API
//
// GET — list current user's invitations, or (?planId=N) resolve the single
//       invitation an event plan sends from
// POST — create a new invitation (draft) + optional bulk guests, or, when
//        the caller names a plan that already has one, add to that

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { db } from "@/lib/db";
import { invitations, invitationGuests, eventPlans } from "@/lib/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { rateLimit } from "@/lib/rate-limit";
import { requireAppUser, requirePlanOwnership } from "@/lib/planner/ownership";
import { slugify } from "@/lib/utils/slugify";

/** Identity of a guest across the planner's list and an invitation's own
 *  rows. There is no FK between the two tables, so a contact match is what
 *  tells us "this person is already on the invitation" and keeps a second
 *  press from inserting a duplicate row (which would then look unsent and
 *  earn them a second mail). Email first, then phone, then the name. */
function contactKey(g: {
  name?: string;
  email?: string | null;
  phone?: string | null;
}): string {
  const email = g.email?.trim().toLowerCase();
  if (email) return `e:${email}`;
  const phone = g.phone?.replace(/\D/g, "");
  if (phone) return `p:${phone}`;
  return `n:${(g.name ?? "").trim().toLowerCase()}`;
}

export async function GET(req: NextRequest) {
  // `invitations.userId` is a `uuid` FK to `users.id` — we must resolve the
  // Clerk session to the internal app-user UUID before querying, otherwise
  // Postgres errors on the type mismatch (bug surfaced by E2E INV-01).
  const appUser = await requireAppUser();
  if (!appUser.ok) {
    return NextResponse.json({ error: appUser.error }, { status: appUser.status });
  }

  // ?planId=N — the planner's Send dialog asks "does this plan already
  // have an invitation?" so it can pre-fill from it and tell the host how
  // many of their guests are actually new, instead of minting a second one.
  const planIdParam = req.nextUrl.searchParams.get("planId");
  if (planIdParam !== null) {
    const ownership = await requirePlanOwnership(Number(planIdParam));
    if (!ownership.ok) {
      return NextResponse.json(
        { error: ownership.error },
        { status: ownership.status },
      );
    }
    const linkedId = ownership.plan.invitationId;
    if (!linkedId) {
      return NextResponse.json({ invitation: null, guests: [] });
    }
    const [invitation] = await db
      .select()
      .from(invitations)
      .where(
        and(eq(invitations.id, linkedId), eq(invitations.userId, appUser.userId)),
      )
      .limit(1);
    if (!invitation) {
      // Invitation deleted out from under the plan — treat as unlinked.
      return NextResponse.json({ invitation: null, guests: [] });
    }
    // Contact columns only: this runs before migration 0018 on a fresh
    // deploy, and it is all the caller needs to count who is new.
    const guests = await db
      .select({
        id: invitationGuests.id,
        name: invitationGuests.name,
        email: invitationGuests.email,
        phone: invitationGuests.phone,
      })
      .from(invitationGuests)
      .where(eq(invitationGuests.invitationId, invitation.id));
    return NextResponse.json({ invitation, guests });
  }

  const rows = await db
    .select()
    .from(invitations)
    .where(eq(invitations.userId, appUser.userId))
    .orderBy(desc(invitations.createdAt));

  return NextResponse.json(rows);
}

const createSchema = z.object({
  /** When set, this plan's single invitation is created-or-reused. */
  planId: z.number().int().optional(),
  templateId: z.number().int().optional(),
  designId: z.string().optional(),
  customColors: z.record(z.string(), z.unknown()).optional(),
  eventType: z.enum(["wedding", "birthday", "baptism", "corporate"]),
  coupleNames: z.string().optional(),
  hostName: z.string().optional(),
  eventDate: z.string().min(4),
  ceremonyTime: z.string().optional(),
  receptionTime: z.string().optional(),
  ceremonyLocation: z.string().optional(),
  receptionLocation: z.string().optional(),
  message: z.string().max(1000).optional(),
  dressCode: z.string().optional(),
  rsvpDeadline: z.string().optional(),
  allowPlusOne: z.boolean().optional(),
  guests: z
    .array(
      z.object({
        name: z.string().min(1),
        email: z.string().optional(),
        phone: z.string().optional(),
        whatsapp: z.string().optional(),
        group: z.string().optional(),
        /** single | couple | family — drives plural vs singular greeting. */
        guestType: z.enum(["single", "couple", "family"]).optional(),
      }),
    )
    .max(500)
    .optional(),
});

type IncomingGuest = NonNullable<z.infer<typeof createSchema>["guests"]>[number];

function genToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Insert only the guests the invitation doesn't already hold. Returns what
 *  it did so the caller can tell the host "3 added, 12 already on the list"
 *  rather than implying everyone was freshly invited. */
async function addMissingGuests(
  invitationId: number,
  incoming: IncomingGuest[],
): Promise<{ added: number; skipped: number }> {
  if (incoming.length === 0) return { added: 0, skipped: 0 };

  const existing = await db
    .select({
      name: invitationGuests.name,
      email: invitationGuests.email,
      phone: invitationGuests.phone,
    })
    .from(invitationGuests)
    .where(eq(invitationGuests.invitationId, invitationId));

  const known = new Set(existing.map(contactKey));
  const toInsert: IncomingGuest[] = [];
  for (const g of incoming) {
    const key = contactKey(g);
    // `known` also collects this batch, so a list containing the same
    // address twice doesn't produce two rows and two mails.
    if (known.has(key)) continue;
    known.add(key);
    toInsert.push(g);
  }

  if (toInsert.length > 0) {
    await db.insert(invitationGuests).values(
      toInsert.map((g) => ({
        invitationId,
        name: g.name,
        email: g.email,
        phone: g.phone,
        whatsapp: g.whatsapp,
        group: g.group,
        guestType: g.guestType ?? "single",
        rsvpToken: genToken(),
      })),
    );
  }

  return { added: toInsert.length, skipped: incoming.length - toInsert.length };
}

export async function POST(req: NextRequest) {
  const appUser = await requireAppUser();
  if (!appUser.ok) {
    return NextResponse.json({ error: appUser.error }, { status: appUser.status });
  }

  const ip = req.headers.get("x-forwarded-for") || "anonymous";
  const { success } = await rateLimit(`invitations:${appUser.userId}:${ip}`, 10, 60_000);
  if (!success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const data = parsed.data;

  /** An absent key means "leave whatever is there" — the reuse UPDATE below
   *  writes only the keys present here, and drizzle drops undefined values.
   *  An empty string means the host cleared the box and has to become NULL,
   *  which is the distinction the send dialog now relies on. */
  const cleared = <K extends string>(key: K, value: string | undefined) =>
    value === undefined
      ? ({} as Record<K, never>)
      : ({ [key]: value === "" ? null : value } as Record<K, string | null>);

  // Store design selection in customColors JSON. Merge with any custom colors
  // passed by the client.
  const customColors = {
    ...(data.customColors || {}),
    ...(data.designId ? { designId: data.designId } : {}),
  };
  // Only the fields the caller actually supplied. The reuse branch below
  // writes this object straight onto an existing invitation, and the planner's
  // Send payload carries no plus-one flag, no RSVP deadline and no colours —
  // spelling those out as `true`/`null` here silently reset three settings the
  // host had chosen in the invitation editor, on every single press of Send.
  // Defaults belong on the insert path, which is the only place they are new.
  const content = {
    eventType: data.eventType,
    coupleNames: data.coupleNames,
    hostName: data.hostName,
    eventDate: data.eventDate,
    ...cleared("ceremonyTime", data.ceremonyTime),
    ...cleared("receptionTime", data.receptionTime),
    ...cleared("ceremonyLocation", data.ceremonyLocation),
    ...cleared("receptionLocation", data.receptionLocation),
    ...cleared("message", data.message),
    ...cleared("dressCode", data.dressCode),
    ...(data.templateId && data.templateId > 0
      ? { templateId: data.templateId }
      : {}),
    ...cleared("rsvpDeadline", data.rsvpDeadline),
    ...(data.allowPlusOne !== undefined
      ? { allowPlusOne: data.allowPlusOne }
      : {}),
    ...(Object.keys(customColors).length > 0 ? { customColors } : {}),
  };

  // A plan owns exactly one invitation. Pressing Send again has to land on
  // that one — minting a second gave every earlier guest a duplicate mail
  // with a new link and stranded their RSVP on the old invitation.
  let plan: typeof eventPlans.$inferSelect | null = null;
  if (data.planId !== undefined) {
    const ownership = await requirePlanOwnership(data.planId);
    if (!ownership.ok) {
      return NextResponse.json(
        { error: ownership.error },
        { status: ownership.status },
      );
    }
    plan = ownership.plan;

    if (plan.invitationId) {
      const [existing] = await db
        .select()
        .from(invitations)
        .where(
          and(
            eq(invitations.id, plan.invitationId),
            eq(invitations.userId, appUser.userId),
          ),
        )
        .limit(1);

      if (existing) {
        // Only the keys the caller supplied are present in `content`, so an
        // edit the host made here lands and everything they set elsewhere —
        // colours, RSVP deadline, the plus-one switch — survives untouched.
        const [updated] = await db
          .update(invitations)
          .set({ ...content, updatedAt: new Date() })
          .where(eq(invitations.id, existing.id))
          .returning();
        const result = await addMissingGuests(existing.id, data.guests ?? []);
        return NextResponse.json({
          ...updated,
          reused: true,
          guestsAdded: result.added,
          guestsSkipped: result.skipped,
        });
      }
      // Linked invitation is gone — fall through and create a fresh one.
    }
  }

  const baseSlug = slugify(
    data.coupleNames || data.hostName || data.eventType,
  );
  const slug = `${baseSlug}-${genToken().slice(0, 6)}`;

  const [invitation] = await db
    .insert(invitations)
    .values({
      userId: appUser.userId,
      slug,
      status: "draft",
      // templateId / rsvpDeadline / customColors are nullable and default to
      // NULL; only the plus-one switch needs a value when the caller is
      // silent, and `content` overrides it whenever they are not.
      allowPlusOne: true,
      ...content,
    })
    .returning();

  // Bulk insert guests (if provided at creation time)
  const result = await addMissingGuests(invitation.id, data.guests ?? []);

  if (plan) {
    await db
      .update(eventPlans)
      .set({ invitationId: invitation.id, updatedAt: new Date() })
      .where(eq(eventPlans.id, plan.id));
  }

  return NextResponse.json(
    {
      ...invitation,
      reused: false,
      guestsAdded: result.added,
      guestsSkipped: result.skipped,
    },
    { status: 201 },
  );
}
