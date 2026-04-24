// Admin audit log helper. Every sensitive admin mutation should call
// `logAdminAction(...)` after success so we have a forensic trail.
//
// Never throws — admin actions should not fail because audit is down.

import { db } from "@/lib/db";
import { adminAuditLog } from "@/lib/db/schema";

export interface LogInput {
  adminUserId: string;
  /** dotted scope — "bulk.delete", "registration.approve", etc. */
  action: string;
  entity?: string;
  entityIds?: number[];
  metadata?: Record<string, unknown>;
  /** From `headers().get("x-forwarded-for")` if available. */
  ip?: string;
  userAgent?: string;
}

export async function logAdminAction(input: LogInput): Promise<void> {
  try {
    await db.insert(adminAuditLog).values({
      adminUserId: input.adminUserId,
      action: input.action,
      entity: input.entity ?? null,
      entityIds: input.entityIds ?? [],
      metadata: input.metadata ?? {},
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
    });
  } catch (err) {
    console.error("[audit] log failed:", err);
  }
}
