import { venueDraftSchema } from "./validation";
import { validatePhone } from "@/lib/phone/validate";

const VENUE_FIELDS: Record<string, string> = {
  name: "Numele localului trebuie să aibă între 2 și 200 de caractere.",
  phone: "Completează un număr de telefon valid (de exemplu +373 69 123 456).",
  city: "Alege orașul localului.",
  address: "Adresa localului trebuie să aibă între 5 și 300 de caractere.",
  descriptionRo: "Descrierea RO poate avea maximum 8000 de caractere.",
  descriptionRu: "Descrierea RU poate avea maximum 8000 de caractere.",
  descriptionEn: "Descrierea EN poate avea maximum 8000 de caractere.",
  imageUrls: "Verifică fotografiile localului (maximum 10).",
};

/** Run before freezing a NEW idempotent request; retries keep their exact body. */
export function venueFormValidationMessage(payload: unknown): string | null {
  const parsed = venueDraftSchema.safeParse(payload);
  if (!parsed.success) {
    const messages = parsed.error.issues.map((issue) =>
      VENUE_FIELDS[String(issue.path[0])] ?? "Verifică datele localului.",
    );
    return [...new Set(messages)].join(" ");
  }
  const phone = validatePhone(parsed.data.phone);
  return phone.ok ? null : phone.error;
}

export function venueReviewLabel(isActive: boolean, hallStatuses: string[]): string {
  if (isActive) return hallStatuses.includes("pending") ? "activ · săli în aprobare" : "activ";
  if (hallStatuses.includes("pending")) return "în așteptarea aprobării";
  if (hallStatuses.includes("rejected")) return "necesită corectări";
  return "draft";
}
