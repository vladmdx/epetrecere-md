import { randomUUID } from "node:crypto";

const SAFE_ERROR_CLASSES = new Set([
  "AbortError",
  "AccountErasureIdentityConfigurationError",
  "AggregateError",
  "APIConnectionError",
  "APIConnectionTimeoutError",
  "APIError",
  "AuthenticationError",
  "BadRequestError",
  "ClerkAPIResponseError",
  "ConflictError",
  "DrizzleQueryError",
  "Error",
  "GoogleCalendarFetchError",
  "HttpResponseError",
  "InternalServerError",
  "NotFoundError",
  "PermissionDeniedError",
  "PostgresError",
  "RangeError",
  "RateLimitError",
  "SyntaxError",
  "TypeError",
  "UnprocessableEntityError",
]);

type SafeServerLogPolicy = {
  correlationId: string;
  allowedCodes?: ReadonlySet<string>;
  allowedStatuses?: ReadonlySet<number>;
  allowedTypes?: ReadonlySet<string>;
};

function safeProperty(value: unknown, key: string): unknown {
  try {
    return typeof value === "object" && value !== null
      ? (value as Record<string, unknown>)[key]
      : undefined;
  } catch {
    return undefined;
  }
}

function safeErrorClass(error: unknown): string {
  let candidate: unknown;
  try {
    candidate = error instanceof Error
      ? error.name
      : safeProperty(error, "name");
  } catch {
    candidate = undefined;
  }
  return typeof candidate === "string" && SAFE_ERROR_CLASSES.has(candidate)
    ? candidate
    : "UnknownError";
}

/**
 * Produce a deliberately small server-log record. Error messages, stacks,
 * response bodies and identifiers are never inspected or copied. Provider
 * status/type/code values are emitted only when the caller explicitly allows
 * them for that integration.
 */
export function safeServerErrorLog(
  error: unknown,
  policy: SafeServerLogPolicy,
): {
  correlationId: string;
  errorClass: string;
  status?: number;
  code?: string;
  type?: string;
} {
  const nested = safeProperty(error, "error");
  const rawStatus = safeProperty(error, "status");
  const rawCode = safeProperty(error, "code") ?? safeProperty(nested, "code");
  const rawType = safeProperty(error, "type") ?? safeProperty(nested, "type");
  const status = typeof rawStatus === "number"
    && Number.isInteger(rawStatus)
    && policy.allowedStatuses?.has(rawStatus)
      ? rawStatus
      : undefined;
  const code = typeof rawCode === "string" && policy.allowedCodes?.has(rawCode)
    ? rawCode
    : undefined;
  const type = typeof rawType === "string" && policy.allowedTypes?.has(rawType)
    ? rawType
    : undefined;
  return {
    correlationId: policy.correlationId,
    errorClass: safeErrorClass(error),
    ...(status === undefined ? {} : { status }),
    ...(code === undefined ? {} : { code }),
    ...(type === undefined ? {} : { type }),
  };
}

export function createServerLogCorrelationId(): string {
  return randomUUID();
}
