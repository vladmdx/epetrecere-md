import type { db } from "@/lib/db";
import { eventPlans, guestList, seatAssignments } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** All capacity-changing planner writes take this same owner-scoped lock
 * first. This serializes assign/move/resize/party-size edits, including two
 * requests filling the last seats or moving the same group between tables.
 * No network calls belong inside the transaction. */
export async function lockSeatingPlan(tx: Transaction, planId: number, userId: string) {
  const [plan] = await tx.select({ id: eventPlans.id }).from(eventPlans)
    .where(and(eq(eventPlans.id, planId), eq(eventPlans.userId, userId))).for("update");
  return Boolean(plan);
}

export async function tableOccupants(tx: Transaction, planId: number, tableId: number) {
  return tx.select({ id: guestList.id, guestType: guestList.guestType,
    partySize: guestList.partySize, kidsCount: guestList.kidsCount, plusOnes: guestList.plusOnes })
    .from(seatAssignments).innerJoin(guestList, eq(guestList.id, seatAssignments.guestId))
    .where(and(eq(seatAssignments.tableId, tableId), eq(guestList.planId, planId)));
}
