/**
 * Commission rule configuration (admin only).
 *
 * The artist rate is fixed at 5% by the Partner Agreement, but the venue
 * tiers are deliberately blank in the legal pack ("approved separately",
 * Tariffs §4) — so they are configured here rather than hardcoded.
 */

import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { getCommissionRules, saveCommissionRules } from "@/lib/commissions/service";
import { normalizeRules } from "@/lib/commissions/rules";

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return NextResponse.json({ error: admin.error }, { status: admin.status });
  }
  return NextResponse.json(await getCommissionRules());
}

export async function PUT(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return NextResponse.json({ error: admin.error }, { status: admin.status });
  }
  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  // normalizeRules drops anything unexpected and fills gaps with defaults, so
  // a malformed edit can never produce a rule that silently charges wrongly.
  const rules = normalizeRules(body);
  await saveCommissionRules(rules);
  return NextResponse.json({ success: true, rules });
}
