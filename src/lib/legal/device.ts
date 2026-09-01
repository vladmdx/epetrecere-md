/**
 * A readable device description, from a user agent string.
 *
 * The acceptance row has stored `user_agent` since the beginning and the
 * admin screen labels it "device" — but it prints the raw string, so what an
 * administrator actually reads is 140 characters of
 * `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 …`.
 * For evidence about where a contract was signed, that is not an answer.
 *
 * Deliberately small and dependency-free. A full UA database would be more
 * precise about phone models, but this is a legal record, not analytics: it
 * has to say plainly whether the signature came from an iPhone, an Android
 * phone, or a browser on a desktop, and it must never be the reason an
 * acceptance fails to record.
 *
 * The raw string is kept alongside, so nothing is lost by summarising.
 */

/** The app sends `ePetrecere-ios/<version>` / `ePetrecere-android/<version>`. */
const APP_CLIENT = /^ePetrecere-(ios|android)\/(\S+)/i;

export function describeDevice(
  userAgent: string | null | undefined,
  appClient?: string | null,
): string | null {
  const app = appClient?.match(APP_CLIENT);
  if (app) {
    const os = app[1]!.toLowerCase() === "ios" ? "iOS" : "Android";
    return `Aplicația ePetrecere ${app[2]} · ${os}`;
  }

  const ua = (userAgent ?? "").trim();
  if (!ua) return null;

  // Order matters: an Edge UA also says Chrome, a Chrome UA also says Safari.
  const browser =
    /\bEdg\//.test(ua) ? "Edge"
    : /\bOPR\/|\bOpera\//.test(ua) ? "Opera"
    : /\bFirefox\//.test(ua) ? "Firefox"
    : /\bChrome\//.test(ua) ? "Chrome"
    : /\bSafari\//.test(ua) ? "Safari"
    : null;

  const os =
    /\biPhone\b/.test(ua) ? "iPhone"
    : /\biPad\b/.test(ua) ? "iPad"
    : /\bAndroid\b/.test(ua) ? "Android"
    : /\bMac OS X\b|\bMacintosh\b/.test(ua) ? "macOS"
    : /\bWindows NT\b/.test(ua) ? "Windows"
    : /\bLinux\b/.test(ua) ? "Linux"
    : null;

  const kind =
    /\biPhone\b|\bAndroid\b.*\bMobile\b|\bMobile\b.*\bAndroid\b/.test(ua)
      ? "telefon"
      : /\biPad\b|\bTablet\b/.test(ua)
        ? "tabletă"
        : "computer";

  const parts = [browser, os].filter(Boolean);
  if (!parts.length) return `Necunoscut · ${kind}`;
  return `${parts.join(" · ")} · ${kind}`;
}
