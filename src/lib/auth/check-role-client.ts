/** Retry transient session/bootstrap failures without treating them as a new account. */
export async function fetchAccountRole(
  fetcher: typeof fetch = fetch,
  pause: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<Response> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetcher(`/api/auth/check-role?_t=${Date.now()}`, {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache, no-store, must-revalidate" },
        signal: AbortSignal.timeout(12_000),
      });
      if (response.ok || ![401, 429, 500, 502, 503, 504].includes(response.status)) {
        return response;
      }
      if (attempt === 2) return response;
    } catch (error) {
      if (attempt === 2) throw error;
    }
    await pause(500 * (attempt + 1));
  }
  throw new Error("Account status unavailable");
}
