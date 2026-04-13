import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { auth, currentUser } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { artists, users, notifications } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { slugify } from "@/lib/utils/slugify";

const registerSchema = z.object({
  name: z.string().min(2),
  phone: z.string().min(6),
  categoryId: z.number(),
  description: z.string().optional(),
  location: z.string().optional(),
  imageUrl: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    // Auth: use Clerk session
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.message },
        { status: 400 },
      );
    }

    // Look up the app user by clerkId
    let [appUser] = await db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(eq(users.clerkId, clerkId))
      .limit(1);

    // If user not in DB yet (webhook delay), create them on the fly
    if (!appUser) {
      const clerkUser = await currentUser();
      if (!clerkUser) {
        return NextResponse.json(
          { error: "Could not load user profile" },
          { status: 500 },
        );
      }

      const email = clerkUser.primaryEmailAddress?.emailAddress;
      if (!email) {
        return NextResponse.json(
          { error: "No email found on account" },
          { status: 400 },
        );
      }

      const [created] = await db
        .insert(users)
        .values({
          clerkId,
          email,
          name: [clerkUser.firstName, clerkUser.lastName]
            .filter(Boolean)
            .join(" ") || null,
          phone: clerkUser.phoneNumbers?.[0]?.phoneNumber || null,
          avatarUrl: clerkUser.imageUrl || null,
          role: "user",
        })
        .onConflictDoNothing()
        .returning({ id: users.id, email: users.email });

      if (created) {
        appUser = created;
      } else {
        // Conflict means the user was created between our check and insert
        const [existing] = await db
          .select({ id: users.id, email: users.email })
          .from(users)
          .where(eq(users.clerkId, clerkId))
          .limit(1);
        if (!existing) {
          return NextResponse.json(
            { error: "User creation failed" },
            { status: 500 },
          );
        }
        appUser = existing;
      }
    }

    // Check if already registered as artist
    const [existingArtist] = await db
      .select({ id: artists.id })
      .from(artists)
      .where(eq(artists.userId, appUser.id))
      .limit(1);

    if (existingArtist) {
      return NextResponse.json(
        { error: "Already registered as artist", artistId: existingArtist.id },
        { status: 409 },
      );
    }

    const data = parsed.data;
    let slug = slugify(data.name);
    slug = `${slug}-${Date.now().toString(36)}`;

    // Create artist (inactive — needs admin approval)
    const [artist] = await db
      .insert(artists)
      .values({
        userId: appUser.id,
        nameRo: data.name,
        nameRu: data.name,
        nameEn: data.name,
        slug,
        phone: data.phone,
        email: appUser.email,
        descriptionRo: data.description || null,
        location: data.location || "Chișinău",
        categoryIds: [data.categoryId],
        isActive: false,
        isVerified: false,
        isFeatured: false,
        isPremium: false,
        calendarEnabled: false,
        seoTitleRo: `${data.name} — Artist Evenimente | ePetrecere.md`,
      })
      .returning();

    // Update user role to artist
    await db
      .update(users)
      .set({ role: "artist" })
      .where(eq(users.id, appUser.id));

    // Notify admins (in-app + email)
    const admins = await db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(eq(users.role, "super_admin"));
    for (const admin of admins) {
      await db.insert(notifications).values({
        userId: admin.id,
        type: "artist_registered",
        title: "Artist nou înregistrat!",
        message: `${data.name} (${appUser.email}) s-a înregistrat ca artist și așteaptă aprobare.`,
        actionUrl: `/admin/cereri-inregistrare`,
      });

      // Email notification to admin
      if (admin.email) {
        const { sendEmail } = await import("@/lib/email/send");
        await sendEmail({
          to: admin.email,
          subject: `🔔 Artist nou: ${data.name} așteaptă aprobare`,
          html: `<div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:20px;background:#1A1A2E;border-radius:12px;color:#FAF8F2;">
            <h2 style="color:#C9A84C;margin:0 0 16px;">Artist Nou Înregistrat</h2>
            <p><strong>${data.name}</strong> (${appUser.email}) s-a înregistrat ca artist.</p>
            <p>Telefon: ${data.phone}</p>
            <p>Oraș: ${data.location || "Nespecificat"}</p>
            <div style="margin-top:20px;text-align:center;">
              <a href="https://epetrecere.md/admin/cereri-inregistrare" style="display:inline-block;background:#C9A84C;color:#0D0D0D;padding:10px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">Vezi cererea →</a>
            </div>
          </div>`,
        }).catch((err) => console.error("[register-artist] Email failed:", err));
      }
    }

    return NextResponse.json({ success: true, artistId: artist.id });
  } catch (err) {
    console.error("[register-artist] Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
