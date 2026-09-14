/**
 * Immutable legal-pack topology.
 *
 * Signed evidence stores the rendered document snapshot, but a snapshot alone
 * cannot tell us whether the whole pack was signed.  Keep that answer here,
 * versioned by pack and subject, so historical PDFs and dashboards never use
 * today's document list (or a magic document count).
 *
 * This module intentionally has no dependency on documents.json and is safe to
 * import from client components.
 */

export type LegalPackSubject = "artist" | "venue";

export type LegalPackDocumentManifest = Readonly<{
  slug: string;
  version: string;
}>;

type LegalPackManifest = Readonly<
  Record<LegalPackSubject, readonly LegalPackDocumentManifest[]>
>;

type LegalPackManifestVariants = Readonly<
  Record<LegalPackSubject, readonly (readonly LegalPackDocumentManifest[])[]>
>;

const PACK_1_COMMON = [
  { slug: "termeni-generali", version: "1.0" },
  { slug: "politica-confidentialitate", version: "1.0" },
  { slug: "reguli-marketplace", version: "1.0" },
  { slug: "tarife", version: "1.0" },
] as const;

const PACK_2_1_COMMON = [
  { slug: "termeni-generali", version: "1.0" },
  { slug: "politica-confidentialitate", version: "1.1" },
  { slug: "reguli-marketplace", version: "1.0" },
  { slug: "tarife", version: "2.1" },
] as const;

// Pack numbers were not bumped for these two historical publication changes.
// Preserve both exact topologies so an early, valid signature remains usable.
const PACK_2_1_EARLY_COMMON = [
  { slug: "termeni-generali", version: "1.0" },
  { slug: "politica-confidentialitate", version: "1.0" },
  { slug: "reguli-marketplace", version: "1.0" },
  { slug: "tarife", version: "2.1" },
] as const;

const PACK_2_2_EARLY_COMMON = [
  { slug: "termeni-generali", version: "2.0" },
  { slug: "politica-confidentialitate", version: "1.2" },
  { slug: "reguli-marketplace", version: "1.0" },
  { slug: "tarife", version: "2.2" },
] as const;

const PACK_2_2_COMMON = [
  { slug: "termeni-generali", version: "2.2" },
  { slug: "politica-confidentialitate", version: "1.3" },
  { slug: "reguli-marketplace", version: "1.1" },
  { slug: "tarife", version: "2.2" },
] as const;

export const LEGAL_PACK_MANIFESTS = {
  "1.0": {
    artist: [{ slug: "acord-parteneri", version: "1.0" }, ...PACK_1_COMMON],
    // Pack 1.0 predated the shared partner agreement for venues.
    venue: [{ slug: "acord-locatii", version: "1.0" }, ...PACK_1_COMMON],
  },
  "2.0": {
    artist: [{ slug: "acord-parteneri", version: "2.0" }, ...PACK_1_COMMON],
    venue: [
      { slug: "acord-parteneri", version: "2.0" },
      { slug: "acord-locatii", version: "1.0" },
      ...PACK_1_COMMON,
    ],
  },
  "2.1": {
    artist: [{ slug: "acord-parteneri", version: "2.1" }, ...PACK_2_1_COMMON],
    venue: [
      { slug: "acord-parteneri", version: "2.1" },
      { slug: "acord-locatii", version: "2.1" },
      ...PACK_2_1_COMMON,
    ],
  },
  "2.2": {
    artist: [{ slug: "acord-parteneri", version: "2.2" }, ...PACK_2_2_COMMON],
    venue: [
      { slug: "acord-parteneri", version: "2.2" },
      { slug: "acord-locatii", version: "2.2" },
      ...PACK_2_2_COMMON,
    ],
  },
} as const satisfies Record<string, LegalPackManifest>;

