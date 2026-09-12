import { isMultiHallEnabled } from "@/lib/feature-flags";
import LegacyVenueOnboarding from "./legacy-client";
import MultiHallVenueOnboarding from "./multi-hall-client";

export default function VenueOnboardingPage() {
  if (isMultiHallEnabled()) return <MultiHallVenueOnboarding />;
  return <LegacyVenueOnboarding />;
}
