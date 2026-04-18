// Admin-side event creation wizard. Reuses the public /planifica wizard
// component via the adminMode prop — the layout gate at /admin/layout.tsx
// already enforces admin permissions, and adminMode skips the public
// login redirect and jumps straight to the results page.

import { WizardClient } from "@/app/(public)/planifica/client";

export default function AdminNewEventPage() {
  return <WizardClient adminMode />;
}
