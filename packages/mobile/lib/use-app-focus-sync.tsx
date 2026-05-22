// On-foreground sync.
//
// React Native's AppState lifecycle gives us a `background → active`
// transition each time the user comes back to the app from another
// app, the home screen, or after the device unlocks. We use that to
// invalidate "fresh" queries (bookings, conversations, dashboard) so
// the user always returns to live data instead of staring at a
// minutes-old cache while wondering why nothing changed.
//
// We DON'T invalidate every query — only the ones tagged `live` in
// their queryKey (first segment matches the heuristic below). Static
// data (artist details, venues catalog) keeps its cache.

import { useEffect } from "react";
import { AppState } from "react-native";
import { useQueryClient } from "@tanstack/react-query";

// Query keys whose first segment we treat as "live" — invalidated
// every time the app comes back to the foreground. Static data
// (catalog, profiles) keeps its cache for snappier returns.
const LIVE_KEYS = new Set([
  "partner-dashboard",
  "partner-bookings",
  "partner-bookings-cal",
  "partner-conversations",
  "my-bookings",
  "my-conversations",
  "my-event-plans",
  "my-event-plan-detail",
  "wishlist",
  "chat-messages",
  "booking",
  "partner-booking",
  "plan",
]);

export function useAppFocusSync() {
  const qc = useQueryClient();
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      void qc.invalidateQueries({
        predicate: (q) => {
          const head = q.queryKey?.[0];
          return typeof head === "string" && LIVE_KEYS.has(head);
        },
      });
    });
    return () => subscription.remove();
  }, [qc]);
}
