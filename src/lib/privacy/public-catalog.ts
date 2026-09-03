/**
 * The public catalogue must never serialize a complete database row into a
 * client component. React props are downloadable even when the UI hides them.
 * Apply this at every public page/API boundary, including nested suggestions.
 * Booking contact disclosure is a separate, authenticated workflow.
 */
const PRIVATE_FIELDS = new Set([
  "phone", "email", "website", "menuUrl", "menuPdfUrl", "virtualTourUrl", "instagram", "facebook", "tiktok", "youtube",
  "whatsapp", "telegram", "viber", "userId", "authorUserId", "clerkId",
  "autoReplyMessage", "legalName", "idNumber", "legalAddress",
  "representativeName", "signatureImage", "ipAddress", "userAgent",
]);

const PRICE_FIELDS = new Set([
  "price_from", "price_per_person", "price_eur", "base_price",
  "priceFrom", "pricePerPerson", "price", "priceEur", "basePrice",
  "packageMinPrice", "packageMaxPrice", "travelSurchargeAmount",
]);

export function publicCatalogData<T>(value: T, showPrices = false): T {
  if (Array.isArray(value)) {
    return value.map((item) => publicCatalogData(item, showPrices)) as T;
  }
  if (!value || typeof value !== "object" || value instanceof Date) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      PRIVATE_FIELDS.has(key) || (!showPrices && PRICE_FIELDS.has(key))
        ? null
        : typeof item === "string" && /^(name|description|title|seoTitle|seoDesc|text|reply|includes|excludes|bio|caption|authorName)/.test(key)
          ? redactContact(plainText(item))
          : publicCatalogData(item, showPrices),
    ]),
  ) as T;
}
import { redactContact } from "./contact-redaction";
import { plainText } from "@/lib/content/plain-text";
