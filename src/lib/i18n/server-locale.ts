import { cookies } from "next/headers";
import type { Locale } from "@/types";

const supportedLocales = new Set<Locale>(["ro", "ru", "en"]);

export async function getServerLocale(): Promise<Locale> {
  const store = await cookies();
  const value = store.get("locale")?.value as Locale | undefined;
  return value && supportedLocales.has(value) ? value : "ro";
}
