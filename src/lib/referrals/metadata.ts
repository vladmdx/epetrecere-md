export type ReferralLedgerMetadata = Readonly<{
  recoveredBy?: "onboarding_reconciler";
}>;

/** Defense-in-depth boundary for the retained financial ledger. Never persist
 * event dates, booking/vendor identifiers, arbitrary future callsite data, or
 * any other metadata beyond this non-identifying operational marker. */
export function sanitizeReferralLedgerMetadata(
  input: unknown,
): ReferralLedgerMetadata {
  if (
    input
    && typeof input === "object"
    && !Array.isArray(input)
    && (input as Record<string, unknown>).recoveredBy
      === "onboarding_reconciler"
  ) {
    return { recoveredBy: "onboarding_reconciler" };
  }
  return {};
}
