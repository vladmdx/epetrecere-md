// Admin finance — every platform fee owed by every vendor, in one table.
//
// Shows who booked which vendor, the order value, the applied rate and the
// resulting fee, plus manual settlement (payment happens off-platform).

import { requireAdmin } from "@/lib/auth/admin";
import { redirect } from "next/navigation";
import { FinanceClient } from "./client";
import { getCommissionRules } from "@/lib/commissions/service";

export const dynamic = "force-dynamic";

export default async function AdminFinancePage() {
  const admin = await requireAdmin();
  if (!admin.ok) redirect("/");
  const rules = await getCommissionRules();
  return <FinanceClient initialRules={rules} />;
}
