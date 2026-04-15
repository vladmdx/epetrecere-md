import type { Metadata } from "next";
import type { Locale } from "@/types";
import { getLocalized } from "@/i18n";

interface SEOEntity {
  [key: string]: unknown;
  seo_title_ro?: string;
  seo_title_ru?: string;
  seo_title_en?: string;
  seo_desc_ro?: string;
  seo_desc_ru?: string;
  seo_desc_en?: string;
}

interface GenerateMetaOptions {
  title?: string;
  description?: string;
  entity?: SEOEntity;
  locale?: Locale;
  path?: string;
  image?: string;
  type?: "website" | "article" | "profile";
  noindex?: boolean;
}

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://epetrecere.md";

export function generateMeta(opts: GenerateMetaOptions): Metadata {
  const locale = opts.locale || "ro";

  // Try entity SEO fields first, then fallback to provided values
  let title = opts.title || "";
  let description = opts.description || "";

  if (opts.entity) {
    const seoTitle = getLocalized(opts.entity, "seo_title", locale);
    const seoDesc = getLocalized(opts.entity, "seo_desc", locale);
    if (seoTitle) title = seoTitle;
    if (seoDesc) description = seoDesc;
  }

  const url = opts.path ? `${BASE_URL}${opts.path}` : BASE_URL;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url,
      siteName: "ePetrecere.md",
      type: opts.type || "website",
      locale: locale === "ro" ? "ro_MD" : locale === "ru" ? "ru_MD" : "en_US",
      ...(opts.image && {
        images: [{ url: opts.image, width: 1200, height: 630, alt: title }],
      }),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      ...(opts.image && { images: [opts.image] }),
    },
    alternates: {
      canonical: url,
      languages: {
        "ro": `${BASE_URL}${opts.path || ""}?lang=ro`,
        "ru": `${BASE_URL}${opts.path || ""}?lang=ru`,
        "en": `${BASE_URL}${opts.path || ""}?lang=en`,
        "x-default": `${BASE_URL}${opts.path || ""}`,
      },
    },
    ...(opts.noindex && { robots: { index: false, follow: false } }),
  };
}
