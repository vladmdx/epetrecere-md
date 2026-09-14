import { isMultiHallEnabled } from "@/lib/feature-flags";

const LEGACY_SALA_SECTIONS = new Set([
  "",
  "/ai-assistant",
  "/analitice",
  "/calendar",
  "/financiar",
  "/meniu",
  "/mesaje",
  "/profil",
  "/recenzii",
  "/rezervari",
  "/setari",
]);

/**
 * Preserve links written while MULTI_HALL was enabled if the rollout is
 * rolled back. The caller changes only pathname, so query parameters such as
 * `expand` and `conversation` remain intact.
 */
export function legacySalaPathForCanonicalVenue(
  pathname: string,
): string | null {
  if (isMultiHallEnabled()) return null;
  const match = /^\/dashboard\/locatii\/[1-9]\d*(\/[^/?#]+)?\/?$/.exec(pathname);
  if (!match) return null;
  const section = match[1] ?? "";
  if (!LEGACY_SALA_SECTIONS.has(section)) return "/dashboard/sala";
  return `/dashboard/sala${section}`;
}
