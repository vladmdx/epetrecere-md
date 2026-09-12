/**
 * Server-only feature flags.
 *
 * The multi-organization / multi-venue / multi-hall model is rolled out behind
 * a flag so the schema and authorization layer can land (phases 0–2) with zero
 * behavioural change until onboarding, catalog and booking are ready and the
 * data is migrated. Default OFF everywhere, including production.
 *
 * Read flags through the helpers below so there is a single place to change the
 * source (env today, a settings row or per-account targeting later). Never read
 * `process.env.FEATURE_*` directly in feature code.
 *
 * This module is server-only: it must not be imported into client components.
 */

function envFlag(name: string): boolean {
  const raw = process.env[name];
  if (!raw) return false;
  const v = raw.trim().toLowerCase();
  return v === "1" || v === "true" || v === "on" || v === "yes";
}

export type FeatureFlag = "MULTI_HALL";

const FLAG_ENV: Record<FeatureFlag, string> = {
  // Multi-organization / multi-venue / multi-hall model (ADR 0028).
  MULTI_HALL: "FEATURE_MULTI_HALL",
};

/** Whether a feature flag is enabled in the current runtime. Default false. */
export function isFeatureEnabled(flag: FeatureFlag): boolean {
  return envFlag(FLAG_ENV[flag]);
}

/** Convenience accessor for the multi-hall rollout. */
export function isMultiHallEnabled(): boolean {
  return isFeatureEnabled("MULTI_HALL");
}
