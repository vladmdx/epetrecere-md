/**
 * Transactional Hall create/PATCH writes.
 *
 * Request authentication happens in the route, but live authority is resolved
 * again here after the shared legal and availability locks are held. Children
 * are always written through the transaction executor; omitted PATCH children
 * are preserved and explicitly supplied arrays replace the corresponding set.
 */
import { createHash } from "node:crypto";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  partnerOrganizations,
  venueHallMenuSets,
  venueHallSeatingOptions,
  venueHalls,
  venueImages,
  venueMenuSets,
  venues,
} from "@/lib/db/schema";
import {
  acquireAvailabilityLocks,
  acquireLegalScopeLocks,
} from "@/lib/booking/advisory-locks";
import { isMultiHallEnabled } from "@/lib/feature-flags";
import { pickUniqueSlug, slugify } from "@/lib/utils/slugify";
import {
  authorizeVenueCapabilityLocked,
  getLockedAppUserById,
  ORG_STATUSES_ALLOWING_ACCESS,
} from "@/lib/venue-access";
import {
  emptyToNull,
  hallCreateSchema,
  hallPatchSchema,
  type HallCreateInput,
  type HallPatchInput,
} from "./validation";

type Executor = typeof db;
type LockTransaction = Parameters<typeof acquireLegalScopeLocks>[0];
type HallRow = typeof venueHalls.$inferSelect;
type SeatingRow = typeof venueHallSeatingOptions.$inferSelect;

export type HallWriteFailure = {
  ok: false;
  status: 400 | 403 | 404 | 409;
  error: string;
  code: string;
  details?: unknown;
  hallStatus?: string;
};

export type HallWriteSuccess = {
  ok: true;
  hall: HallRow;
  replayed?: boolean;
};

type VenueScope = {
  venueId: number;
  organizationId: number | null;
};

type HallScope = VenueScope & { hallId: number };

type LockedChildren = {
  images: Array<typeof venueImages.$inferSelect>;
  seating: SeatingRow[];
  menuLinks: Array<typeof venueHallMenuSets.$inferSelect>;
};

class HallWriteRollback extends Error {
  constructor(readonly failure: HallWriteFailure) {
    super(failure.code);
    this.name = "HallWriteRollback";
  }
}

function failure(
  status: HallWriteFailure["status"],
  code: string,
  error = code,
  extra?: Pick<HallWriteFailure, "details" | "hallStatus">,
): HallWriteFailure {
  return { ok: false, status, code, error, ...extra };
}

