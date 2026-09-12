import { NextResponse } from "next/server";
import type { AccessError } from "@/lib/venue-access";

export function jsonAccess(access: AccessError) {
  return NextResponse.json({ error: access.error, code: access.status === 401 ? "UNAUTHORIZED" : "FORBIDDEN" }, { status: access.status });
}

export function jsonError(error: string, status: number, extra?: Record<string, unknown>) {
  return NextResponse.json({ error, ...extra }, { status });
}
