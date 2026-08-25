"use client";

import { useLocale } from "@/hooks/use-locale";
import { useRouter, usePathname } from "next/navigation";
import { localizePath, splitLocale, type AppLocale } from "@/lib/i18n/routing";
import { locales, localeNames } from "@/i18n";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const localeFlags = {
  ro: "🇲🇩",
  ru: "🇷🇺",
  en: "🇬🇧",
} as const;

export function LanguageSwitcher() {
  const { locale, setLocale } = useLocale();
  const router = useRouter();
  const pathname = usePathname() || "/";

  function changeLocale(nextLocale: typeof locale) {
    // The URL carries the language now, so switching means NAVIGATING to the
    // sibling URL (/sali → /ru/sali). Only setting a cookie would leave the
    // address bar lying about the language and give search engines — and
    // anyone the visitor shares the link with — the wrong page.
    setLocale(nextLocale);
    const { pathname: bare } = splitLocale(pathname);
    // Read the query string at click time rather than subscribing with
    // useSearchParams(): this component sits in the header of every page, and
    // that hook opts whatever renders it out of static rendering unless it is
    // wrapped in Suspense. Nothing here needs to re-render when the query
    // changes — it is only read to carry the filters across the switch.
    const qs =
      typeof window === "undefined" ? "" : window.location.search.replace(/^\?/, "");
    router.push(
      localizePath(bare, nextLocale as AppLocale) + (qs ? `?${qs}` : ""),
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="inline-flex items-center gap-1.5 rounded-md px-2 py-2 text-sm font-medium hover:bg-accent"
        aria-label={`Limba curentă: ${localeNames[locale]}`}
      >
        <span
          className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full bg-white/10 text-[15px] leading-none shadow-[0_0_0_1px_rgba(255,255,255,.18)]"
          aria-hidden
        >
          {localeFlags[locale]}
        </span>
        <span className="uppercase text-xs font-medium">{locale}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {locales.map((l) => (
          <DropdownMenuItem
            key={l}
            onClick={() => changeLocale(l)}
            className={l === locale ? "bg-accent font-medium" : ""}
          >
            <span
              className="mr-2 flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[15px] leading-none"
              aria-hidden
            >
              {localeFlags[l]}
            </span>
            {localeNames[l]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
