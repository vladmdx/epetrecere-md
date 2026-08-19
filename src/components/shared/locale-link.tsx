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
import { usePathname } from "next/navigation";
import { forwardRef } from "react";
import type { ComponentProps } from "react";
import { localizePath, splitLocale } from "@/lib/i18n/routing";

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

const LocaleLink = forwardRef<HTMLAnchorElement, Props>(function LocaleLink(
  { href, ...rest },
  ref,
) {
  const pathname = usePathname() || "/";
  const { locale } = splitLocale(pathname);

  let finalHref = href;
  if (typeof href === "string" && !shouldSkip(href)) {
    // Preserve query/hash while prefixing only the path part.
    const [path, tail] = href.split(/(?=[?#])/, 2);
    finalHref = localizePath(path || "/", locale) + (tail ?? "");
  }

  return <NextLink ref={ref} href={finalHref} {...rest} />;
});

export default LocaleLink;
