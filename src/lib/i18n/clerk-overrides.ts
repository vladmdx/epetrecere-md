/**
 * Missing translations for the Clerk widgets.
 *
 * @clerk/localizations ships incomplete bundles. Measured against enUS on
 * 4.4.0: roRO is missing 27 keys outright and leaves ~106 more either
 * undefined or byte-identical to English; ruRU is worse. Most sit in features
 * this site doesn't use (SAML, organizations, API keys, billing), but one is
 * right in the sign-up form: sign-up reads
 * formFieldInputPlaceholder__signUpPassword — a different key from sign-in's
 * formFieldInputPlaceholder__password — and neither roRO nor ruRU defines it,
 * so Clerk fell back to English and the field read "Create a password" under
 * a Romanian label. That is the first thing a visitor sees.
 *
 * Only the keys reachable in this app's flows are filled in: email + password
 * sign-up/sign-in, Google, password reset, and the user button. The rest stay
 * as upstream ships them.
 *
 * To find what is still English after a Clerk upgrade:
 *   node -e "const l=require('@clerk/localizations'); …" — diff roRO/ruRU
 *   against enUS and look for equal or missing values.
 */

import { roRO } from "@clerk/localizations";

/**
 * The shape Clerk expects. Taken from a shipped bundle rather than imported
 * from @clerk/types: that package is a deprecated shim, is not a direct
 * dependency here, and is absent from package-lock.json — importing it builds
 * locally off a stale node_modules and fails `npm ci` on Vercel.
 */
type Localization = typeof roRO;

export const CLERK_RO_OVERRIDES: Localization = {
  formFieldInputPlaceholder__signUpPassword: "Creează o parolă",
  formFieldInputPlaceholder__username: "Introdu numele de utilizator",
  formFieldInput__emailAddress_format: "Format: nume@exemplu.com",
  badge__banned: "Blocat",
  signIn: {
    passwordCompromised: { title: "Parolă compromisă" },
    passwordUntrusted: { title: "Parolă nesigură" },
  },
  userButton: {
    action__openUserMenu: "Deschide meniul contului",
    action__closeUserMenu: "Închide meniul contului",
  },
  unstable__errors: {
    form_new_password_matches_current:
      "Parola nouă nu poate fi aceeași cu cea actuală.",
    form_password_untrusted__sign_in:
      "Parola ta ar putea fi compromisă. Pentru siguranța contului, autentifică-te printr-o altă metodă. Va trebui să îți schimbi parola după autentificare.",
  },
} as Localization;

export const CLERK_RU_OVERRIDES: Localization = {
  formFieldInputPlaceholder__signUpPassword: "Придумайте пароль",
  formFieldInput__emailAddress_format: "Формат: имя@пример.com",
  badge__banned: "Заблокирован",
  signIn: {
    passwordCompromised: { title: "Пароль скомпрометирован" },
    passwordUntrusted: { title: "Ненадёжный пароль" },
  },
  unstable__errors: {
    form_new_password_matches_current:
      "Новый пароль не может совпадать с текущим.",
    form_password_length_too_short:
      "Пароль слишком короткий — минимум 8 символов.",
    form_password_untrusted__sign_in:
      "Ваш пароль может быть скомпрометирован. Войдите другим способом — после входа потребуется сменить пароль.",
    form_username_invalid_length:
      "Имя пользователя должно содержать от {{min_length}} до {{max_length}} символов.",
  },
} as Localization;

/** Deep-merge the overrides over a shipped bundle (overrides win). */
export function mergeLocalization(
  base: Localization,
  overrides: Localization,
): Localization {
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [key, value] of Object.entries(
    overrides as Record<string, unknown>,
  )) {
    const existing = out[key];
    out[key] =
      value && typeof value === "object" && !Array.isArray(value) &&
      existing && typeof existing === "object" && !Array.isArray(existing)
        ? mergeLocalization(existing as Localization, value as Localization)
        : value;
  }
  return out as Localization;
}
