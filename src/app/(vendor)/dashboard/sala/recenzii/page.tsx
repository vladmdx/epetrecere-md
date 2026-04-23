// Phase 1 stub — redirect to the existing shared reviews page.

import { redirect } from "next/navigation";

export default function VenueReviewsPage() {
  redirect("/dashboard/recenzii");
}
