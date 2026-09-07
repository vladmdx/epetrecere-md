import { redactContact } from "./contact-redaction";
import { plainText } from "../content/plain-text";

/** One projection for legacy booking dialogs and the unified conversation UI. */
export function chatMessageForViewer<T extends {
  message: string;
  senderName: string;
  attachmentUrl?: string | null;
  attachmentName?: string | null;
  attachmentMime?: string | null;
}>(message: T, contactUnlocked: boolean): T {
  if (contactUnlocked) return message;
  return {
    ...message,
    message: redactContact(plainText(message.message)),
    senderName: redactContact(plainText(message.senderName)),
    attachmentUrl: null,
    attachmentName: message.attachmentUrl
      ? "Atașament disponibil după confirmare"
      : message.attachmentName ? redactContact(plainText(message.attachmentName)) : null,
    attachmentMime: null,
  };
}
