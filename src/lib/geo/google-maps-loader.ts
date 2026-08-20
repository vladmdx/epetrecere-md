/**
 * Loads the Google Maps JavaScript API once per page.
 *
 * Google's own loader package would work, but it is one more dependency for a
 * single <script> tag; this keeps the contract visible — one promise, cached,
 * so every map on the page shares one download.
 */

let pending: Promise<typeof google.maps> | null = null;

export function loadGoogleMaps(
  apiKey: string,
  language: string,
): Promise<typeof google.maps> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Google Maps can only load in the browser"));
  }
  if (window.google?.maps) return Promise.resolve(window.google.maps);
  if (pending) return pending;

  pending = new Promise<typeof google.maps>((resolve, reject) => {
    const callbackName = "__epGoogleMapsReady";
    (window as unknown as Record<string, unknown>)[callbackName] = () => {
      resolve(window.google.maps);
    };
    const script = document.createElement("script");
    const params = new URLSearchParams({
      key: apiKey,
      language,
      region: "MD",
      loading: "async",
      callback: callbackName,
    });
    script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
    script.async = true;
    script.onerror = () => {
      // Let the next attempt retry rather than caching a dead promise.
      pending = null;
      reject(new Error("Google Maps failed to load"));
    };
    document.head.appendChild(script);
  });

  return pending;
}
