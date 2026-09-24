import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email/send";

type Sender = typeof sendEmail;

export async function enqueueRegistrationEmails(executor: typeof db, notificationIds: number[]) {
  for (const id of notificationIds) {
    await executor.execute(sql`
      INSERT INTO admin_registration_email_outbox (notification_id)
      VALUES (${id}) ON CONFLICT DO NOTHING
    `);
  }
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]!);
}

export function registrationEmailHtml(title: string, message: string) {
  const base = process.env.NEXT_PUBLIC_APP_URL || "https://epetrecere.md";
  return `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:24px">
    <h2>${escapeHtml(title)}</h2><p>${escapeHtml(message)}</p>
    <p><a href="${escapeHtml(new URL('/admin/cereri-inregistrare', base).href)}">Deschide cererile de înregistrare</a></p>
    <p>Contractele semnate sunt disponibile în secțiunea Contracte din panoul administrativ și se trimit separat ca PDF.</p>
  </div>`;
}

/**
 * Lock user -> notification -> queue (also the account-erasure cascade order).
 * A bounded provider call holds those locks so an administrator demotion or
 * deletion cannot commit between authorization and delivery. Concurrent drains
 * skip the locked queue row. Provider idempotency covers a lost commit, with a
 * 23-hour retry ceiling inside Resend's 24-hour idempotency retention window.
 */
export async function drainRegistrationEmails(options: {
  limit?: number;
  notificationIds?: number[];
  send?: Sender;
  providerTimeoutMs?: number;
} = {}) {
  const limit = Math.max(1, Math.min(20, options.limit ?? 10));
  const scope = options.notificationIds?.length
    ? sql`AND q.notification_id IN (${sql.join(options.notificationIds.map((id) => sql`${id}`), sql`, `)})`
    : sql``;
  const candidates = await db.execute<{ notification_id: number; user_id: string }>(sql`
    SELECT q.notification_id, n.user_id FROM admin_registration_email_outbox q
    JOIN notifications n ON n.id = q.notification_id
    WHERE q.status = 'pending' AND q.next_attempt_at <= now() ${scope}
    ORDER BY q.next_attempt_at, q.notification_id LIMIT ${limit}
  `);
  const result = { selected: candidates.length, delivered: 0, failed: 0, cancelled: 0, deadLettered: 0 };
  for (const candidate of candidates) {
    // Commit the retry-window anchor before any provider request. Even if a
    // later delivery transaction loses its commit, retries cannot outlive the
    // provider's idempotency window and silently deliver a duplicate.
    await db.execute(sql`UPDATE admin_registration_email_outbox
      SET first_attempt_at = COALESCE(first_attempt_at, now())
      WHERE notification_id = ${candidate.notification_id} AND status = 'pending'`);
    const outcome = await db.transaction(async (tx) => {
      const [recipient] = await tx.execute<{ email: string; role: string }>(sql`
        SELECT email, role FROM users WHERE id = ${candidate.user_id}::uuid FOR SHARE
      `);
      const [notification] = await tx.execute<{ title: string; message: string | null; type: string }>(sql`
        SELECT title, message, type FROM notifications
        WHERE id = ${candidate.notification_id} AND user_id = ${candidate.user_id}::uuid FOR SHARE
      `);
      const [job] = await tx.execute<{ attempts: number; first_attempt_at: Date | null; expired: boolean }>(sql`
        SELECT attempts, first_attempt_at,
          first_attempt_at < now() - interval '23 hours' AS expired
        FROM admin_registration_email_outbox
        WHERE notification_id = ${candidate.notification_id} AND status = 'pending'
          AND next_attempt_at <= now() FOR UPDATE SKIP LOCKED
      `);
      if (!job) return 'skipped';
      if (!recipient || !['admin', 'super_admin'].includes(recipient.role) || !recipient.email
        || !notification || !['venue_registered', 'artist_registered'].includes(notification.type)) {
        await tx.execute(sql`UPDATE admin_registration_email_outbox SET status = 'cancelled', last_error = NULL
          WHERE notification_id = ${candidate.notification_id}`);
        return 'cancelled';
      }
      if (job.expired || job.attempts >= 8) {
        await tx.execute(sql`UPDATE admin_registration_email_outbox SET status = 'dead_letter', last_error = 'retry_window_expired'
          WHERE notification_id = ${candidate.notification_id}`);
        return 'deadLettered';
      }
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), options.providerTimeoutMs ?? 5_000);
      timeout.unref?.();
      try {
        const response = await (options.send ?? sendEmail)({
          to: recipient.email,
          subject: notification.title,
          html: registrationEmailHtml(notification.title, notification.message ?? ''),
          idempotencyKey: `registration-email:${candidate.notification_id}`,
          signal: controller.signal,
        });
        if (response.error || !response.data?.id) throw new Error('provider_rejected');
        await tx.execute(sql`UPDATE admin_registration_email_outbox
          SET status = 'delivered', attempts = attempts + 1, delivered_at = now(),
            first_attempt_at = COALESCE(first_attempt_at, now()), last_error = NULL
          WHERE notification_id = ${candidate.notification_id}`);
        return 'delivered';
      } catch {
        await tx.execute(sql`UPDATE admin_registration_email_outbox
          SET attempts = attempts + 1, first_attempt_at = COALESCE(first_attempt_at, now()),
            next_attempt_at = now() + interval '5 minutes', last_error = 'email_delivery_failed'
          WHERE notification_id = ${candidate.notification_id}`);
        return 'failed';
      } finally {
        clearTimeout(timeout);
      }
    });
    if (outcome !== 'skipped') result[outcome] += 1;
  }
  const [backlog] = await db.execute<{ count: number }>(sql`
    SELECT count(*)::int AS count FROM admin_registration_email_outbox WHERE status = 'dead_letter'
  `);
  return { ...result, deadLetterBacklog: backlog?.count ?? 0 };
}
