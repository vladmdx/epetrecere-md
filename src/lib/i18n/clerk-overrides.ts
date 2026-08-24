/**
 * Missing translations for the Clerk widgets.
 *
 * @clerk/localizations ships incomplete bundles. Measured against enUS on
 * 4.13.10, which defines 1396 strings: roRO leaves 477 of them undefined and
 * ruRU 696, and Clerk renders English wherever a value is missing. Most sit in
 * features this site doesn't use (SAML, organizations, API keys, billing), but
 * some are right in the auth card: sign-up reads
 * formFieldInputPlaceholder__signUpPassword — a different key from sign-in's
 * formFieldInputPlaceholder__password — and neither roRO nor ruRU defines it,
 * so Clerk fell back to English and the field read "Create a password" under
 * a Romanian label. That is the first thing a visitor sees.
 *
 * Only the keys reachable in this app's flows are filled in: email + password
 * sign-up/sign-in, Google, the bot check that fronts both, password reset, and
 * the user button. The rest stay as upstream ships them.
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

/** Clerk shows the same bot check ahead of sign-in and ahead of sign-up. */
const PROTECT_CHECK_RO = {
  title: "Verificăm cererea",
  subtitle: "Te rugăm să aștepți cât verificăm cererea.",
  loading: "Se încarcă…",
  retryButton: "Încearcă din nou",
};

const PROTECT_CHECK_RU = {
  title: "Проверяем ваш запрос",
  subtitle: "Подождите, пока мы проверяем запрос.",
  loading: "Загрузка…",
  retryButton: "Попробовать снова",
};

export const CLERK_RO_OVERRIDES: Localization = {
  formFieldInputPlaceholder__signUpPassword: "Creează o parolă",
  formFieldInputPlaceholder__username: "Introdu numele de utilizator",
  formFieldInput__emailAddress_format: "Format: nume@exemplu.com",
  badge__banned: "Blocat",
  signIn: {
    passwordCompromised: { title: "Parolă compromisă" },
    passwordUntrusted: { title: "Parolă nesigură" },
    protectCheck: PROTECT_CHECK_RO,
  },
  signUp: {
    protectCheck: PROTECT_CHECK_RO,
  },
  userButton: {
    action__openUserMenu: "Deschide meniul contului",
    action__closeUserMenu: "Închide meniul contului",
  },
  unstable__errors: {
    action_blocked:
      "Acțiunea nu a putut fi finalizată. Încearcă din nou mai târziu sau contactează suportul dacă problema persistă.",
    oauth_access_denied: "Nu ai acordat accesul la contul tău.",
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
  // Upstream ruRU says "Продолжить с помощью Google"; the shorter wording is
  // what the client signed off on.
  socialButtonsBlockButton: "Продолжить с {{provider|titleize}}",
  signIn: {
    passwordCompromised: { title: "Пароль скомпрометирован" },
    passwordUntrusted: { title: "Ненадёжный пароль" },
    protectCheck: PROTECT_CHECK_RU,
  },
  signUp: {
    protectCheck: PROTECT_CHECK_RU,
  },
  unstable__errors: {
    action_blocked:
      "Действие не удалось выполнить. Повторите попытку позже или обратитесь в поддержку, если это повторится.",
    oauth_access_denied: "Вы не предоставили доступ к своему аккаунту.",
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
