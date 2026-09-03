import { plainText } from "../content/plain-text";
import { redactContact } from "./contact-redaction";

/** A legacy lead status is not evidence of a bilateral booking confirmation. */
export function privateLeadSummary(lead: {
  id: number; name: string; phone: string; email: string | null;
  eventType: string | null; eventDate: string | null; location: string | null;
  guestCount: number | null; budget: number | null; source: string | null;
  message: string | null;
}) {
  const safe = (value: string | null) => value === null ? null : redactContact(plainText(value));
  return {
    id: lead.id,
    name: "#" + lead.id,
    phone: null,
    email: null,
    eventType: safe(lead.eventType),
    eventDate: lead.eventDate,
    location: safe(lead.location),
    guestCount: lead.guestCount,
    budget: lead.budget,
    source: safe(lead.source),
    message: safe(lead.message),
  };
}
