// Phase 1 stub — redirect to the existing venue profile editor.
// Phase 2 will replace this with an expanded tab structure
// (General, Descriere, Galerie, Facilități, Locație, SEO) per spec.

import { redirect } from "next/navigation";

export default function VenueProfilPage() {
  redirect("/dashboard/venue-profil");
}
