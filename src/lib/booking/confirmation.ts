/** Commercial contract: vendor offer -> client acceptance -> venue confirmation. */
export function confirmationTransition(input: {
  status: string; venue: boolean; clientConfirmed: boolean;
  action: "accept" | "client_confirm" | "venue_confirm";
}): "accepted" | "awaiting_venue" | "confirmed_by_client" | null {
  if (input.action === "accept") return input.status === "pending" ? "accepted" : null;
  if (input.status !== "accepted") return null;
  if (input.action === "client_confirm") return input.venue ? "awaiting_venue" : "confirmed_by_client";
  return input.venue && input.clientConfirmed ? "confirmed_by_client" : null;
}
