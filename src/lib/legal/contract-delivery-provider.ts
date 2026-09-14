import type { EmailAttachment } from "@/lib/email/send";
import { ContractEmailProviderError } from "@/lib/legal/contract-delivery-policy";

export const LEGAL_DELIVERY_PROVIDER_TIMEOUT_MS = 20 * 1000;

export type LegalContractDeliveryEmail = {
  to: string;
  subject: string;
  html: string;
  attachments?: EmailAttachment[];
  idempotencyKey?: string;
  /** Propagated to the HTTP transport so timeout really cancels the request. */
  signal?: AbortSignal;
};

function providerError(result: unknown): unknown {
  if (!result || typeof result !== "object") return null;
  return "error" in result ? (result as { error?: unknown }).error : null;
}

/**
 * Start the provider request while the caller holds its authorization locks.
 * A timeout aborts the underlying fetch; it is not merely a local race that
 * leaves an unobserved request running after those locks are released.
 */
export async function sendLegalContractEmail(
  sendEmail: (input: LegalContractDeliveryEmail) => Promise<unknown>,
  input: LegalContractDeliveryEmail,
  timeoutMs = LEGAL_DELIVERY_PROVIDER_TIMEOUT_MS,
): Promise<void> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      const timeoutError = new ContractEmailProviderError(
        "CONTRACT_EMAIL_PROVIDER_TIMEOUT",
      );
      reject(timeoutError);
      controller.abort(timeoutError);
    }, timeoutMs);
  });
  try {
    const result = await Promise.race([
      sendEmail({ ...input, signal: controller.signal }),
      timeout,
    ]);
    if (providerError(result)) {
      throw new ContractEmailProviderError("CONTRACT_EMAIL_PROVIDER_REJECTED");
    }
  } finally {
    if (timer) clearTimeout(timer);
  }
}
