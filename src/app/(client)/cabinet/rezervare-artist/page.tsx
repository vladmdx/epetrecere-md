import { redirect } from "next/navigation";

// Standalone "rezerva un artist" was removed — every booking must now
// originate from an event plan so we can apply conflict detection and
// keep partners grouped by event in the dashboard. Redirect any cached
// bookmarks to the planning entry point.
export default function StandaloneArtistBookingRedirect() {
  redirect("/planifica");
}
