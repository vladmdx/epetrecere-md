export const ADMIN_NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store",
} as const;

const FORBIDDEN_KEY = /^(bankDetails|bank_details)$/;

/** Walk a DTO and report any keys that must never leave admin read APIs. */
export function forbiddenAdminDtoKeys(value: unknown, path = "$"): string[] {
  if (value == null || typeof value !== "object") return [];
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => forbiddenAdminDtoKeys(item, `${path}[${index}]`));
  }
  const hits: string[] = [];
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const childPath = `${path}.${key}`;
    if (FORBIDDEN_KEY.test(key)) hits.push(childPath);
    hits.push(...forbiddenAdminDtoKeys(child, childPath));
  }
  return hits;
}
