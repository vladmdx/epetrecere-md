"use client";

import { useLocale } from "@/hooks/use-locale";
import { useRouter } from "next/navigation";
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

  function changeLocale(nextLocale: typeof locale) {
    setLocale(nextLocale);
    router.refresh();
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
