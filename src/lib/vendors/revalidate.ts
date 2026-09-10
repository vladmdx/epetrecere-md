import { revalidatePath } from "next/cache";
import { LOCALES, localizePath } from "@/lib/i18n/routing";

export type VendorKind = "artist" | "venue";

export interface VendorCatalogInvalidation {
  /** Exact public profile slugs affected by the mutation (old and new on rename). */
  profileSlugs?: readonly (string | null | undefined)[];
  /** The top-level /artisti or /sali listing changed. */
  directory?: boolean;
  /** Exact artist category landings affected, when their public slugs are known. */
  categorySlugs?: readonly (string | null | undefined)[];
  /** Featured cards, ordering, or public supply totals on the homepage changed. */
  homepage?: boolean;
  /** Public supplier counts on /servicii changed. */
  services?: boolean;
}

function addSlugPath(paths: Set<string>, prefix: string, rawSlug: string | null | undefined) {
  const slug = rawSlug?.trim();
  if (!slug) return;

  // Slugs are stored as path segments. Encoding here both keeps an unexpected
  // slash inside one segment and prevents cache invalidation from escaping the
  // intended public route.
  try {
    paths.add(`${prefix}/${encodeURIComponent(slug)}`);
  } catch {
    // A malformed surrogate cannot be a usable public URL, so there is no
    // concrete path Next.js could invalidate for it.
  }
}

/**
 * Build only concrete URLs/cache paths. In Next 15 a concrete path is passed
 * to `revalidatePath` without `type`; dynamic route patterns require `type`
 * and invalidate every matching page. Keeping this pure also makes the fan-out
 * visible and regression-testable without touching the Next.js cache.
 */
export function vendorCatalogPaths(
  kind: VendorKind,
  target: VendorCatalogInvalidation,
): string[] {
  const directory = kind === "artist" ? "/artisti" : "/sali";
  const barePaths = new Set<string>();

  if (target.homepage) barePaths.add("/");
  if (target.services) barePaths.add("/servicii");
  if (target.directory) barePaths.add(directory);

  for (const slug of target.profileSlugs ?? []) {
    addSlugPath(barePaths, directory, slug);
  }

  if (kind === "artist") {
    for (const slug of target.categorySlugs ?? []) {
      addSlugPath(barePaths, "/categorie", slug);
    }
  }

  const localizedPaths = new Set<string>();
  for (const barePath of barePaths) {
    for (const locale of LOCALES) {
      localizedPaths.add(localizePath(barePath, locale));
    }
    // Romanian is canonical without a prefix, but middleware rewrites it onto
    // the actual /ro app route. On-demand invalidation does not execute
    // middleware, so expire both the visitor URL and its concrete cache path.
    localizedPaths.add(`/ro${barePath === "/" ? "" : barePath}`);
  }
  return [...localizedPaths];
}

/** Invalidate the explicitly affected public catalog surfaces in every locale. */
export function revalidateVendorCatalog(
  kind: VendorKind,
  target: VendorCatalogInvalidation,
) {
  for (const path of vendorCatalogPaths(kind, target)) {
    revalidatePath(path);
  }
}
