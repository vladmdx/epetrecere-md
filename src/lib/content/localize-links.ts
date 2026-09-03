import { localizePath, type AppLocale } from "@/lib/i18n/routing";

/** Preserve the language when following internal links in editorial HTML. */
export function localizeContentLinks(html: string, locale: AppLocale): string {
  return html.replace(/(<a\b[^>]*\bhref\s*=\s*)(["'])([^"']*)\2/gi, (match, prefix, quote, href: string) => {
    let pathname = href;
    if (/^https:\/\/epetrecere\.md(?:\/|$)/i.test(href)) {
      const url = new URL(href);
      pathname = url.pathname + url.search + url.hash;
    }
    if (!pathname.startsWith("/") || pathname.startsWith("//")) return match;
    return prefix + quote + localizePath(pathname, locale) + quote;
  });
}