const PACK_2_1_EARLY = {
  artist: [{ slug: "acord-parteneri", version: "2.1" }, ...PACK_2_1_EARLY_COMMON],
  venue: [
    { slug: "acord-parteneri", version: "2.1" },
    { slug: "acord-locatii", version: "2.1" },
    ...PACK_2_1_EARLY_COMMON,
  ],
} as const satisfies LegalPackManifest;

const PACK_2_2_EARLY = {
  artist: [{ slug: "acord-parteneri", version: "2.2" }, ...PACK_2_2_EARLY_COMMON],
  venue: [
    { slug: "acord-parteneri", version: "2.2" },
    { slug: "acord-locatii", version: "2.2" },
    ...PACK_2_2_EARLY_COMMON,
  ],
} as const satisfies LegalPackManifest;

/** Every historically published exact document combination, oldest first. */
export const LEGAL_PACK_MANIFEST_VARIANTS = {
  "1.0": {
    artist: [LEGAL_PACK_MANIFESTS["1.0"].artist],
    venue: [LEGAL_PACK_MANIFESTS["1.0"].venue],
  },
  "2.0": {
    artist: [LEGAL_PACK_MANIFESTS["2.0"].artist],
    venue: [LEGAL_PACK_MANIFESTS["2.0"].venue],
  },
  "2.1": {
    artist: [PACK_2_1_EARLY.artist, LEGAL_PACK_MANIFESTS["2.1"].artist],
    venue: [PACK_2_1_EARLY.venue, LEGAL_PACK_MANIFESTS["2.1"].venue],
  },
  "2.2": {
    artist: [PACK_2_2_EARLY.artist, LEGAL_PACK_MANIFESTS["2.2"].artist],
    venue: [PACK_2_2_EARLY.venue, LEGAL_PACK_MANIFESTS["2.2"].venue],
  },
} as const satisfies Record<string, LegalPackManifestVariants>;

export function legalPackManifest(
  packVersion: string,
  subjectType: string,
): readonly LegalPackDocumentManifest[] | null {
  if (subjectType !== "artist" && subjectType !== "venue") return null;
  const pack = LEGAL_PACK_MANIFESTS[
    packVersion as keyof typeof LEGAL_PACK_MANIFESTS
  ] as LegalPackManifest | undefined;
  return pack?.[subjectType] ?? null;
}

export function legalPackManifestVariants(
  packVersion: string,
  subjectType: string,
): readonly (readonly LegalPackDocumentManifest[])[] | null {
  if (subjectType !== "artist" && subjectType !== "venue") return null;
  const pack = LEGAL_PACK_MANIFEST_VARIANTS[
    packVersion as keyof typeof LEGAL_PACK_MANIFEST_VARIANTS
  ] as LegalPackManifestVariants | undefined;
  return pack?.[subjectType] ?? null;
}

export type LegalManifestEvidence = {
  documentSlug: string;
  documentVersion: string;
};

function evidenceMatchesExactManifest(
  rows: readonly LegalManifestEvidence[],
  manifest: readonly LegalPackDocumentManifest[],
): boolean {
  if (rows.length !== manifest.length) return false;
  const bySlug = new Map(rows.map((row) => [row.documentSlug, row.documentVersion]));
  return (
    bySlug.size === rows.length &&
    manifest.every((document) => bySlug.get(document.slug) === document.version)
  );
}

/** Resolve the exact historical variant represented by frozen evidence. */
export function legalPackManifestForEvidence(
  packVersion: string,
  subjectType: string,
  rows: readonly LegalManifestEvidence[],
): readonly LegalPackDocumentManifest[] | null {
  const variants = legalPackManifestVariants(packVersion, subjectType);
  return variants?.find((manifest) => evidenceMatchesExactManifest(rows, manifest)) ?? null;
}

/** Exact set/version match; duplicates and unknown historical packs fail shut. */
export function legalEvidenceMatchesManifest(
  packVersion: string,
  subjectType: string,
  rows: readonly LegalManifestEvidence[],
): boolean {
  return legalPackManifestForEvidence(packVersion, subjectType, rows) !== null;
}
