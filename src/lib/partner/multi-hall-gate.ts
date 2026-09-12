/**
 * Central kill switch for MULTI_HALL mutations.
 * Flag OFF keeps legacy /dashboard/sala + onboarding behaviour.
 * New org/location/hall/block writes must go through this helper — not
 * ad-hoc env checks in each route.
 */
import { isMultiHallEnabled } from "@/lib/feature-flags";
import { jsonError } from "@/lib/http/json";

export const MULTI_HALL_DISABLED_CODE = "FEATURE_DISABLED" as const;

export function multiHallMutationsAllowed(): boolean {
  return isMultiHallEnabled();
}

/** Legacy sala dashboard and onboarding stay on their current routes. */
export function salaUsesLegacyLayout(): boolean {
  return !isMultiHallEnabled();
}

export function jsonIfMultiHallDisabled() {
  if (multiHallMutationsAllowed()) return null;
  return jsonError("FEATURE_DISABLED", 404, { code: MULTI_HALL_DISABLED_CODE });
}
