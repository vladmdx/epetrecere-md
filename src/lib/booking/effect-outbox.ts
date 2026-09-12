import { bookingEffectOutbox } from "@/lib/db/schema";
import { db } from "@/lib/db";

type Executor = typeof db;

/** Returns true when this booking/effect pair was recorded for the first time. */
export async function claimBookingEffect(
  executor: Executor,
  bookingId: number,
  effectKey: string,
): Promise<boolean> {
  const [row] = await executor
    .insert(bookingEffectOutbox)
    .values({ bookingId, effectKey })
    .onConflictDoNothing()
    .returning({ id: bookingEffectOutbox.id });
  return Boolean(row);
}
