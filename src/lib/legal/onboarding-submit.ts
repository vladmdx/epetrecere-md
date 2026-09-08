export type OnboardingAgreementUiStatus = "unsigned" | "resumable" | "blocked" | null | undefined;

/**
 * Missing form values must never make the final button inert: pressing it is
 * how the user asks the UI to reveal every unmet requirement. Only work that
 * cannot safely be started twice, an initial server check, or a durable legal
 * block disables the control.
 */
export function onboardingSubmitDisabled({
  busy,
  agreementLoading,
  agreementStatus,
}: {
  busy: boolean;
  agreementLoading: boolean;
  agreementStatus: OnboardingAgreementUiStatus;
}): boolean {
  return busy || agreementLoading || agreementStatus === "blocked";
}
