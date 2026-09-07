import { plainText } from "../content/plain-text";
import { redactContact } from "./contact-redaction";

/** Names, plan labels and event types are free text too. Preserve ordinary
 * names while preventing a phone/email pasted there from bypassing the gate. */
export function bookingTextForViewer<T extends string | null | undefined>(value: T, contactsShared: boolean): T {
  return (value == null || contactsShared ? value : redactContact(plainText(value))) as T;
}

/** Calendar availability is public; an owner's private notes are not. */
export function calendarEventForViewer<T extends { note: string | null; eventType: string | null }>(event: T, privileged: boolean): T {
  return privileged ? event : { ...event, note: null, eventType: null };
}
