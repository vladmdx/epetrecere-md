export const CONSENT_STORAGE_KEY = "epetrecere-consent-v2";
export const CONSENT_COOKIE_KEY = "ep_consent";
export const CONSENT_VERSION = "2026-08-23.1";
export const CONSENT_UPDATED_EVENT = "epetrecere:consent-updated";
export const OPEN_CONSENT_EVENT = "epetrecere:open-consent";

export type OptionalConsentCategory = "preferences" | "analytics" | "marketing";

export interface ConsentPreferences {
  version: typeof CONSENT_VERSION;
  necessary: true;
  preferences: boolean;
  analytics: boolean;
  marketing: boolean;
  updatedAt: string;
}

export function readConsent(): ConsentPreferences | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CONSENT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ConsentPreferences;
    if (
      parsed.version !== CONSENT_VERSION ||
      parsed.necessary !== true ||
      typeof parsed.preferences !== "boolean" ||
      typeof parsed.analytics !== "boolean" ||
      typeof parsed.marketing !== "boolean"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function hasPrivacyConsent(category: OptionalConsentCategory): boolean {
  return readConsent()?.[category] === true;
}

export function saveConsent(
  choices: Pick<ConsentPreferences, OptionalConsentCategory>,
): ConsentPreferences {
  const consent: ConsentPreferences = {
    version: CONSENT_VERSION,
    necessary: true,
    ...choices,
    updatedAt: new Date().toISOString(),
  };

  localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(consent));
  document.cookie = `${CONSENT_COOKIE_KEY}=${encodeURIComponent(JSON.stringify({
    v: CONSENT_VERSION,
    p: consent.preferences,
    a: consent.analytics,
    m: consent.marketing,
    t: consent.updatedAt,
  }))};path=/;max-age=31536000;SameSite=Lax;Secure`;
  window.dispatchEvent(new CustomEvent(CONSENT_UPDATED_EVENT, { detail: consent }));
  return consent;
}

export function openConsentSettings() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(OPEN_CONSENT_EVENT));
  }
}
