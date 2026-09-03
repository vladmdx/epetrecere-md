export const CONTACT_SHARED_STATUSES = new Set(["confirmed_by_client", "completed"]);
export function contactsAreShared(status: string) {
  return CONTACT_SHARED_STATUSES.has(status);
}
