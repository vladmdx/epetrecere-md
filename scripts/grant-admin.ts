// Promote a user to super_admin (unlocks /admin + every admin-gated API).
//
// Re-run from the project root:
//   DATABASE_URL='…' npx tsx scripts/grant-admin.ts <email>              # dry run
//   CONFIRM=yes DATABASE_URL='…' npx tsx scripts/grant-admin.ts <email>  # apply
//
// Admin access is decided by users.role (see src/lib/auth/admin.ts), not by
// anything in Clerk — so a normal signed-in account stays 403 on /api/* until
// this flips the row.

// Load .env.local first (Next.js convention — that's where the local
// DATABASE_URL lives), then fall back to .env. Neither is committed: .gitignore
// ignores .env*.
import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) {
    console.error("Usage: DATABASE_URL='…' npx tsx scripts/grant-admin.ts <email>");
    process.exit(1);
  }

  const [user] = await db
    .select({ id: users.id, email: users.email, name: users.name, role: users.role })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!user) {
    console.error(`✗ No user with email ${email}. Sign in on the site once, then re-run.`);
    process.exit(1);
  }

  console.log("\n=== Grant admin ===");
  console.log(`User        : ${user.name ?? "(no name)"} <${user.email}>`);
  console.log(`Current role: ${user.role}`);
  console.log(`New role    : super_admin`);

  if (user.role === "super_admin") {
    console.log("\n✓ Already super_admin — nothing to do.\n");
    process.exit(0);
  }

  if (process.env.CONFIRM !== "yes") {
    console.log(
      "\nDry run only. Nothing was changed. To apply:\n" +
        `  CONFIRM=yes DATABASE_URL='…' npx tsx scripts/grant-admin.ts ${email}\n`,
    );
    process.exit(0);
  }

  await db.update(users).set({ role: "super_admin" }).where(eq(users.id, user.id));

  const [after] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);

  console.log(`\n✓ Done. Role is now: ${after?.role}. Reload the site and open /admin.\n`);
  process.exit(0);
}

main().catch((err) => {
  console.error("✗ Failed:");
  console.error(err);
  process.exit(1);
});
