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

export class MultiHallFeatureDisabledError extends Error {
  readonly code = MULTI_HALL_DISABLED_CODE;
  readonly status = 404;
  constructor() {
    super("FEATURE_DISABLED");
    this.name = "MultiHallFeatureDisabledError";
  }
}

export function assertMultiHallMutationsAllowed() {
  if (!multiHallMutationsAllowed()) {
    throw new MultiHallFeatureDisabledError();
  }
}

export function jsonIfMultiHallDisabled() {
  if (multiHallMutationsAllowed()) return null;
  return jsonError("FEATURE_DISABLED", 404, { code: MULTI_HALL_DISABLED_CODE });
}

/** Hall-specific image writes stay legacy-editable only when hallId is null. */
export function jsonIfHallSpecificImageDisabled(hallId: number | null | undefined) {
  if (hallId == null) return null;
  return jsonIfMultiHallDisabled();
}

export function jsonIfOrganizationBackedVenueDisabled(organizationId: number | null | undefined) {
  if (organizationId == null) return null;
  return jsonIfMultiHallDisabled();
}

/** Inverse gate: legacy routes that must not run while multi-hall is ON. */
export function jsonIfMultiHallEnabled() {
  if (!multiHallMutationsAllowed()) return null;
  return jsonError("FEATURE_DISABLED", 404, { code: MULTI_HALL_DISABLED_CODE });
}
