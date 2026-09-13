import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { Webhook } from "svix";
import { db } from "@/lib/db";
import { bookingRequests, users } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { BOOKING_CLIENT_ERASURE } from "@/lib/privacy/account-erasure";
import { acquireUserMembershipMutationLocks } from "@/lib/partner/organization-members";

interface ClerkWebhookEvent {
  type: string;
  data: {
    id: string;
    email_addresses: { email_address: string }[];
    first_name: string | null;
    last_name: string | null;
    image_url: string | null;
    phone_numbers?: { phone_number: string }[];
  };
}

export async function POST(req: Request) {
  const headerPayload = await headers();
  const svixId = headerPayload.get("svix-id");
  const svixTimestamp = headerPayload.get("svix-timestamp");
  const svixSignature = headerPayload.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: "Missing svix headers" }, { status: 400 });
  }

  const payload = await req.json();
  const body = JSON.stringify(payload);

  if (!process.env.CLERK_WEBHOOK_SECRET) {
    console.error("[clerk-webhook] CLERK_WEBHOOK_SECRET is not configured");
    return new NextResponse("Webhook secret not configured", { status: 500 });
  }
  const wh = new Webhook(process.env.CLERK_WEBHOOK_SECRET);

  let event: ClerkWebhookEvent;
  try {
    event = wh.verify(body, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as ClerkWebhookEvent;
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const { type, data } = event;

  if (type === "user.created" || type === "user.updated") {
    const email = data.email_addresses[0]?.email_address;
    if (!email) return NextResponse.json({ error: "No email" }, { status: 400 });

    const name = [data.first_name, data.last_name].filter(Boolean).join(" ") || null;
    const phone = data.phone_numbers?.[0]?.phone_number || null;

    const existing = await db
      .select()
      .from(users)
      .where(eq(users.clerkId, data.id))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(users)
        .set({
          email,
          name,
          phone,
          avatarUrl: data.image_url,
          updatedAt: new Date(),
        })
        .where(eq(users.clerkId, data.id));
    } else {
      await db.insert(users).values({
        clerkId: data.id,
        email,
        name,
        phone,
        avatarUrl: data.image_url,
        role: "user",
      });
    }
  }

  if (type === "user.deleted") {
    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.clerkId, data.id))
      .limit(1);
    if (user) {
      await db.transaction(async (tx) => {
        await acquireUserMembershipMutationLocks(tx, user.id);
        // An out-of-band deletion (Clerk dashboard/API) cannot ask the owner
        // to transfer first. Suspend any organization that would become
        // ownerless and create a durable admin-review case before the
        // membership cascade removes the user.
        await tx.execute(sql`
          INSERT INTO partner_admin_review_cases
            (venue_id, organization_id, reason, status)
          SELECT v.id, v.organization_id, 'clerk_deleted_last_owner', 'pending'
          FROM venues v
          WHERE v.organization_id IN (
            SELECT m.organization_id
            FROM partner_organization_members m
            WHERE m.user_id = ${user.id} AND m.role = 'owner' AND m.is_active
              AND NOT EXISTS (
                SELECT 1 FROM partner_organization_members other
                WHERE other.organization_id = m.organization_id
                  AND other.user_id <> m.user_id
                  AND other.role = 'owner' AND other.is_active
              )
          )
          ON CONFLICT (venue_id, reason) WHERE status = 'pending' DO NOTHING
        `);
        await tx.execute(sql`
          UPDATE partner_organizations o SET status = 'suspended', updated_at = now()
          WHERE o.id IN (
            SELECT m.organization_id
            FROM partner_organization_members m
            WHERE m.user_id = ${user.id} AND m.role = 'owner' AND m.is_active
              AND NOT EXISTS (
                SELECT 1 FROM partner_organization_members other
                WHERE other.organization_id = m.organization_id
                  AND other.user_id <> m.user_id
                  AND other.role = 'owner' AND other.is_active
              )
          )
        `);
        await tx
          .update(bookingRequests)
          .set(BOOKING_CLIENT_ERASURE)
          .where(eq(bookingRequests.clientUserId, user.id));
        await tx.delete(users).where(eq(users.id, user.id));
      });
    }
  }

  return NextResponse.json({ success: true });
}
