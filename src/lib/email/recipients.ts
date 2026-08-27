/**
 * Who counts as "the administrators" for a notification.
 *
 * Every admin-notification query used to filter on `role = 'super_admin'`, so
 * an account with role `admin` — which passes every requireAdmin() gate and
 * sees the whole admin panel — silently received nothing. With a second
 * administrator joining, that is a hole in the notification path, not a
 * detail. This is now the single place that answers the question.
 */

import { inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

export interface AdminRecipient {
  id: string;
  email: string | null;
}

export async function getAdminRecipients(): Promise<AdminRecipient[]> {
  return db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(inArray(users.role, ["admin", "super_admin"]));
}
