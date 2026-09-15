import { getLegalDocument } from "@/lib/legal";
import { type AdminOrganizationSummary } from "./organization-summary";

export type AdminContractDocument = {
  id: number;
  userId: string | null;
  organizationId: number | null;
  acceptanceSessionId: string;
  artistId: number | null;
  venueId: number | null;
  subjectType: string;
  documentSlug: string;
  documentBlocks?: { type: string; text: string }[] | null;
  acceptedAt: Date | string;
  userName?: string | null;
  userEmail?: string | null;
  email?: string | null;
};

export type AdminContractHolder = {
  kind: "organization" | "artist" | "venue" | "legacy";
  name: string;
  organizationId: number | null;
};

export type AdminContractNameMaps = {
  orgById: ReadonlyMap<number, AdminOrganizationSummary>;
  artistById: ReadonlyMap<number, string>;
  venueById: ReadonlyMap<number, string>;
  artistByUser: ReadonlyMap<string, string>;
  venueByUser: ReadonlyMap<string, string>;
};

export function uniqueAdminContractSessionIds(
  rows: readonly { acceptanceSessionId: string }[],
): string[] {
  return [...new Set(rows.map((row) => row.acceptanceSessionId))];
}

export function compareSessionDocuments(
  a: { documentSlug: string; id: number },
  b: { documentSlug: string; id: number },
): number {
  const orderA = getLegalDocument(a.documentSlug)?.order ?? Number.MAX_SAFE_INTEGER;
  const orderB = getLegalDocument(b.documentSlug)?.order ?? Number.MAX_SAFE_INTEGER;
  if (orderA !== orderB) return orderA - orderB;
  const slug = a.documentSlug.localeCompare(b.documentSlug);
  if (slug !== 0) return slug;
  return a.id - b.id;
}

export function sortSessionDocuments<T extends { documentSlug: string; id: number }>(
  documents: readonly T[],
): T[] {
  return documents.slice().sort(compareSessionDocuments);
}

export function resolveAdminContractHolder(
  row: AdminContractDocument,
  maps: AdminContractNameMaps,
): AdminContractHolder {
  if (row.organizationId != null) {
    const org = maps.orgById.get(row.organizationId);
    const name = org
      ? org.legalName?.trim() || org.displayName
      : `Organizație #${row.organizationId}`;
    return { kind: "organization", name, organizationId: row.organizationId };
  }

  const named =
    (row.artistId != null ? maps.artistById.get(row.artistId) : undefined) ??
    (row.venueId != null ? maps.venueById.get(row.venueId) : undefined) ??
    (row.userId
      ? row.subjectType === "venue"
        ? maps.venueByUser.get(row.userId)
        : maps.artistByUser.get(row.userId)
      : undefined) ??
    row.userName ??
    row.userEmail ??
    row.email ??
    "—";
  return {
    kind: row.subjectType === "venue" ? "venue" : row.subjectType === "artist" ? "artist" : "legacy",
    name: named,
    organizationId: null,
  };
}

export type AdminContractSession<T extends AdminContractDocument> = {
  sessionId: string;
  documents: T[];
  pdfAnchorId: number;
  holder: AdminContractHolder;
};

function sessionSortTime(documents: readonly AdminContractDocument[]): number {
  let max = 0;
  for (const doc of documents) {
    const time = new Date(doc.acceptedAt).getTime();
    if (Number.isFinite(time) && time > max) max = time;
  }
  return max;
}

export function groupAdminContractSessions<T extends AdminContractDocument>(
  rows: readonly T[],
  maps: AdminContractNameMaps,
): AdminContractSession<T>[] {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const list = grouped.get(row.acceptanceSessionId);
    if (list) list.push(row);
    else grouped.set(row.acceptanceSessionId, [row]);
  }

  const sessions: AdminContractSession<T>[] = [];
  for (const [sessionId, docs] of grouped) {
    const documents = sortSessionDocuments(docs);
    const withBlocks = documents.find((doc) => (doc.documentBlocks?.length ?? 0) > 0);
    sessions.push({
      sessionId,
      documents,
      pdfAnchorId: (withBlocks ?? documents[0]!).id,
      holder: resolveAdminContractHolder(documents[0]!, maps),
    });
  }

  sessions.sort((a, b) => {
    const time = sessionSortTime(b.documents) - sessionSortTime(a.documents);
    if (time !== 0) return time;
    return a.sessionId.localeCompare(b.sessionId);
  });
  return sessions;
}
