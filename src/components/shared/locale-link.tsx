"use client";

/**
 * Drop-in replacement for `next/link` that keeps the visitor in their language.
 *
 * With path-based i18n a plain `<Link href="/sali">` on /ru/... would send a
 * Russian visitor to the Romanian page. Rather than rewriting ~200 hrefs, this
 * wrapper reads the active locale from the URL and prefixes the target, so the
 * change is a one-line import swap per file and new links stay correct by
 * default.
 *
 * Absolute URLs, anchors, mailto/tel and /api paths pass through untouched.
 */

import NextLink from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { forwardRef, useCallback, useMemo } from "react";
import type { ComponentProps } from "react";
import { localizePath, splitLocale, type AppLocale } from "@/lib/i18n/routing";

type Props = ComponentProps<typeof NextLink>;

function shouldSkip(href: string): boolean {
  return (
    href.startsWith("http") ||
    href.startsWith("#") ||
    href.startsWith("mailto:") ||
    href.startsWith("tel:") ||
    href.startsWith("/api")
  );
}

function localizeHref(href: string, locale: AppLocale): string {
  if (shouldSkip(href)) return href;
  // Preserve query/hash while prefixing only the path part.
  const [path, tail] = href.split(/(?=[?#])/, 2);
  return localizePath(path || "/", locale) + (tail ?? "");
}

const LocaleLink = forwardRef<HTMLAnchorElement, Props>(function LocaleLink(
  { href, ...rest },
  ref,
) {
  const pathname = usePathname() || "/";
  const { locale } = splitLocale(pathname);

  const finalHref =
    typeof href === "string" ? localizeHref(href, locale) : href;

  return <NextLink ref={ref} href={finalHref} {...rest} />;
});

/**
 * The same prefixing for a path that is not an `href`: a `redirect_url`
 * payload, a value stashed for a later navigation. Without it the round trip
 * still lands in Romanian even when the link that starts it is localized.
 */
export function useLocalizePath(): (href: string) => string {
  const pathname = usePathname() || "/";
  const { locale } = splitLocale(pathname);
  return useCallback((href: string) => localizeHref(href, locale), [locale]);
}

/**
 * `useRouter()` with the same prefixing as <LocaleLink>.
 *
 * Programmatic navigation was the remaining hole in path-based i18n: a bare
 * `router.push("/sign-in")` drops a Russian visitor onto the Romanian route
 * tree, and once they are inside /cabinet nothing links back out to their
 * language — so the loss is permanent, not just for one page.
 */
export function useLocalizedRouter() {
  const router = useRouter();
  const localize = useLocalizePath();

  return useMemo(
    () => ({
      ...router,
      localize,
      push: (href: string, options?: Parameters<typeof router.push>[1]) =>
        router.push(localize(href), options),
      replace: (href: string, options?: Parameters<typeof router.replace>[1]) =>
        router.replace(localize(href), options),
    }),
    [router, localize],
  );
}

export default LocaleLink;
