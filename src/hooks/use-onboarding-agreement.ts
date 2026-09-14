"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LEGAL_PACK_VERSION } from "@/lib/legal";
import type { OnboardingAgreementStatus, SavedOnboardingAgreement } from "@/lib/legal/onboarding-agreement";
import type { ESignatureValue } from "@/components/legal/e-signature";
import { onboardingAgreementText } from "@/components/legal/onboarding-agreement-text";

type Locale = "ro" | "ru" | "en";
type RemoteState = {
  scopeKey?: string;
  loading: boolean;
  error: boolean;
  value: OnboardingAgreementStatus | null;
};

function sameAgreement(a: SavedOnboardingAgreement | null, b: SavedOnboardingAgreement | null) {
  return a && b && a.subjectType === b.subjectType && a.documents.length === b.documents.length &&
    a.documents.every(doc => b.documents.some(other => other.id === doc.id));
}

function matchesSignature(agreement: SavedOnboardingAgreement, signature: ESignatureValue, locale: Locale) {
  return agreement.locale === locale && agreement.signatureName === signature.signatureName.trim() &&
    (["partnerType", "legalName", "idNumber", "legalAddress", "representativeName"] as const)
      .every(key => (agreement.identity[key] ?? null) === (signature.identity[key] ?? null));
}

/** A saved contract is authoritative, never reconstructed from editable form
 * data or localStorage. Both registering routes independently enforce the
 * current contract gate again before creating the profile.
 */
export function useOnboardingAgreement(subjectType: "artist" | "venue", accountId: string | undefined, locale: Locale, organizationId?: number) {
  const [remote, setRemote] = useState<RemoteState>({ loading: true, error: false, value: null });
  const requestGeneration = useRef(0);
  const text = onboardingAgreementText[locale];
  // A venue contract belongs to one organization, not merely to the Clerk
  // account. Keeping the organization in the client state identity prevents a
  // previously rendered/signed agreement for organization A from being reused
  // while the same actor navigates to organization B.
  const scopeKey = accountId
    ? `${subjectType}:${accountId}:${organizationId ?? "personal"}`
    : undefined;
  const state = remote.scopeKey === scopeKey
    ? remote
    : { loading: true, error: false, value: null };

  const refresh = useCallback(async () => {
    if (!accountId) throw new Error("account_required");
    const generation = ++requestGeneration.current;
    // A pre-submit verification must not unmount a completed signature form.
    setRemote(old => old.scopeKey === scopeKey && old.value
      ? { ...old, error: false }
      : { scopeKey, loading: true, error: false, value: null });
    try {
      const response = await fetch(`/api/legal/accept${organizationId ? `?organizationId=${organizationId}` : ""}`, { cache: "no-store" });
      if (!response.ok) throw new Error("agreement_verification_failed");
      const data = await response.json();
      const value = data.onboarding?.[subjectType] as OnboardingAgreementStatus | undefined;
      if (!value || !["unsigned", "resumable", "blocked"].includes(value.status) ||
        (value.status === "resumable" && !value.agreement)) throw new Error("agreement_verification_failed");
      if (generation !== requestGeneration.current) throw new Error("stale_agreement_check");
      setRemote({ scopeKey, loading: false, error: false, value });
      return value;
    } catch (error) {
      if (generation === requestGeneration.current) {
        setRemote({ scopeKey, loading: false, error: true, value: null });
      }
      throw error;
    }
  }, [accountId, organizationId, scopeKey, subjectType]);

  useEffect(() => {
    if (accountId) void refresh().catch(() => {});
    return () => { requestGeneration.current += 1; };
  }, [accountId, refresh]);

  async function prepare(signature: ESignatureValue | null) {
    let verified: OnboardingAgreementStatus;
    try { verified = await refresh(); } catch { throw new Error(text.unavailable); }
    if (verified.status === "blocked") throw new Error(text.blocked);
    if (verified.status === "resumable") {
      // A previously unseen agreement (another tab, an uncertain POST, or a
      // reload) must be displayed before the user explicitly submits with it.
      if (!sameAgreement(state.value?.agreement ?? null, verified.agreement)) throw new Error(text.reviewSaved);
      return;
    }
    if (!signature?.accepted) throw new Error(text.signFirst);
    let response: Response;
    try {
      response = await fetch("/api/legal/accept", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subjectType, organizationId, accepted: true, packVersion: LEGAL_PACK_VERSION,
          signatureName: signature.signatureName, signatureImage: signature.signatureImage,
          documents: signature.documents, identity: signature.identity, locale }),
      });
    } catch {
      // A lost HTTP response does not mean signing failed. Fetch the durable
      // evidence and show it; do not automatically submit a different party.
      const saved = await refresh().catch(() => null);
      throw new Error(saved?.status === "resumable" ? text.reviewSaved : text.unavailable);
    }
    if (!response.ok) {
      const failure = await response.json().catch(() => ({}));
      const saved = await refresh().catch(() => null);
      if (saved?.status === "resumable") throw new Error(text.reviewSaved);
      if (saved?.status === "blocked") throw new Error(text.blocked);
      throw new Error(failure.error === "verified_email_required" ? text.verifyEmail : text.signingFailed);
    }
    const saved = await refresh().catch(() => null);
    if (!saved) throw new Error(text.unavailable);
    if (!saved.agreement || saved.status !== "resumable") throw new Error(text.blocked);
    if (!matchesSignature(saved.agreement, signature, locale)) throw new Error(text.reviewSaved);
    // The signed card is now shown even if the following register call fails.
  }

  return { ...state, refresh, prepare };
}
