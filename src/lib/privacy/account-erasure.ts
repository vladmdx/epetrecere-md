/** Pseudonymous replay identifiers have no purpose after their owner is gone. */
export const BOOKING_CREATION_IDENTITY_ERASURE = {
  creationScopeHash: null,
  creationRequestId: null,
  creationPayloadHash: null,
} as const;

/** Fields retained on a booking after its client account is erased. */
export const BOOKING_CLIENT_ERASURE = {
  clientName: "(cont șters)",
  clientPhone: "",
  clientEmail: null,
  message: null,
  clientSignature: null,
  ...BOOKING_CREATION_IDENTITY_ERASURE,
} as const;

/**
 * Personal fields copied into the CRM projection of a booking request.
 *
 * `offer_requests` has no direct user FK, so deleting the account cannot
 * cascade or SET NULL these values. Linked projections must be minimized in
 * the same transaction as their parent booking and user row.
 */
export const OFFER_REQUEST_CLIENT_ERASURE = {
  clientName: "(cont șters)",
  clientPhone: "",
  clientEmail: null,
  message: null,
} as const;
