// Admin-side results page — same wizard results component with adminMode on.
// Shows free artists filtered by the wizard answers and lets the admin fire
// booking requests (max 5 per category) from inline cards.

import { ResultsClient } from "@/app/(public)/planifica/rezultate/client";

export default function AdminNewEventResultsPage() {
  return <ResultsClient adminMode />;
}