function hasOwn<T extends object>(value: T, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function normalizedSeating(
  seating: HallCreateInput["seating"] | NonNullable<HallPatchInput["seating"]>,
) {
  return seating.map((option, sortOrder) => ({
    type: option.type,
    labelRo: emptyToNull(option.labelRo),
    labelRu: emptyToNull(option.labelRu),
    labelEn: emptyToNull(option.labelEn),
    capacityMin: option.capacityMin ?? null,
    capacityMax: option.capacityMax ?? null,
    notesRo: emptyToNull(option.notesRo),
    notesRu: emptyToNull(option.notesRu),
    notesEn: emptyToNull(option.notesEn),
    sortOrder,
  }));
}

function hallScalarCreateValues(data: HallCreateInput) {
  return {
    nameRo: data.nameRo,
    nameRu: emptyToNull(data.nameRu),
    nameEn: emptyToNull(data.nameEn),
    descriptionRo: emptyToNull(data.descriptionRo),
    descriptionRu: emptyToNull(data.descriptionRu),
    descriptionEn: emptyToNull(data.descriptionEn),
    capacityMin: data.capacityMin,
    capacityMax: data.capacityMax,
    pricingModel: data.pricingModel,
    basePrice: data.basePrice,
    minimumOrder: data.minimumOrder,
    currency: data.currency,
    depositType: data.depositType,
    depositValue: data.depositValue,
    facilities: data.facilities,
    workingHours: data.workingHours,
    bufferMinutes: data.bufferMinutes,
    bookingTermsRo: emptyToNull(data.bookingTermsRo),
    bookingTermsRu: emptyToNull(data.bookingTermsRu),
    bookingTermsEn: emptyToNull(data.bookingTermsEn),
    sortOrder: data.sortOrder,
  };
}

/** Hash the normalized, storage-equivalent create intent (never the key). */
export function hallCreatePayloadHash(data: HallCreateInput): string {
  const normalized = {
    version: 1,
    ...hallScalarCreateValues(data),
    requestedSlug: slugify(data.slug ?? data.nameRo) || "sala",
    seating: normalizedSeating(data.seating),
    imageUrls: data.imageUrls,
    inheritMenu: data.inheritMenu,
    menuSetIds: [...data.menuSetIds].sort((left, right) => left - right),
  };
  return createHash("sha256").update(canonicalJson(normalized)).digest("hex");
}

async function loadVenueScope(venueId: number): Promise<VenueScope | null> {
  const [row] = await db
    .select({ venueId: venues.id, organizationId: venues.organizationId })
    .from(venues)
    .where(eq(venues.id, venueId))
    .limit(1);
  return row ?? null;
}

async function loadHallScope(hallId: number): Promise<HallScope | null> {
  const [row] = await db
    .select({
      hallId: venueHalls.id,
      venueId: venueHalls.venueId,
      organizationId: venues.organizationId,
    })
    .from(venueHalls)
    .innerJoin(venues, eq(venues.id, venueHalls.venueId))
    .where(eq(venueHalls.id, hallId))
    .limit(1);
  return row ?? null;
}

/**
 * Lock order shared with submit/member/admin transitions:
 * legal user/org -> availability venue/(hall) -> actor -> venue -> org ->
 * qualifying membership. The caller locks/creates the hall next, then children.
 */
async function lockAuthorizedVenue(
  tx: LockTransaction,
  executor: Executor,
  actorUserId: string,
  expected: VenueScope,
  hallIds: number[],
): Promise<
  | { ok: true; venue: typeof venues.$inferSelect }
  | HallWriteFailure
> {
  await acquireLegalScopeLocks(tx, {
    userIds: [actorUserId],
    organizationIds: expected.organizationId == null
      ? []
      : [expected.organizationId],
  });
  await acquireAvailabilityLocks(tx, {
    venueId: expected.venueId,
    hallIds,
    localDates: [],
    conflictGroupIds: [],
  });

  const actor = await getLockedAppUserById(actorUserId, executor);
  if (!actor) return failure(403, "FORBIDDEN", "Forbidden");

  const [venue] = await executor
    .select()
    .from(venues)
    .where(eq(venues.id, expected.venueId))
    .for("update")
    .limit(1);
  if (!venue) return failure(404, "VENUE_NOT_FOUND", "Venue not found");
  if (venue.organizationId !== expected.organizationId) {
    return failure(409, "VENUE_SCOPE_CHANGED");
  }

  // Global admins bypass membership, not organization editability. Lock and
  // validate the organization before the capability resolver can take its
  // membership lock.
  if (venue.organizationId != null) {
    const [organization] = await executor
      .select({ status: partnerOrganizations.status })
      .from(partnerOrganizations)
      .where(eq(partnerOrganizations.id, venue.organizationId))
      .for("update")
      .limit(1);
    if (
      !organization
      || !ORG_STATUSES_ALLOWING_ACCESS.includes(
        organization.status as (typeof ORG_STATUSES_ALLOWING_ACCESS)[number],
      )
    ) {
      return failure(403, "ORGANIZATION_NOT_EDITABLE", "Forbidden");
    }
  }

  const access = await authorizeVenueCapabilityLocked(
    actor,
    venue.id,
    "manage_halls",
    executor,
  );
  if (!access.ok) {
    return failure(
      access.status === 404 ? 404 : 403,
      access.status === 404 ? "VENUE_NOT_FOUND" : "FORBIDDEN",
      access.error,
    );
  }
  return { ok: true, venue };
}

async function uniqueHallSlug(
  venueId: number,
  base: string,
  executor: Executor,
  excludeId?: number,
): Promise<string> {
  return pickUniqueSlug(base, async (candidate) => {
    const [hit] = await executor
      .select({ id: venueHalls.id })
      .from(venueHalls)
      .where(and(eq(venueHalls.venueId, venueId), eq(venueHalls.slug, candidate)))
      .limit(1);
    return Boolean(hit && hit.id !== excludeId);
  });
}

async function lockHallChildren(
  executor: Executor,
  venueId: number,
  hallId: number,
): Promise<LockedChildren> {
  const images = await executor
    .select()
    .from(venueImages)
    .where(and(eq(venueImages.venueId, venueId), eq(venueImages.hallId, hallId)))
    .orderBy(asc(venueImages.sortOrder), asc(venueImages.id))
    .for("update");
  const seating = await executor
    .select()
    .from(venueHallSeatingOptions)
    .where(eq(venueHallSeatingOptions.hallId, hallId))
    .orderBy(asc(venueHallSeatingOptions.sortOrder), asc(venueHallSeatingOptions.id))
    .for("update");
  const menuLinks = await executor
    .select()
    .from(venueHallMenuSets)
    .where(and(
      eq(venueHallMenuSets.venueId, venueId),
      eq(venueHallMenuSets.hallId, hallId),
    ))
    .orderBy(asc(venueHallMenuSets.menuSetId))
    .for("update");
  return { images, seating, menuLinks };
}

async function assertMenuSetsBelongToVenue(
  executor: Executor,
  venueId: number,
  inheritMenu: boolean,
  menuSetIds: number[],
) {
  if (inheritMenu) return;
  const ids = [...menuSetIds].sort((left, right) => left - right);
  const rows = await executor
    .select({ id: venueMenuSets.id })
    .from(venueMenuSets)
    .where(and(
      eq(venueMenuSets.venueId, venueId),
      inArray(venueMenuSets.id, ids),
    ))
    .orderBy(asc(venueMenuSets.id))
    .for("update");
  if (rows.length !== ids.length || rows.some((row, index) => row.id !== ids[index])) {
    throw new HallWriteRollback(failure(
      400,
      "MENU_SET_VENUE_MISMATCH",
      "Every menu set must belong to the hall venue",
    ));
  }
}

async function replaceHallImages(
  executor: Executor,
  venueId: number,
  hallId: number,
  urls: string[],
) {
  await executor
    .delete(venueImages)
    .where(and(eq(venueImages.venueId, venueId), eq(venueImages.hallId, hallId)));
  if (!urls.length) return;
  await executor.insert(venueImages).values(urls.map((url, sortOrder) => ({
    venueId,
    hallId,
    url,
    sortOrder,
    isCover: false,
  })));
}

async function replaceHallSeating(
  executor: Executor,
  hallId: number,
  seating: HallCreateInput["seating"] | NonNullable<HallPatchInput["seating"]>,
) {
  await executor
    .delete(venueHallSeatingOptions)
    .where(eq(venueHallSeatingOptions.hallId, hallId));
  const rows = normalizedSeating(seating);
  if (!rows.length) return;
  await executor.insert(venueHallSeatingOptions).values(
    rows.map((row) => ({ hallId, ...row })),
  );
}

async function replaceHallMenuSets(
  executor: Executor,
  venueId: number,
  hallId: number,
  inheritMenu: boolean,
  menuSetIds: number[],
) {
  await executor
    .delete(venueHallMenuSets)
    .where(and(
      eq(venueHallMenuSets.venueId, venueId),
      eq(venueHallMenuSets.hallId, hallId),
    ));
  if (inheritMenu) return;
  const ids = [...menuSetIds].sort((left, right) => left - right);
  await executor.insert(venueHallMenuSets).values(ids.map((menuSetId) => ({
    venueId,
    hallId,
    menuSetId,
  })));
}

async function findCreateReplay(
  executor: Executor,
  venueId: number,
  requestId: string,
  payloadHash: string,
): Promise<HallWriteSuccess | HallWriteFailure | null> {
  const [prior] = await executor
    .select()
    .from(venueHalls)
    .where(and(
      eq(venueHalls.venueId, venueId),
      eq(venueHalls.creationRequestId, requestId),
    ))
    .limit(1);
  if (!prior) return null;
  if (prior.creationPayloadHash !== payloadHash) {
    return failure(409, "IDEMPOTENCY_KEY_REUSED", "IDEMPOTENCY_KEY_REUSED");
  }
  return { ok: true, hall: prior, replayed: true };
}

export async function createHallDraft(
  actorUserId: string,
  raw: unknown,
): Promise<HallWriteSuccess | HallWriteFailure> {
  if (!isMultiHallEnabled()) return failure(404, "FEATURE_DISABLED");
  const parsed = hallCreateSchema.safeParse(raw);
  if (!parsed.success) {
    return failure(400, "VALIDATION_FAILED", "Validation failed", {
      details: parsed.error.issues,
    });
  }
  const data = parsed.data;
  const expected = await loadVenueScope(data.venueId);
  if (!expected) return failure(404, "VENUE_NOT_FOUND", "Venue not found");
  const payloadHash = hallCreatePayloadHash(data);

  try {
    return await db.transaction(async (tx) => {
      const executor = tx as unknown as Executor;
      const authority = await lockAuthorizedVenue(
        tx,
        executor,
        actorUserId,
        expected,
        [],
      );
      if (!authority.ok) return authority;

      const replay = await findCreateReplay(
        executor,
        authority.venue.id,
        data.hallCreateRequestId,
        payloadHash,
      );
      if (replay) return replay;

      const existingHalls = await executor
        .select({ id: venueHalls.id })
        .from(venueHalls)
        .where(eq(venueHalls.venueId, authority.venue.id))
        .orderBy(asc(venueHalls.id));

      // ON CONFLICT keeps the transaction usable even if a non-cooperating
      // writer wins the slug or idempotency unique index between probe/insert.
      for (let attempt = 0; attempt < 64; attempt += 1) {
        const slug = await uniqueHallSlug(
          authority.venue.id,
          data.slug ?? data.nameRo,
          executor,
        );
        const [created] = await executor
          .insert(venueHalls)
          .values({
            venueId: authority.venue.id,
            slug,
            status: "draft",
            isLegacyDefault: false,
            creationRequestId: data.hallCreateRequestId,
            creationPayloadHash: payloadHash,
            ...hallScalarCreateValues(data),
            updatedAt: new Date(),
          })
          .onConflictDoNothing()
          .returning();
        if (!created) {
          const concurrentReplay = await findCreateReplay(
            executor,
            authority.venue.id,
            data.hallCreateRequestId,
            payloadHash,
          );
          if (concurrentReplay) return concurrentReplay;
          continue;
        }

        await lockHallChildren(executor, authority.venue.id, created.id);
        await assertMenuSetsBelongToVenue(
          executor,
          authority.venue.id,
          data.inheritMenu,
          data.menuSetIds,
        );
        await replaceHallImages(
          executor,
          authority.venue.id,
          created.id,
          data.imageUrls,
        );
        await replaceHallSeating(executor, created.id, data.seating);
        await replaceHallMenuSets(
          executor,
          authority.venue.id,
          created.id,
          data.inheritMenu,
          data.menuSetIds,
        );

        // Only the first hall mirrors capacity to the transitional venue
        // columns. All writes share this transaction, so a child failure also
        // rolls this compatibility update back.
        if (existingHalls.length === 0) {
          await executor
            .update(venues)
            .set({
              capacityMin: data.capacityMin,
              capacityMax: data.capacityMax,
              updatedAt: new Date(),
            })
            .where(eq(venues.id, authority.venue.id));
        }
        return { ok: true, hall: created };
      }

      return failure(409, "HALL_CREATE_CONFLICT");
    });
  } catch (error) {
    if (error instanceof HallWriteRollback) return error.failure;
    throw error;
  }
}

function patchScalarValues(
  current: HallRow,
  patch: HallPatchInput,
  requestedSlug: string | undefined,
): Partial<typeof venueHalls.$inferInsert> {
  const set: Partial<typeof venueHalls.$inferInsert> = {};
  if (requestedSlug !== undefined) set.slug = requestedSlug;
  if (hasOwn(patch, "nameRo")) set.nameRo = patch.nameRo;
  if (hasOwn(patch, "nameRu")) set.nameRu = emptyToNull(patch.nameRu);
  if (hasOwn(patch, "nameEn")) set.nameEn = emptyToNull(patch.nameEn);
  if (hasOwn(patch, "descriptionRo")) set.descriptionRo = emptyToNull(patch.descriptionRo);
  if (hasOwn(patch, "descriptionRu")) set.descriptionRu = emptyToNull(patch.descriptionRu);
  if (hasOwn(patch, "descriptionEn")) set.descriptionEn = emptyToNull(patch.descriptionEn);
  if (hasOwn(patch, "capacityMin")) set.capacityMin = patch.capacityMin;
  if (hasOwn(patch, "capacityMax")) set.capacityMax = patch.capacityMax;
  if (hasOwn(patch, "pricingModel")) set.pricingModel = patch.pricingModel;
  if (hasOwn(patch, "basePrice")) set.basePrice = patch.basePrice;
  if (hasOwn(patch, "minimumOrder")) set.minimumOrder = patch.minimumOrder;
  if (hasOwn(patch, "currency")) set.currency = patch.currency;
  if (hasOwn(patch, "depositType")) set.depositType = patch.depositType;
  if (hasOwn(patch, "depositValue")) set.depositValue = patch.depositValue;
  if (patch.depositType === "none" && !hasOwn(patch, "depositValue")) {
    set.depositValue = null;
  }
  if (hasOwn(patch, "facilities")) set.facilities = patch.facilities;
  if (hasOwn(patch, "workingHours")) set.workingHours = patch.workingHours;
  if (hasOwn(patch, "bufferMinutes")) set.bufferMinutes = patch.bufferMinutes;
  if (hasOwn(patch, "bookingTermsRo")) set.bookingTermsRo = emptyToNull(patch.bookingTermsRo);
  if (hasOwn(patch, "bookingTermsRu")) set.bookingTermsRu = emptyToNull(patch.bookingTermsRu);
  if (hasOwn(patch, "bookingTermsEn")) set.bookingTermsEn = emptyToNull(patch.bookingTermsEn);
  if (hasOwn(patch, "sortOrder")) set.sortOrder = patch.sortOrder;

  // Keep the current status/idempotency identity outside the caller-controlled
  // patch. This also makes the returned shape easy to compare below.
  void current;
  return set;
}

function scalarValueChanged(
  current: HallRow,
  set: Partial<typeof venueHalls.$inferInsert>,
): boolean {
  return Object.entries(set).some(([key, value]) => {
    const currentValue = current[key as keyof HallRow];
    if (value && typeof value === "object") {
      return canonicalJson(value) !== canonicalJson(currentValue ?? null);
    }
    return (value ?? null) !== (currentValue ?? null);
  });
}

function seatingMatches(current: SeatingRow[], requested: HallPatchInput["seating"]): boolean {
  if (requested === undefined) return true;
  const left = current.map((row) => ({
    type: row.type,
    labelRo: row.labelRo,
    labelRu: row.labelRu,
    labelEn: row.labelEn,
    capacityMin: row.capacityMin,
    capacityMax: row.capacityMax,
    notesRo: row.notesRo,
    notesRu: row.notesRu,
    notesEn: row.notesEn,
    sortOrder: row.sortOrder,
  }));
  return canonicalJson(left) === canonicalJson(normalizedSeating(requested));
}

const MODERATED_HALL_FIELDS = new Set<keyof HallPatchInput>([
  "slug",
  "nameRo",
  "nameRu",
  "nameEn",
  "descriptionRo",
  "descriptionRu",
  "descriptionEn",
  "capacityMin",
  "capacityMax",
  "pricingModel",
  "basePrice",
  "minimumOrder",
  "currency",
  "depositType",
  "depositValue",
  "facilities",
  "workingHours",
  "bookingTermsRo",
  "bookingTermsRu",
  "bookingTermsEn",
  "seating",
  "imageUrls",
  "menuSetIds",
  "inheritMenu",
]);

function statusFailure(status: string): HallWriteFailure | null {
  if (status === "draft" || status === "rejected" || status === "active") return null;
  return failure(409, "HALL_NOT_EDITABLE", "HALL_NOT_EDITABLE", {
    hallStatus: status,
  });
}

export async function patchHallDraft(
  actorUserId: string,
  venueId: number,
  hallId: number,
  raw: unknown,
): Promise<HallWriteSuccess | HallWriteFailure> {
  if (!isMultiHallEnabled()) return failure(404, "FEATURE_DISABLED");
  const parsed = hallPatchSchema.safeParse(raw);
  if (!parsed.success) {
    return failure(400, "VALIDATION_FAILED", "Validation failed", {
      details: parsed.error.issues,
    });
  }
  const patch = parsed.data;
  if (!Number.isSafeInteger(venueId) || venueId <= 0 || !Number.isSafeInteger(hallId) || hallId <= 0) {
    return failure(404, "HALL_NOT_FOUND", "Not found");
  }
  const expected = await loadHallScope(hallId);
  if (!expected) return failure(404, "HALL_NOT_FOUND", "Not found");
  if (expected.venueId !== venueId) return failure(404, "HALL_NOT_FOUND", "Not found");

  try {
    return await db.transaction(async (tx) => {
      const executor = tx as unknown as Executor;
      const authority = await lockAuthorizedVenue(
        tx,
        executor,
        actorUserId,
        expected,
        [hallId],
      );
      if (!authority.ok) return authority;

      const [current] = await executor
        .select()
        .from(venueHalls)
        .where(and(
          eq(venueHalls.id, hallId),
          eq(venueHalls.venueId, authority.venue.id),
        ))
        .for("update")
        .limit(1);
      if (!current) return failure(409, "HALL_SCOPE_CHANGED");
      const blocked = statusFailure(current.status);
      if (blocked) return blocked;

      const children = await lockHallChildren(executor, authority.venue.id, current.id);
      const menuWasExplicit = hasOwn(patch, "inheritMenu") || hasOwn(patch, "menuSetIds");
      const requestedInheritMenu = menuWasExplicit ? patch.inheritMenu === true : false;
      const requestedMenuIds = menuWasExplicit ? patch.menuSetIds ?? [] : [];
      if (menuWasExplicit) {
        await assertMenuSetsBelongToVenue(
          executor,
          authority.venue.id,
          requestedInheritMenu,
          requestedMenuIds,
        );
      }

      const requestedSlug = patch.slug === undefined
        ? undefined
        : await uniqueHallSlug(authority.venue.id, patch.slug, executor, current.id);
      const scalarSet = patchScalarValues(current, patch, requestedSlug);

      const nextCapacityMin = hasOwn(scalarSet, "capacityMin")
        ? scalarSet.capacityMin ?? null
        : current.capacityMin;
      const nextCapacityMax = hasOwn(scalarSet, "capacityMax")
        ? scalarSet.capacityMax ?? null
        : current.capacityMax;
      if (
        nextCapacityMin != null
        && nextCapacityMax != null
        && nextCapacityMax < nextCapacityMin
      ) {
        return failure(400, "CAPACITY_MAX_LT_MIN", "capacity_max_lt_min");
      }

      const depositTouched = hasOwn(patch, "depositType") || hasOwn(patch, "depositValue");
      const nextDepositType = scalarSet.depositType ?? current.depositType;
      const nextDepositValue = hasOwn(scalarSet, "depositValue")
        ? scalarSet.depositValue ?? null
        : current.depositValue;
      if (
        depositTouched
        && ((nextDepositType === "none" && nextDepositValue != null)
          || (nextDepositType !== "none" && nextDepositValue == null)
          || (nextDepositType === "percent"
            && nextDepositValue != null
            && (nextDepositValue <= 0 || nextDepositValue > 100))
          || (nextDepositType === "fixed"
            && nextDepositValue != null
            && nextDepositValue <= 0))
      ) {
        return failure(400, "DEPOSIT_INCOHERENT", "deposit_incoherent");
      }

      const imageChanged = patch.imageUrls !== undefined
        && canonicalJson(children.images.map((image) => image.url))
          !== canonicalJson(patch.imageUrls);
      const seatingChanged = !seatingMatches(children.seating, patch.seating);
      const currentMenuIds = children.menuLinks.map((link) => link.menuSetId);
      const requestedSortedMenuIds = [...requestedMenuIds].sort((left, right) => left - right);
      const menuChanged = menuWasExplicit
        && canonicalJson(currentMenuIds) !== canonicalJson(requestedSortedMenuIds);
      const scalarChanged = scalarValueChanged(current, scalarSet);
      const statusChanged = current.status === "rejected";
      const changed = scalarChanged || imageChanged || seatingChanged || menuChanged || statusChanged;
      if (!changed) return { ok: true, hall: current };

      const changedScalarKeys = Object.keys(scalarSet)
        .filter((key) => {
          const one = { [key]: scalarSet[key as keyof typeof scalarSet] };
          return scalarValueChanged(current, one);
        }) as Array<keyof HallPatchInput>;
      const moderatedChange = imageChanged
        || seatingChanged
        || menuChanged
        || changedScalarKeys.some((key) => MODERATED_HALL_FIELDS.has(key));
      const nextStatus = current.status === "rejected"
        ? "draft"
        : current.status === "active" && moderatedChange
          ? "draft"
          : current.status;
      const [updated] = await executor
        .update(venueHalls)
        .set({ ...scalarSet, status: nextStatus, updatedAt: new Date() })
        .where(and(
          eq(venueHalls.id, current.id),
          eq(venueHalls.venueId, authority.venue.id),
          eq(venueHalls.status, current.status),
        ))
        .returning();
      if (!updated) throw new HallWriteRollback(failure(409, "HALL_CHANGED"));

      if (imageChanged && patch.imageUrls !== undefined) {
        await replaceHallImages(
          executor,
          authority.venue.id,
          current.id,
          patch.imageUrls,
        );
      }
      if (seatingChanged && patch.seating !== undefined) {
        await replaceHallSeating(executor, current.id, patch.seating);
      }
      if (menuChanged) {
        await replaceHallMenuSets(
          executor,
          authority.venue.id,
          current.id,
          requestedInheritMenu,
          requestedMenuIds,
        );
      }

      if (current.status === "active" && nextStatus !== "active") {
        const activeHalls = await executor
          .select({
            capacityMin: venueHalls.capacityMin,
            capacityMax: venueHalls.capacityMax,
          })
          .from(venueHalls)
          .where(and(
            eq(venueHalls.venueId, authority.venue.id),
            eq(venueHalls.status, "active"),
          ))
          .orderBy(asc(venueHalls.id));
        const approvedMinimums = activeHalls
          .map((hall) => hall.capacityMin)
          .filter((value): value is number => value != null);
        const approvedMaximums = activeHalls
          .map((hall) => hall.capacityMax)
          .filter((value): value is number => value != null);
        await executor
          .update(venues)
          .set({
            // A public venue must always have at least one approved Hall.
            isActive: authority.venue.isActive && activeHalls.length > 0,
            // Only approved Hall values may feed the public compatibility
            // columns; the just-edited draft must never leak before review.
            ...(activeHalls.length > 0
              ? {
                  capacityMin: approvedMinimums.length > 0
                    ? Math.min(...approvedMinimums)
                    : authority.venue.capacityMin,
                  capacityMax: approvedMaximums.length > 0
                    ? Math.max(...approvedMaximums)
                    : authority.venue.capacityMax,
                }
              : {}),
            updatedAt: new Date(),
          })
          .where(eq(venues.id, authority.venue.id));
      }
      return { ok: true, hall: updated };
    });
  } catch (error) {
    if (error instanceof HallWriteRollback) return error.failure;
    throw error;
  }
}
