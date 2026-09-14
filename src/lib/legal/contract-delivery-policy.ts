import {
  createServerLogCorrelationId,
  safeServerErrorLog,
} from "@/lib/safe-server-log";

const SAFE_LEGAL_DELIVERY_ERROR_CODES = new Set([
  "23502",
  "23503",
  "23505",
  "23514",
  "40001",
  "40P01",
  "55P03",
  "57014",
  "CONTRACT_EMAIL_PROVIDER_REJECTED",
  "CONTRACT_EMAIL_PROVIDER_TIMEOUT",
  "ECONNRESET",
  "ENOTFOUND",
  "ETIMEDOUT",
  "UND_ERR_CONNECT_TIMEOUT",
]);

const SAFE_LEGAL_DELIVERY_ERROR_STATUSES = new Set([
  400, 401, 403, 404, 408, 409, 422, 425, 429, 500, 502, 503, 504,
]);

export type LegalDeliveryChannel = "signer" | "admin";
export type LegalDeliveryRoleSnapshot = "signer" | "admin" | "super_admin";

export type LegalDeliveryRecipientPolicyInput = {
  channel: string;
  recipientUserId: string | null;
  recipientEmail: string | null;
  recipientRoleSnapshot: string | null;
};

export type LiveLegalDeliveryUser = {
  id: string;
  email: string | null;
  role: string;
};

export function canonicalLegalDeliveryEmail(
  value: string | null | undefined,
): string | null {
  const normalized = value?.trim().toLowerCase();
  return normalized || null;
}

/**
 * Fail closed when a durable recipient snapshot no longer maps to the same
 * live account/role/email immediately before provider delivery.
 */
export function legalDeliveryRecipientIsAuthorized(input: {
  delivery: LegalDeliveryRecipientPolicyInput;
  user: LiveLegalDeliveryUser | null;
  signerAcceptanceBound: boolean;
  sessionSignerLive: boolean;
}): boolean {
  const { delivery, user } = input;
  if (!input.sessionSignerLive) return false;
  if (!user || !delivery.recipientUserId || user.id !== delivery.recipientUserId) {
    return false;
  }
  const queuedEmail = canonicalLegalDeliveryEmail(delivery.recipientEmail);
  const liveEmail = canonicalLegalDeliveryEmail(user.email);
  if (!queuedEmail || !liveEmail || queuedEmail !== liveEmail) return false;

  if (delivery.channel === "signer") {
    return delivery.recipientRoleSnapshot === "signer"
      && input.signerAcceptanceBound;
  }
  if (delivery.channel === "admin") {
    return (delivery.recipientRoleSnapshot === "admin"
        || delivery.recipientRoleSnapshot === "super_admin")
      && (user.role === "admin" || user.role === "super_admin");
  }
  return false;
}

/** Storage-safe retry detail: never inspect or retain message/stack/body/IDs. */
export function legalContractDeliverySafeFailure(
  error: unknown,
  correlationId = createServerLogCorrelationId(),
): string {
  return JSON.stringify(safeServerErrorLog(error, {
    correlationId,
    allowedCodes: SAFE_LEGAL_DELIVERY_ERROR_CODES,
    allowedStatuses: SAFE_LEGAL_DELIVERY_ERROR_STATUSES,
  }));
}

export function legalContractDeliverySafeLog(
  error: unknown,
  correlationId = createServerLogCorrelationId(),
) {
  return safeServerErrorLog(error, {
    correlationId,
    allowedCodes: SAFE_LEGAL_DELIVERY_ERROR_CODES,
    allowedStatuses: SAFE_LEGAL_DELIVERY_ERROR_STATUSES,
  });
}

export class ContractEmailProviderError extends Error {
  readonly code: string;

  constructor(code: "CONTRACT_EMAIL_PROVIDER_REJECTED" | "CONTRACT_EMAIL_PROVIDER_TIMEOUT") {
    super(code.toLowerCase());
    this.name = "Error";
    this.code = code;
  }
}
