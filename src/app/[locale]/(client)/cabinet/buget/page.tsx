// Budget tracker removed per round-2 spec. Existing bookmarks/links to
// /cabinet/buget redirect to the cabinet root so the page doesn't 404.
// The standalone tracker is intentionally gone — clients filter by
// per-category price brackets on Rezervări Artiști instead of running
// a separate budget tab.

import { redirect } from "next/navigation";

export default function BudgetTrackerPage() {
  redirect("/cabinet/planifica");
}
