// Phase 1 stub — redirect to the existing shared messages page.

import { redirect } from "next/navigation";

export default function VenueMessagesPage() {
  redirect("/dashboard/mesaje");
}
