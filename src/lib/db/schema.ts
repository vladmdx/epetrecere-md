import {
  pgTable,
  text,
  timestamp,
  integer,
  numeric,
  boolean,
  pgEnum,
  uuid,
  real,
  jsonb,
  varchar,
  serial,
  date,
  index,
  uniqueIndex,
  unique,
  primaryKey,
  check,
  foreignKey,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import type { TableShape } from "@/lib/planner/table-shape";

// ═══════════════════════════════════════════════════════
// ENUMS
// ═══════════════════════════════════════════════════════

export const userRoleEnum = pgEnum("user_role", [
  "super_admin",
  "admin",
  "editor",
  "artist",
  "user",
]);

export const categoryTypeEnum = pgEnum("category_type", [
  "artist",
  "service",
  "venue",
]);

export const calendarStatusEnum = pgEnum("calendar_status", [
  "available",
  "booked",
  "tentative",
  "blocked",
]);

export const calendarSourceEnum = pgEnum("calendar_source", [
  "manual",
  "google_sync",
  "booking",
]);

export const bookingStatusEnum = pgEnum("booking_status", [
  "pending",
  "accepted",
  "declined",
  "confirmed",
  "completed",
  "cancelled",
]);

export const leadStatusEnum = pgEnum("lead_status", [
  "new",
  "contacted",
  "proposal_sent",
  "negotiation",
  "confirmed",
  "completed",
  "lost",
  "follow_up",
]);

export const leadSourceEnum = pgEnum("lead_source", [
  "form",
  "wizard",
  "direct",
  "import",
]);

export const leadActivityTypeEnum = pgEnum("lead_activity_type", [
  "note",
  "email",
  "call",
  "sms",
  "status_change",
  "assignment",
]);

export const blogStatusEnum = pgEnum("blog_status", [
  "draft",
  "published",
  "archived",
]);

export const homepageSectionTypeEnum = pgEnum("homepage_section_type", [
  "hero",
  "search_bar",
  "categories",
  "featured_artists",
  "featured_venues",
  "event_planner",
  "services",
  "process",
  "testimonials",
  "stats",
  "clients",
  "blog",
  "cta",
]);

export const importStatusEnum = pgEnum("import_status", [
  "pending",
  "processing",
  "completed",
  "failed",
]);

export const videoPlatformEnum = pgEnum("video_platform", [
  "youtube",
  "vimeo",
]);

export const entityTypeEnum = pgEnum("entity_type", ["artist", "venue"]);

export const redirectStatusEnum = pgEnum("redirect_status", ["301", "302"]);

// ═══════════════════════════════════════════════════════
// PARTNER ORGANIZATIONS → VENUES → HALLS (ADR 0028)
// Expand-phase model. Behaviour gated by the MULTI_HALL feature flag.
// ═══════════════════════════════════════════════════════

export const partnerOrgTypeEnum = pgEnum("partner_org_type", [
  "individual",
  "sole_trader",
  "company",
]);

/** Shared lifecycle status for organizations and halls. */
export const partnerEntityStatusEnum = pgEnum("partner_entity_status", [
  "draft",
  "pending",
  "active",
  "rejected",
  "suspended",
  "archived",
]);

export const orgMemberRoleEnum = pgEnum("org_member_role", [
  "owner",
  "admin",
  "manager",
  "staff",
]);

export const hallPricingModelEnum = pgEnum("hall_pricing_model", [
  "per_person",
  "minimum_order",
  "fixed",
  "quote",
]);

export const hallDepositTypeEnum = pgEnum("hall_deposit_type", [
  "none",
  "percent",
  "fixed",
]);

export const hallSeatingTypeEnum = pgEnum("hall_seating_type", [
  "banquet",
  "theatre",
  "classroom",
  "cocktail",
  "u_shape",
  "custom",
]);

export const reservationScopeEnum = pgEnum("reservation_scope", [
  "hall",
  "venue",
]);

export const scheduleBlockKindEnum = pgEnum("schedule_block_kind", [
  "maintenance",
  "sanitary_day",
  "private_event",
  "manual",
  "external_calendar",
]);

// ── ADR 0028 tables ──────────────────────────────────────────────────────
// Defined before `venues`/`venue_images`/`booking_requests` so their composite
// foreign keys can reference venue_halls(id, venue_id) at module-eval time.

export const partnerOrganizations = pgTable(
  "partner_organizations",
  {
    id: serial("id").primaryKey(),
    type: partnerOrgTypeEnum("type").notNull().default("company"),
    displayName: text("display_name").notNull(),
    legalName: text("legal_name"),
    idNumber: text("id_number"),
    legalAddress: text("legal_address"),
    billingEmail: text("billing_email"),
    billingPhone: text("billing_phone"),
    /** Server-side only. Never exposed in catalog, logs or public payloads. */
    bankDetails: jsonb("bank_details").$type<Record<string, unknown>>(),
    /**
     * Durable identity for an explicit organization-creation request. This is
     * only an idempotency scope; authorization always comes from live
     * organization membership. ON DELETE SET NULL leaves a non-authorizing
     * tombstone while preserving the request id/hash for auditability.
     */
    creationActorUserId: uuid("creation_actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    creationRequestId: uuid("creation_request_id"),
    creationRequestHash: text("creation_request_hash"),
    status: partnerEntityStatusEnum("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("partner_organizations_actor_creation_request_uidx")
      .on(t.creationActorUserId, t.creationRequestId)
      .where(sql`${t.creationActorUserId} IS NOT NULL AND ${t.creationRequestId} IS NOT NULL`),
    check(
      "partner_organizations_creation_request_shape_chk",
      sql`(${t.creationActorUserId} IS NULL
          AND ${t.creationRequestId} IS NULL
          AND ${t.creationRequestHash} IS NULL)
        OR (${t.creationRequestId} IS NOT NULL
          AND ${t.creationRequestHash} IS NOT NULL)`,
    ),
  ],
);

export const partnerOrganizationMembers = pgTable(
  "partner_organization_members",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id")
      .references(() => partnerOrganizations.id, { onDelete: "cascade" })
      .notNull(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    role: orgMemberRoleEnum("role").notNull().default("owner"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    unique("partner_org_members_org_user_unique").on(t.organizationId, t.userId),
    index("partner_org_members_user_idx").on(t.userId),
    index("partner_org_members_org_idx").on(t.organizationId),
  ],
);

export const venueHalls = pgTable(
  "venue_halls",
  {
    id: serial("id").primaryKey(),
    venueId: integer("venue_id")
      .references(() => venues.id, { onDelete: "cascade" })
      .notNull(),
    /** Durable idempotency identity for one explicit Hall creation request. */
    creationRequestId: uuid("creation_request_id"),
    /** SHA-256 of the normalized create payload (the request UUID is excluded). */
    creationPayloadHash: text("creation_payload_hash"),
    slug: text("slug").notNull(),
    nameRo: text("name_ro").notNull(),
    nameRu: text("name_ru"),
    nameEn: text("name_en"),
    descriptionRo: text("description_ro"),
    descriptionRu: text("description_ru"),
    descriptionEn: text("description_en"),
    capacityMin: integer("capacity_min"),
    capacityMax: integer("capacity_max"),
    pricingModel: hallPricingModelEnum("pricing_model").notNull().default("per_person"),
    basePrice: numeric("base_price", { precision: 12, scale: 2, mode: "number" }),
    minimumOrder: numeric("minimum_order", { precision: 12, scale: 2, mode: "number" }),
    currency: varchar("currency", { length: 3 }).notNull().default("EUR"),
    depositType: hallDepositTypeEnum("deposit_type").notNull().default("none"),
    depositValue: numeric("deposit_value", { precision: 12, scale: 2, mode: "number" }),
    facilities: jsonb("facilities").$type<string[]>().default([]),
    /** NULL = inherit the venue's working hours. */
    workingHours: jsonb("working_hours").$type<Record<
      string,
      { open: string; close: string } | null
    >>(),
    /** NULL = inherit the venue's buffer. */
    bufferMinutes: integer("buffer_minutes"),
    bookingTermsRo: text("booking_terms_ro"),
    bookingTermsRu: text("booking_terms_ru"),
    bookingTermsEn: text("booking_terms_en"),
    isLegacyDefault: boolean("is_legacy_default").notNull().default(false),
    status: partnerEntityStatusEnum("status").notNull().default("draft"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("venue_halls_venue_slug_unique").on(t.venueId, t.slug),
    uniqueIndex("venue_halls_venue_creation_request_uidx")
      .on(t.venueId, t.creationRequestId)
      .where(sql`${t.creationRequestId} IS NOT NULL`),
    // Enables composite FKs (hall_id, venue_id) on child tables.
    unique("venue_halls_id_venue_unique").on(t.id, t.venueId),
    uniqueIndex("venue_halls_one_legacy_default_per_venue")
      .on(t.venueId)
      .where(sql`${t.isLegacyDefault}`),
    index("venue_halls_venue_status_sort_idx").on(t.venueId, t.status, t.sortOrder),
    index("venue_halls_capacity_idx").on(t.venueId, t.capacityMin, t.capacityMax),
    check(
      "venue_halls_capacity_chk",
      sql`${t.capacityMin} IS NULL OR ${t.capacityMax} IS NULL OR ${t.capacityMax} >= ${t.capacityMin}`,
    ),
    check(
      "venue_halls_creation_request_shape_chk",
      sql`(${t.creationRequestId} IS NULL) = (${t.creationPayloadHash} IS NULL)`,
    ),
  ],
);

export const venueHallSeatingOptions = pgTable(
  "venue_hall_seating_options",
  {
    id: serial("id").primaryKey(),
    hallId: integer("hall_id")
      .references(() => venueHalls.id, { onDelete: "cascade" })
      .notNull(),
    type: hallSeatingTypeEnum("type").notNull(),
    labelRo: text("label_ro"),
    labelRu: text("label_ru"),
    labelEn: text("label_en"),
    capacityMin: integer("capacity_min"),
    capacityMax: integer("capacity_max"),
    notesRo: text("notes_ro"),
    notesRu: text("notes_ru"),
    notesEn: text("notes_en"),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("hall_seating_hall_idx").on(t.hallId, t.sortOrder)],
);

export const venueMenuSets = pgTable(
  "venue_menu_sets",
  {
    id: serial("id").primaryKey(),
    venueId: integer("venue_id")
      .references(() => venues.id, { onDelete: "cascade" })
      .notNull(),
    nameRo: text("name_ro").notNull(),
    nameRu: text("name_ru"),
    nameEn: text("name_en"),
    isDefault: boolean("is_default").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("venue_menu_sets_one_default_per_venue")
      .on(t.venueId)
      .where(sql`${t.isDefault}`),
    index("venue_menu_sets_venue_idx").on(t.venueId),
    // Enables same-venue composite FKs from menu rows and hall links.
    unique("venue_menu_sets_id_venue_unique").on(t.id, t.venueId),
  ],
);

export const venueHallMenuSets = pgTable(
  "venue_hall_menu_sets",
  {
    hallId: integer("hall_id").notNull(),
    menuSetId: integer("menu_set_id").notNull(),
    // Same-venue guard: both hall and set must belong to this venue.
    venueId: integer("venue_id").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.hallId, t.menuSetId] }),
    foreignKey({
      name: "venue_hall_menu_sets_hall_venue_fk",
      columns: [t.hallId, t.venueId],
      foreignColumns: [venueHalls.id, venueHalls.venueId],
    }).onDelete("cascade"),
    foreignKey({
      name: "venue_hall_menu_sets_set_venue_fk",
      columns: [t.menuSetId, t.venueId],
      foreignColumns: [venueMenuSets.id, venueMenuSets.venueId],
    }).onDelete("cascade"),
  ],
);

export const venueScheduleBlocks = pgTable(
  "venue_schedule_blocks",
  {
    id: serial("id").primaryKey(),
    venueId: integer("venue_id")
      .references(() => venues.id, { onDelete: "cascade" })
      .notNull(),
    hallId: integer("hall_id"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    kind: scheduleBlockKindEnum("kind").notNull().default("manual"),
    reason: text("reason"),
    source: text("source"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    foreignKey({
      name: "venue_schedule_blocks_hall_venue_fk",
      columns: [t.hallId, t.venueId],
      foreignColumns: [venueHalls.id, venueHalls.venueId],
    }).onDelete("restrict"),
    index("venue_schedule_blocks_venue_time_idx").on(t.venueId, t.startsAt, t.endsAt),
    index("venue_schedule_blocks_hall_time_idx").on(t.hallId, t.startsAt, t.endsAt),
    check("venue_schedule_blocks_interval_chk", sql`${t.endsAt} > ${t.startsAt}`),
    check("venue_schedule_blocks_hall_requires_venue_chk", sql`${t.hallId} IS NULL OR ${t.venueId} IS NOT NULL`),
  ],
);

export const venueHallConflictGroups = pgTable(
  "venue_hall_conflict_groups",
  {
    id: serial("id").primaryKey(),
    venueId: integer("venue_id")
      .references(() => venues.id, { onDelete: "cascade" })
      .notNull(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("venue_hall_conflict_groups_venue_idx").on(t.venueId),
    unique("venue_hall_conflict_groups_id_venue_unique").on(t.id, t.venueId),
  ],
);

export const venueHallConflictGroupMembers = pgTable(
  "venue_hall_conflict_group_members",
  {
    groupId: integer("group_id").notNull(),
    hallId: integer("hall_id").notNull(),
    // Same-venue guard: group and hall must belong to this venue.
    venueId: integer("venue_id").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.groupId, t.hallId] }),
    foreignKey({
      name: "conflict_members_group_venue_fk",
      columns: [t.groupId, t.venueId],
      foreignColumns: [venueHallConflictGroups.id, venueHallConflictGroups.venueId],
    }).onDelete("cascade"),
    foreignKey({
      name: "conflict_members_hall_venue_fk",
      columns: [t.hallId, t.venueId],
      foreignColumns: [venueHalls.id, venueHalls.venueId],
    }).onDelete("cascade"),
  ],
);

/** CP3 #4 — persistent queue for venues/orgs that need manual admin review
 *  (e.g. imported venues with no owner). Not a log line. */
export const partnerAdminReviewCases = pgTable(
  "partner_admin_review_cases",
  {
    id: serial("id").primaryKey(),
    venueId: integer("venue_id").references(() => venues.id, { onDelete: "cascade" }),
    organizationId: integer("organization_id").references(
      () => partnerOrganizations.id,
      { onDelete: "cascade" },
    ),
    reason: text("reason").notNull(),
    status: partnerEntityStatusEnum("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("partner_admin_review_open_venue_ux")
      .on(t.venueId, t.reason)
      .where(sql`${t.status} = 'pending'`),
    index("partner_admin_review_status_idx").on(t.status),
  ],
);

// ═══════════════════════════════════════════════════════
// USERS
// ═══════════════════════════════════════════════════════

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  clerkId: text("clerk_id").unique().notNull(),
  email: text("email").unique().notNull(),
  name: text("name"),
  phone: text("phone"),
  role: userRoleEnum("role").default("user").notNull(),
  avatarUrl: text("avatar_url"),
  languagePref: varchar("language_pref", { length: 2 }).default("ro"),
  // Google Calendar OAuth tokens for calendar sync
  onboardingComplete: boolean("onboarding_complete").default(false).notNull(),
  /** Notification digest frequency: 'instant' (default), 'daily', 'weekly'. */
  notificationDigestFrequency: varchar("notification_digest_frequency", { length: 16 })
    .default("instant")
    .notNull(),
  /** Per-channel toggles per notification type. Missing keys default to ON.
   *  Shape: { [type]: { email: boolean, push: boolean } }. Types are the
   *  values from dispatchNotification's `type` arg. Known types:
   *   - booking_request_new     (cerere nouă)
   *   - booking_status_changed  (booking acceptat/confirmat/anulat)
   *   - booking_conflict        (conflict potențial pe dată)
   *   - message_new             (chat mesaj)
   *   - review_new              (recenzie nouă)
   *   - reminder                (reminder generic)
   *   - payment_received        (plată)
   *  Clients edit this via /api/me/notification-preferences. */
  notificationPrefs: jsonb("notification_prefs")
    .$type<Record<string, { email?: boolean; push?: boolean }>>()
    .default({}),
  /** IANA tz name. Used by email formatting + Inngest date rendering so
   *  reminders land at the user's wall-clock time. Default Europe/Chisinau. */
  timezone: varchar("timezone", { length: 64 })
    .default("Europe/Chisinau")
    .notNull(),
  googleRefreshToken: text("google_refresh_token"),
  googleAccessToken: text("google_access_token"),
  googleTokenExpiresAt: timestamp("google_token_expires_at"),
  /** Personal referral code the user can share. Generated lazily on first
   *  `/api/me/referral` GET so existing users get one retroactively. */
  referralCode: varchar("referral_code", { length: 24 }).unique(),
  /** Code this user signed up WITH. Captured from ?ref=xxx on landing.
   *  Immutable after first set so users can't game the system. */
  referredByCode: varchar("referred_by_code", { length: 24 }),
  /** Credits earned from successful referrals, in EUR cents. Read-only
   *  for users — incremented by /api/referrals/trigger when a milestone
   *  is hit. Redeemable against subscription invoices (future Stripe tie-in). */
  referralCreditCents: integer("referral_credit_cents").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/**
 * Audit trail for referral milestones. One row per credited event.
 * `eventType` lifecycle:
 *   signup       — referee created an account (0 credit, tracking only)
 *   onboarded    — referee published a venue or artist profile (+5€)
 *   first_booking — referee received their first confirmed booking (+20€)
 *
 * A given (referrer, referred, eventType) triple is unique — we never
 * double-credit the same milestone.
 */
export const referralEvents = pgTable(
  "referral_events",
  {
    id: serial("id").primaryKey(),
    referrerUserId: uuid("referrer_user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    referredUserId: uuid("referred_user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    eventType: text("event_type").notNull(),
    creditCents: integer("credit_cents").default(0).notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_referral_referrer").on(t.referrerUserId, t.createdAt),
    index("idx_referral_referred").on(t.referredUserId),
  ],
);

// ═══════════════════════════════════════════════════════
// CATEGORIES
// ═══════════════════════════════════════════════════════

export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  nameRo: text("name_ro").notNull(),
  nameRu: text("name_ru"),
  nameEn: text("name_en"),
  slug: text("slug").unique().notNull(),
  descriptionRo: text("description_ro"),
  descriptionRu: text("description_ru"),
  descriptionEn: text("description_en"),
  icon: text("icon"),
  imageUrl: text("image_url"),
  /** HTML `alt` attribute for the category image — used by screen readers
   *  and crawlers. Falls back to nameRo when null. */
  imageAlt: text("image_alt"),
  /** Optional short label rendered as a small pill on category cards.
   *  Distinct from the slug — admins set it from /admin/categorii ("Nou",
   *  "Popular", "Hot", etc.). Free-form, displayed verbatim. */
  badge: text("badge"),
  priceFrom: integer("price_from"),
  sortOrder: integer("sort_order").default(0),
  parentId: integer("parent_id"),
  type: categoryTypeEnum("type").default("artist").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  seoTitleRo: text("seo_title_ro"),
  seoTitleRu: text("seo_title_ru"),
  seoTitleEn: text("seo_title_en"),
  seoDescRo: text("seo_desc_ro"),
  seoDescRu: text("seo_desc_ru"),
  seoDescEn: text("seo_desc_en"),
  /** Long-form Romanian SEO content rendered at the bottom of the category
   *  landing page. Markdown-ish plain text; paragraphs separated by blank
   *  lines. Optimized for Moldova / Chișinău local search intent. */
  seoBodyRo: text("seo_body_ro"),
  seoBodyRu: text("seo_body_ru"),
  seoBodyEn: text("seo_body_en"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ═══════════════════════════════════════════════════════
// ARTISTS
// ═══════════════════════════════════════════════════════

export const artists = pgTable("artists", {
  id: serial("id").primaryKey(),
  // One user owns at most one artist profile. Enforced via partial UNIQUE
  // index at the migration level (the text here is advisory — see migration).
  userId: uuid("user_id")
    .references(() => users.id, { onDelete: "set null" })
    .unique(),
  nameRo: text("name_ro").notNull(),
  nameRu: text("name_ru"),
  nameEn: text("name_en"),
  slug: text("slug").unique().notNull(),
  descriptionRo: text("description_ro"),
  descriptionRu: text("description_ru"),
  descriptionEn: text("description_en"),
  categoryIds: integer("category_ids").array(),
  /** Event types this partner accepts. Existing partners default to every
   *  canonical type; onboarding and /dashboard/setari let them narrow it. */
  eventTypes: text("event_types")
    .array()
    .default(sql`ARRAY['wedding','proposal','cununie','baptism','cumatrie','birthday','kids_birthday','corporate','concert','other']::text[]`)
    .notNull(),
  priceFrom: integer("price_from"),
  priceCurrency: varchar("price_currency", { length: 3 }).default("EUR"),
  location: text("location"),
  phone: text("phone"),
  email: text("email"),
  website: text("website"),
  instagram: text("instagram"),
  facebook: text("facebook"),
  youtube: text("youtube"),
  tiktok: text("tiktok"),
  ratingAvg: real("rating_avg").default(0),
  ratingCount: integer("rating_count").default(0),
  isActive: boolean("is_active").default(false).notNull(),
  isFeatured: boolean("is_featured").default(false).notNull(),
  isVerified: boolean("is_verified").default(false).notNull(),
  isPremium: boolean("is_premium").default(false).notNull(),
  calendarEnabled: boolean("calendar_enabled").default(false).notNull(),
  bufferHours: integer("buffer_hours").default(2),
  /** Minutes of buffer between bookings — added to event end time for the
   *  next-availability check. Default 15, configurable up to 90 from
   *  /dashboard/setari. Replaces the legacy bufferHours field for the
   *  client-facing calendar; bufferHours stays for backward compat. */
  bufferMinutes: integer("buffer_minutes").default(15).notNull(),
  /** Where the artist is based — used for travel-distance filtering on
   *  the public discovery grid. Defaults to "Chișinău". */
  baseCity: text("base_city").default("Chișinău"),
  /** Max distance the artist will travel from base_city (km). 30 = base
   *  city + suburbs, 999 = "all Moldova". */
  travelDistanceKm: integer("travel_distance_km").default(30).notNull(),
  /** When true, the artist charges extra for travel beyond their base
   *  city — surfaced in the booking summary so the client knows upfront. */
  travelSurchargeEnabled: boolean("travel_surcharge_enabled").default(false).notNull(),
  /** Extra fee (€) for travel. Applied when client picks an event in a
   *  different city than baseCity. */
  travelSurchargeAmount: integer("travel_surcharge_amount"),
  /** When true, the artist hides the priceFrom on public profile and
   *  client sees a "request quote" CTA instead of the standard booking
   *  form. Useful for artists with non-fixed pricing (negotiated per
   *  event) who don't want to anchor expectations. */
  priceHidden: boolean("price_hidden").default(false).notNull(),
  sortOrder: integer("sort_order").default(0),
  // Feature 14 — auto-reply on new booking request. When enabled, the message
  // is emailed to the client the moment their request lands, reducing bounce.
  autoReplyEnabled: boolean("auto_reply_enabled").default(false).notNull(),
  autoReplyMessage: text("auto_reply_message"),
  photoUrl: text("photo_url"),
  /** Up to 3 short video testimonials — embed URL (YouTube/Vimeo) or MP4.
   *  Each item has optional clientName + caption. Shown on the public
   *  artist profile under a "Testimoniale video" section. */
  videoTestimonials: jsonb("video_testimonials")
    .$type<Array<{ url: string; clientName: string | null; caption: string | null }>>()
    .default([]),
  seoTitleRo: text("seo_title_ro"),
  seoTitleRu: text("seo_title_ru"),
  seoTitleEn: text("seo_title_en"),
  seoDescRo: text("seo_desc_ro"),
  seoDescRu: text("seo_desc_ru"),
  seoDescEn: text("seo_desc_en"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const artistImages = pgTable("artist_images", {
  id: serial("id").primaryKey(),
  artistId: integer("artist_id")
    .references(() => artists.id, { onDelete: "cascade" })
    .notNull(),
  url: text("url").notNull(),
  altRo: text("alt_ro"),
  altRu: text("alt_ru"),
  altEn: text("alt_en"),
  sortOrder: integer("sort_order").default(0),
  isCover: boolean("is_cover").default(false).notNull(),
});

export const artistVideos = pgTable("artist_videos", {
  id: serial("id").primaryKey(),
  artistId: integer("artist_id")
    .references(() => artists.id, { onDelete: "cascade" })
    .notNull(),
  platform: videoPlatformEnum("platform").notNull(),
  videoId: text("video_id").notNull(),
  title: text("title"),
  sortOrder: integer("sort_order").default(0),
});

// Duration-based pricing tiers. Each row is a (duration, price, scope) triplet.
// scope decides WHEN the tier applies:
//   - "base"          → default rate, used unless a more specific override wins
//   - "weekend"       → Sat + Sun
//   - "weekday"       → Mon–Fri
//   - "evening"       → any day when the start time is >= scopeFromTime
//   - "specific_day"  → only on scopeDayOfWeek (0=Sun … 6=Sat)
// Resolution priority when several rows match: specific_day → evening →
// weekend/weekday → base. Client picks the minimum applicable price.
export const artistPackages = pgTable("artist_packages", {
  id: serial("id").primaryKey(),
  artistId: integer("artist_id")
    .references(() => artists.id, { onDelete: "cascade" })
    .notNull(),
  nameRo: text("name_ro").notNull(),
  nameRu: text("name_ru"),
  nameEn: text("name_en"),
  descriptionRo: text("description_ro"),
  descriptionRu: text("description_ru"),
  descriptionEn: text("description_en"),
  price: integer("price"),
  durationHours: real("duration_hours"),
  durationMinutes: integer("duration_minutes").default(0).notNull(),
  /**
   * How this row prices the work.
   *   per_hour  — the classic duration tier: N minutes for `price`.
   *   per_event — a fixed price for a whole event; `duration_hours`/
   *               `duration_minutes` then describe the AVERAGE length, not a
   *               billable unit.
   * Artists said their real pricing is per event and per event type, not per
   * hour, so both models coexist.
   */
  pricingMode: text("pricing_mode").default("per_hour").notNull(),
  /**
   * Canonical event-type key (see lib/events/normalize.ts) this price applies
   * to, or NULL for "any event type" — which is what every pre-existing row
   * means. A photographer charges one figure for a wedding and another for a
   * christening; this is that.
   */
  eventType: text("event_type"),
  /** base | weekend | weekday | evening | specific_day */
  scope: text("scope").default("base").notNull(),
  /** 0 (Sunday) – 6 (Saturday); used when scope="specific_day" */
  scopeDayOfWeek: integer("scope_day_of_week"),
  /** "HH:MM" cut-off; used when scope="evening" */
  scopeFromTime: text("scope_from_time"),
  isVisible: boolean("is_visible").default(true).notNull(),
});

// ═══════════════════════════════════════════════════════
// VENUES
// ═══════════════════════════════════════════════════════

export const venues = pgTable("venues", {
  id: serial("id").primaryKey(),
  // Legacy ownership. Kept for compatibility during the expand phase; the
  // canonical owner chain is user → membership → organization → venue.
  // The UNIQUE constraint is only dropped in a later (contract) phase.
  userId: uuid("user_id")
    .references(() => users.id, { onDelete: "set null" })
    .unique(),
  /** ADR 0028 — legal/billing holder this location belongs to. RESTRICT on
   *  delete (CP3 #3): an organization cannot be deleted while it owns venues,
   *  so this never becomes NULL and reactivates the legacy access path. */
  organizationId: integer("organization_id").references(
    () => partnerOrganizations.id,
    { onDelete: "restrict" },
  ),
  /** Stable identity for one explicit "Add venue" submission. A browser
   *  keeps this UUID across refresh/retry; the organization-scoped unique
   *  index makes a lost HTTP response safe to repeat. */
  onboardingSubmissionId: uuid("onboarding_submission_id"),
  /** Hash of the normalized creation payload. Reusing an idempotency key for
   *  different input is rejected instead of silently mutating a venue. */
  onboardingSubmissionHash: text("onboarding_submission_hash"),
  /** IANA timezone for this location; drives canonical booking intervals. */
  timezone: text("timezone").default("Europe/Chisinau").notNull(),
  nameRo: text("name_ro").notNull(),
  nameRu: text("name_ru"),
  nameEn: text("name_en"),
  slug: text("slug").unique().notNull(),
  descriptionRo: text("description_ro"),
  descriptionRu: text("description_ru"),
  descriptionEn: text("description_en"),
  address: text("address"),
  city: text("city"),
  lat: real("lat"),
  lng: real("lng"),
  capacityMin: integer("capacity_min"),
  capacityMax: integer("capacity_max"),
  pricePerPerson: integer("price_per_person"),
  phone: text("phone"),
  email: text("email"),
  website: text("website"),
  facilities: jsonb("facilities").$type<string[]>().default([]),
  menuUrl: text("menu_url"),
  /** Optional uploaded PDF menu (R2). Alternative to the digital menu editor. */
  menuPdfUrl: text("menu_pdf_url"),
  /** M12 — URL to an embeddable virtual tour (Matterport, Kuula, YouTube 360).
   *  Rendered as an iframe on the public venue detail page. */
  virtualTourUrl: text("virtual_tour_url"),
  calendarEnabled: boolean("calendar_enabled").default(false).notNull(),
  /** Phase 4 — auto-reply email sent the moment a venue booking lands. */
  autoReplyEnabled: boolean("auto_reply_enabled").default(false).notNull(),
  autoReplyMessage: text("auto_reply_message"),
  /** Up to 3 short video testimonials (embed URLs or MP4). Shown on the
   *  public venue profile. */
  videoTestimonials: jsonb("video_testimonials")
    .$type<Array<{ url: string; clientName: string | null; caption: string | null }>>()
    .default([]),
  /** Hours between bookings (venue might need setup/teardown time). */
  bufferHours: integer("buffer_hours").default(0),
  /** Minutes of buffer between bookings (parallel to artists.bufferMinutes).
   *  Default 15, configurable from /dashboard/sala/setari. */
  bufferMinutes: integer("buffer_minutes").default(15).notNull(),
  /** Weekly opening hours keyed by ISO weekday (mon..sun). Each entry
   *  is `{ open: "HH:mm", close: "HH:mm" }` or null meaning closed.
   *  Null at the column level = not configured (public page shows "la cerere"). */
  workingHours: jsonb("working_hours").$type<{
    mon: { open: string; close: string } | null;
    tue: { open: string; close: string } | null;
    wed: { open: string; close: string } | null;
    thu: { open: string; close: string } | null;
    fri: { open: string; close: string } | null;
    sat: { open: string; close: string } | null;
    sun: { open: string; close: string } | null;
  }>(),
  isActive: boolean("is_active").default(false).notNull(),
  /** Default true during the launch phase — every approved venue gets the
   *  premium homepage placement. We'll flip back to false once we
   *  introduce paid tiers and start gating the feature. */
  isFeatured: boolean("is_featured").default(true).notNull(),
  ratingAvg: real("rating_avg").default(0),
  ratingCount: integer("rating_count").default(0),
  seoTitleRo: text("seo_title_ro"),
  seoTitleRu: text("seo_title_ru"),
  seoTitleEn: text("seo_title_en"),
  seoDescRo: text("seo_desc_ro"),
  seoDescRu: text("seo_desc_ru"),
  seoDescEn: text("seo_desc_en"),
  /** Explicit OG/Twitter preview image URL. If null, public page falls
   *  back to the cover photo from venue_images. */
  ogImageUrl: text("og_image_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  uniqueIndex("venues_org_onboarding_submission_uidx")
    .on(t.organizationId, t.onboardingSubmissionId)
    .where(sql`${t.onboardingSubmissionId} IS NOT NULL`),
  check(
    "venues_onboarding_submission_shape_chk",
    sql`(${t.onboardingSubmissionId} IS NULL AND ${t.onboardingSubmissionHash} IS NULL)
      OR (${t.onboardingSubmissionId} IS NOT NULL
        AND ${t.onboardingSubmissionHash} IS NOT NULL
        AND ${t.organizationId} IS NOT NULL)`,
  ),
]);

export const venueImages = pgTable(
  "venue_images",
  {
    id: serial("id").primaryKey(),
    venueId: integer("venue_id")
      .references(() => venues.id, { onDelete: "cascade" })
      .notNull(),
    /** ADR 0028 — NULL = general/location image; non-null = hall image.
     *  Composite FK below guarantees the hall belongs to this venue. */
    hallId: integer("hall_id"),
    url: text("url").notNull(),
    altRo: text("alt_ro"),
    altRu: text("alt_ru"),
    altEn: text("alt_en"),
    sortOrder: integer("sort_order").default(0),
    isCover: boolean("is_cover").default(false).notNull(),
  },
  (t) => [
    /**
     * Composite FK (hall_id, venue_id) → venue_halls(id, venue_id).
     * Do NOT set onDelete() here: Drizzle would SET NULL both columns and
     * wipe venue_id. Authoritative SQL is 0028:
     *   PG15+  ON DELETE SET NULL (hall_id)
     *   PG<15  ON DELETE RESTRICT (archive the hall instead).
     */
    foreignKey({
      name: "venue_images_hall_venue_fk",
      columns: [t.hallId, t.venueId],
      foreignColumns: [venueHalls.id, venueHalls.venueId],
    }),
    index("venue_images_hall_idx").on(t.hallId),
    uniqueIndex("venue_images_one_general_cover_per_venue_uidx")
      .on(t.venueId)
      .where(sql`${t.hallId} IS NULL AND ${t.isCover}`),
    check("venue_images_hall_requires_venue_chk", sql`${t.hallId} IS NULL OR ${t.venueId} IS NOT NULL`),
    check(
      "venue_images_hall_cannot_be_cover_chk",
      sql`${t.hallId} IS NULL OR NOT ${t.isCover}`,
    ),
  ],
);

// ═══════════════════════════════════════════════════════
// VENUE DIGITAL MENU (Phase 3 — spec section 5)
// ═══════════════════════════════════════════════════════

export const venueMenuCategories = pgTable("venue_menu_categories", {
  id: serial("id").primaryKey(),
  venueId: integer("venue_id")
    .references(() => venues.id, { onDelete: "cascade" })
    .notNull(),
  /** ADR 0028 — optional menu-set scope; NULL keeps location-wide behaviour.
   *  Same-venue integrity is enforced by a composite FK (menu_set_id, venue_id)
   *  → venue_menu_sets(id, venue_id) in migration 0028 (authoritative). */
  menuSetId: integer("menu_set_id"),
  nameRo: text("name_ro").notNull(),
  nameRu: text("name_ru"),
  nameEn: text("name_en"),
  icon: text("icon"),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const venueMenuItems = pgTable("venue_menu_items", {
  id: serial("id").primaryKey(),
  categoryId: integer("category_id")
    .references(() => venueMenuCategories.id, { onDelete: "cascade" })
    .notNull(),
  nameRo: text("name_ro").notNull(),
  nameRu: text("name_ru"),
  nameEn: text("name_en"),
  descriptionRo: text("description_ro"),
  priceMdl: integer("price_mdl"),
  priceEur: integer("price_eur"),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const venueMenuPackages = pgTable("venue_menu_packages", {
  id: serial("id").primaryKey(),
  venueId: integer("venue_id")
    .references(() => venues.id, { onDelete: "cascade" })
    .notNull(),
  /** ADR 0028 — optional menu-set scope; NULL keeps location-wide behaviour.
   *  Same-venue integrity enforced by composite FK in migration 0028. */
  menuSetId: integer("menu_set_id"),
  nameRo: text("name_ro").notNull(),
  nameRu: text("name_ru"),
  nameEn: text("name_en"),
  pricePerPerson: integer("price_per_person").notNull(),
  currency: varchar("currency", { length: 3 }).default("EUR"),
  includes: text("includes"),
  excludes: text("excludes"),
  minGuests: integer("min_guests"),
  isRecommended: boolean("is_recommended").default(false).notNull(),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * Cache for AI-parsed menu scans. Keyed by SHA-256 of the uploaded file
 * bytes so re-scanning the same photo/PDF is free. Result is the raw
 * JSON payload returned by /api/venue-menu/scan. Scoped per-venue so
 * we never leak another venue's parsed menu.
 *
 * Safe to purge any row older than ~30d; entries rebuild on next scan.
 */
export const menuScanCache = pgTable("menu_scan_cache", {
  id: serial("id").primaryKey(),
  venueId: integer("venue_id")
    .references(() => venues.id, { onDelete: "cascade" })
    .notNull(),
  /** ADR 0028 — optional menu-set scope; NULL keeps location-wide behaviour.
   *  Same-venue integrity enforced by composite FK in migration 0028. */
  menuSetId: integer("menu_set_id"),
  /** SHA-256 of file bytes, hex. 64 chars. */
  fileHash: varchar("file_hash", { length: 64 }).notNull(),
  /** "image/jpeg" | "image/png" | "application/pdf" | "text/html" */
  mimeType: text("mime_type").notNull(),
  resultJson: jsonb("result_json")
    .$type<{
      categories: Array<Record<string, unknown>>;
      packages: Array<Record<string, unknown>>;
    }>()
    .notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ═══════════════════════════════════════════════════════
// CALENDAR
// ═══════════════════════════════════════════════════════

export const calendarEvents = pgTable("calendar_events", {
  id: serial("id").primaryKey(),
  entityType: entityTypeEnum("entity_type").notNull(),
  entityId: integer("entity_id").notNull(),
  date: date("date").notNull(),
  status: calendarStatusEnum("status").default("available").notNull(),
  bookingId: integer("booking_id"),
  hallId: integer("hall_id"),
  note: text("note"),
  /** F-S6 — Event type for color coding on the owner dashboard calendar.
   *  Free-form string (e.g. "nunta", "cumetrie", "corporate") so new types
   *  can be introduced without a schema migration. Null = uncategorized. */
  eventType: text("event_type"),
  startTime: text("start_time"), // "14:00" — null means full day
  endTime: text("end_time"), // "18:00"
  source: calendarSourceEnum("source").default("manual").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("idx_cal_entity_date").on(t.entityType, t.entityId, t.date),
  index("idx_cal_entity_type_date_status").on(t.entityType, t.date, t.status),
  index("idx_cal_booking").on(t.bookingId),
  index("idx_cal_hall").on(t.hallId),
  /**
   * One calendar projection per booking. NULL booking_id (manual/legacy rows)
   * remains allowed — PostgreSQL unique indexes treat NULL as distinct.
   * Authoritative SQL: 0029 `calendar_events_booking_id_unique`.
   */
  uniqueIndex("calendar_events_booking_id_unique").on(t.bookingId),
  /**
   * Composite FK (hall_id, entity_id) → venue_halls(id, venue_id).
   * Do NOT set onDelete() here: Drizzle would apply SET NULL to BOTH columns
   * and wipe entity_id. Authoritative SQL is 0029:
   *   PG15+  ON DELETE SET NULL (hall_id)
   *   PG<15  ON DELETE RESTRICT (archive the hall instead).
   * booking_id FK is calendar_events_booking_fk in 0029 (ON DELETE SET NULL).
   * It is not declared here because `bookingRequests` is defined below.
   */
  foreignKey({
    name: "calendar_events_hall_venue_fk",
    columns: [t.hallId, t.entityId],
    foreignColumns: [venueHalls.id, venueHalls.venueId],
  }),
  check(
    "calendar_events_hall_requires_venue_entity_chk",
    sql`${t.hallId} IS NULL OR ${t.entityType} = 'venue'`,
  ),
]);

// ═══════════════════════════════════════════════════════
// LEADS & BOOKINGS
// ═══════════════════════════════════════════════════════

export const leads = pgTable("leads", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  phonePrefix: varchar("phone_prefix", { length: 5 }).default("+373"),
  email: text("email"),
  eventType: text("event_type"),
  eventDate: date("event_date"),
  location: text("location"),
  guestCount: integer("guest_count"),
  budget: integer("budget"),
  message: text("message"),
  source: leadSourceEnum("source").default("form").notNull(),
  status: leadStatusEnum("status").default("new").notNull(),
  assignedTo: uuid("assigned_to").references(() => users.id, {
    onDelete: "set null",
  }),
  score: integer("score").default(0),
  /** M9 Intern #2 — AI-generated quality score 0-100 with short rationale list. */
  aiScore: integer("ai_score"),
  aiReasons: jsonb("ai_reasons"),
  wizardData: jsonb("wizard_data"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const bookings = pgTable("bookings", {
  id: serial("id").primaryKey(),
  leadId: integer("lead_id").references(() => leads.id, {
    onDelete: "set null",
  }),
  artistId: integer("artist_id").references(() => artists.id, {
    onDelete: "set null",
  }),
  venueId: integer("venue_id").references(() => venues.id, {
    onDelete: "set null",
  }),
  eventDate: date("event_date"),
  eventType: text("event_type"),
  status: bookingStatusEnum("status").default("pending").notNull(),
  priceAgreed: integer("price_agreed"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const leadActivities = pgTable("lead_activities", {
  id: serial("id").primaryKey(),
  leadId: integer("lead_id")
    .references(() => leads.id, { onDelete: "cascade" })
    .notNull(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  type: leadActivityTypeEnum("type").notNull(),
  content: text("content"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ═══════════════════════════════════════════════════════
// REVIEWS
// ═══════════════════════════════════════════════════════

export const reviews = pgTable("reviews", {
  id: serial("id").primaryKey(),
  artistId: integer("artist_id").references(() => artists.id, {
    onDelete: "cascade",
  }),
  venueId: integer("venue_id").references(() => venues.id, {
    onDelete: "cascade",
  }),
  /** ADR 0028 — optional hall context for the reviewed booking. Review stays
   *  at venue level; this only enriches per-hall aggregation. Same-venue
   *  composite FK is defined in migration 0028 (authoritative). */
  hallId: integer("hall_id"),
  /** M4 — FK to the booking the review is written for. Lets us enforce
   *  "one review per completed booking" and prove the author actually
   *  transacted with this vendor (Trustpilot-style verification). */
  bookingRequestId: integer("booking_request_id").unique(),
  /** M4 — The client's internal user id (when signed in through Clerk). */
  authorUserId: uuid("author_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  authorName: text("author_name").notNull(),
  eventType: text("event_type"),
  eventDate: date("event_date"),
  rating: integer("rating").notNull(),
  text: text("text"),
  reply: text("reply"),
  replyAt: timestamp("reply_at"),
  isApproved: boolean("is_approved").default(false).notNull(),
  /** M-UGC — up to 5 photo URLs uploaded with the review. Stored as a
   *  JSONB array of strings so adding/removing one doesn't require a
   *  separate table. Empty array = text-only review. */
  photos: jsonb("photos").$type<string[]>().default([]).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  /**
   * Composite FK — do NOT set onDelete() here. Authoritative SQL is 0028:
   * PG15+ SET NULL (hall_id) / PG<15 RESTRICT. venue_id must never be nulled.
   */
  foreignKey({
    name: "reviews_hall_venue_fk",
    columns: [t.hallId, t.venueId],
    foreignColumns: [venueHalls.id, venueHalls.venueId],
  }),
  check("reviews_hall_requires_venue_chk", sql`${t.hallId} IS NULL OR ${t.venueId} IS NOT NULL`),
]);

// ═══════════════════════════════════════════════════════
// BLOG
// ═══════════════════════════════════════════════════════

export const blogPosts = pgTable("blog_posts", {
  id: serial("id").primaryKey(),
  titleRo: text("title_ro").notNull(),
  titleRu: text("title_ru"),
  titleEn: text("title_en"),
  slug: text("slug").unique().notNull(),
  contentRo: text("content_ro"),
  contentRu: text("content_ru"),
  contentEn: text("content_en"),
  excerptRo: text("excerpt_ro"),
  excerptRu: text("excerpt_ru"),
  excerptEn: text("excerpt_en"),
  coverImageUrl: text("cover_image_url"),
  category: text("category"),
  tags: text("tags").array(),
  authorId: uuid("author_id").references(() => users.id, {
    onDelete: "set null",
  }),
  status: blogStatusEnum("status").default("draft").notNull(),
  publishedAt: timestamp("published_at"),
  seoTitleRo: text("seo_title_ro"),
  seoTitleRu: text("seo_title_ru"),
  seoTitleEn: text("seo_title_en"),
  seoDescRo: text("seo_desc_ro"),
  seoDescRu: text("seo_desc_ru"),
  seoDescEn: text("seo_desc_en"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ═══════════════════════════════════════════════════════
// PAGES
// ═══════════════════════════════════════════════════════

export const pages = pgTable("pages", {
  id: serial("id").primaryKey(),
  slug: text("slug").unique().notNull(),
  titleRo: text("title_ro").notNull(),
  titleRu: text("title_ru"),
  titleEn: text("title_en"),
  contentRo: text("content_ro"),
  contentRu: text("content_ru"),
  contentEn: text("content_en"),
  isSystem: boolean("is_system").default(false).notNull(),
  seoTitleRo: text("seo_title_ro"),
  seoTitleRu: text("seo_title_ru"),
  seoTitleEn: text("seo_title_en"),
  seoDescRo: text("seo_desc_ro"),
  seoDescRu: text("seo_desc_ru"),
  seoDescEn: text("seo_desc_en"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ═══════════════════════════════════════════════════════
// PAGE META — admin-editable SEO overrides for routes that don't have
// their own DB-backed entity (homepage, /artisti, /sali, /calculatoare,
// individual calculators, etc.). Keyed by URL path. Empty title/description
// fall back to whatever each page.tsx hardcodes in generateMeta().
// ═══════════════════════════════════════════════════════

export const pageMeta = pgTable("page_meta", {
  id: serial("id").primaryKey(),
  /** URL path the meta applies to. e.g. "/" or "/calculatoare/buget". */
  path: text("path").unique().notNull(),
  /** Human-readable label shown in /admin/meta. */
  label: text("label").notNull(),
  /** Optional override of <title>. Empty → page falls back to hardcoded. */
  title: text("title"),
  /** Optional override of meta description. Same fallback behavior. */
  description: text("description"),
  /** Group bucket in the admin UI (e.g. "pages", "tools"). */
  groupName: text("group_name"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ═══════════════════════════════════════════════════════
// SITE SETTINGS & HOMEPAGE
// ═══════════════════════════════════════════════════════

export const siteSettings = pgTable("site_settings", {
  id: serial("id").primaryKey(),
  key: text("key").unique().notNull(),
  value: jsonb("value"),
});

export const homepageSections = pgTable("homepage_sections", {
  id: serial("id").primaryKey(),
  type: homepageSectionTypeEnum("type").notNull(),
  config: jsonb("config"),
  sortOrder: integer("sort_order").default(0),
  isVisible: boolean("is_visible").default(true).notNull(),
});

// ═══════════════════════════════════════════════════════
// REDIRECTS
// ═══════════════════════════════════════════════════════

export const redirects = pgTable("redirects", {
  id: serial("id").primaryKey(),
  fromPath: text("from_path").notNull(),
  toPath: text("to_path").notNull(),
  statusCode: redirectStatusEnum("status_code").default("301").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ═══════════════════════════════════════════════════════
// IMPORT
// ═══════════════════════════════════════════════════════

export const importBatches = pgTable("import_batches", {
  id: serial("id").primaryKey(),
  filename: text("filename").notNull(),
  type: text("type").notNull(), // "artists" | "venues"
  status: importStatusEnum("status").default("pending").notNull(),
  totalRows: integer("total_rows").default(0),
  processedRows: integer("processed_rows").default(0),
  errorLog: jsonb("error_log"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ═══════════════════════════════════════════════════════
// AI & NOTIFICATIONS
// ═══════════════════════════════════════════════════════

export const aiConversations = pgTable("ai_conversations", {
  id: serial("id").primaryKey(),
  userId: uuid("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  context: text("context").notNull(), // "admin" | "vendor"
  messages: jsonb("messages").$type<
    { role: "user" | "assistant"; content: string; timestamp: string }[]
  >(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: uuid("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  type: text("type").notNull(),
  title: text("title").notNull(),
  message: text("message"),
  isRead: boolean("is_read").default(false).notNull(),
  actionUrl: text("action_url"),
  /** Durable idempotency key. Authoritative unique index: 0030. */
  dedupeKey: text("dedupe_key"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("idx_notif_user_read").on(t.userId, t.isRead),
  index("idx_notif_user_created").on(t.userId, t.createdAt),
  uniqueIndex("notifications_user_dedupe_unique")
    .on(t.userId, t.dedupeKey)
    .where(sql`${t.dedupeKey} IS NOT NULL`),
]);

// ═══════════════════════════════════════════════════════
// WISHLIST — users save artists / venues to revisit later.
// Composite primary key (userId, entityType, entityId) so the same
// user can't add the same item twice, and we get a free index.
// ═══════════════════════════════════════════════════════

export const wishlistEntityType = pgEnum("wishlist_entity_type", [
  "artist",
  "venue",
]);

// ═══════════════════════════════════════════════════════
// ADMIN AUDIT LOG — every sensitive admin action (bulk delete, approve
// registration, override booking status) writes a row here. Keep the
// shape flexible via metadata JSONB so new actions don't require a
// migration. Pruning strategy: none for now — log growth is slow.
// ═══════════════════════════════════════════════════════

export const adminAuditLog = pgTable(
  "admin_audit_log",
  {
    id: serial("id").primaryKey(),
    adminUserId: uuid("admin_user_id")
      .references(() => users.id, { onDelete: "set null" })
      .notNull(),
    action: text("action").notNull(), // e.g. "bulk.deactivate", "registration.approve"
    entity: text("entity"),           // "artist", "venue", "lead", ...
    entityIds: jsonb("entity_ids").$type<number[]>().default([]),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_audit_created").on(t.createdAt),
    index("idx_audit_admin_created").on(t.adminUserId, t.createdAt),
  ],
);

// ═══════════════════════════════════════════════════════
// PUSH SUBSCRIPTIONS — Web Push (VAPID). One user can have multiple
// subscriptions (e.g. their phone + desktop browser); each browser
// gives a unique endpoint URL. Endpoint is the PK so re-subscribes
// are idempotent.
// ═══════════════════════════════════════════════════════

export const pushSubscriptions = pgTable("push_subscriptions", {
  endpoint: text("endpoint").primaryKey(),
  userId: uuid("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastUsedAt: timestamp("last_used_at"),
}, (t) => [index("idx_push_sub_user").on(t.userId)]);

export const wishlistItems = pgTable(
  "wishlist_items",
  {
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    entityType: wishlistEntityType("entity_type").notNull(),
    entityId: integer("entity_id").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.entityType, t.entityId] }),
    index("idx_wishlist_user").on(t.userId),
  ],
);

// ═══════════════════════════════════════════════════════
// WORK SCHEDULE (artist working hours)
// ═══════════════════════════════════════════════════════

export const workSchedule = pgTable("work_schedule", {
  id: serial("id").primaryKey(),
  artistId: integer("artist_id")
    .references(() => artists.id, { onDelete: "cascade" })
    .notNull(),
  dayOfWeek: integer("day_of_week").notNull(), // 0=Mon, 6=Sun
  startTime: text("start_time").notNull(), // "09:00"
  endTime: text("end_time").notNull(), // "18:00"
  isWorking: boolean("is_working").default(true).notNull(),
});

// ═══════════════════════════════════════════════════════
// BOOKING REQUESTS (client → artist)
// ═══════════════════════════════════════════════════════

// Bilateral confirmation flow (M0b #9):
//   pending              – client has submitted, artist has not replied yet
//   accepted             – artist accepted, waiting for client to confirm
//   confirmed_by_client  – both parties confirmed, booking is live
//   rejected             – artist declined the request
//   cancelled            – client or admin cancelled the request
export const bookingRequestStatusEnum = pgEnum("booking_request_status", [
  "pending",
  "accepted",
  "confirmed_by_client",
  "rejected",
  "cancelled",
  "completed",
  // Auto-set by the `expire-pending-bookings-48h` Inngest cron when a
  // pending booking sits unanswered for 48h. Terminal state.
  "expired",
]);

/**
 * Platform service fee ("remunerație de serviciu") owed by a vendor for a
 * confirmed booking. Per the Legal Pack v1.0:
 *   - Partners (artists): flat 5% of the confirmed order value
 *     (Partner Agreement §11.1, Tariffs §2).
 *   - Venues: agreed separately, tiered by guest count. The actual rates are
 *     NOT fixed in the legal pack (Tariffs §4 — "aprobată separat"), so they
 *     live in site_settings under `commission_rules` and are editable by an
 *     admin instead of being hardcoded here.
 * Settlement is manual: an admin marks a row paid once the money arrives.
 */
/**
 * Electronic acceptance of a legal document ("semnătură electronică").
 *
 * Venue Agreement, Anexa 2 requires the system to fix: the entity and
 * representative identity, the document version, date/time, email/phone
 * confirmation, IP and user-agent, plus an UNMODIFIABLE audit record.
 *
 * That last requirement is real only because of
 * `migrations/manual/0017_legal_acceptances_evidence.sql`, which installs a
 * BEFORE UPDATE OR DELETE trigger:
 *   - every DELETE is rejected;
 *   - every UPDATE is rejected except clearing a linkage column that a
 *     parent row's deletion nulls out, and setting artist_id / venue_id once
 *     (NULL → id) when the vendor profile is created right after signing.
 *
 * `userId` is deliberately NOT `cascade`: erasing the account must not erase
 * the proof that a contract was signed. The row carries its own copy of the
 * signer's name, e-mail, phone, signature, IP and content hash, so it stands
 * on its own once the user is gone.
 */
export const legalAcceptances = pgTable(
  "legal_acceptances",
  {
    id: serial("id").primaryKey(),
    /** Nullable on purpose — see the note above: the evidence outlives the account. */
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    /** "artist" | "venue" — who the representative signed for. */
    subjectType: text("subject_type").notNull(),
    artistId: integer("artist_id").references(() => artists.id, { onDelete: "set null" }),
    venueId: integer("venue_id").references(() => venues.id, { onDelete: "set null" }),
    /** ADR 0028 — legal holder for organization-level acceptances. May be set
     *  once (NULL → id); the append-only trigger forbids swapping/clearing. */
    organizationId: integer("organization_id").references(
      () => partnerOrganizations.id,
      { onDelete: "set null" },
    ),

    documentSlug: text("document_slug").notNull(),
    documentVersion: text("document_version").notNull(),
    packVersion: text("pack_version").notNull(),
    /** Groups every document of one signing attempt. Authoritative: 0030. */
    acceptanceSessionId: uuid("acceptance_session_id")
      .notNull()
      .default(sql`gen_random_uuid()`),
    locale: text("locale").notNull(),

    /** Typed full name of the signing representative. */
    signatureName: text("signature_name").notNull(),
    /** Handwritten signature drawn with mouse/finger, as a PNG data URL. */
    signatureImage: text("signature_image"),
    representativeRole: text("representative_role"),
    /** Title of the document as shown, in the locale it was shown in. */
    documentTitle: text("document_title"),
    /**
     * The exact blocks the signer saw, annex included, frozen at signing.
     * `documents.json` keeps one version per slug, so without this the wording
     * a person agreed to disappears the moment the document is superseded.
     */
    documentBlocks: jsonb("document_blocks").$type<
      { type: string; text: string }[]
    >(),
    /** Readable device/browser, derived from the user agent at signing time. */
    deviceSummary: text("device_summary"),

      /** Which §5 subsection governs this partner: individual | sole_trader |
   *  company. Decides which of the fields below the contract requires. */
  partnerType: text("partner_type"),
  /** Official name of the bound party — the person's full legal name, or the
   *  registered name of the sole trader or company. */
  legalName: text("legal_name"),
  /** IDNP for an individual, IDNO for a sole trader or a company. */
  idNumber: text("id_number"),
  /** Registered address / domicile, as it appears in the contract. */
  legalAddress: text("legal_address"),
  /** Who signs on behalf of the entity, when that is not the partner. */
  representativeName: text("representative_name"),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }).defaultNow().notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    email: text("email"),
    phone: text("phone"),
    /** Fingerprint of the exact text accepted, so drift is detectable. */
    contentHash: text("content_hash"),
  },
  (t) => [
    // Session-scoped uniqueness (0030). An incomplete session remains
    // append-only; recovery writes a separate complete signing session.
    uniqueIndex("legal_acceptances_unique")
      .on(t.userId, t.subjectType, t.packVersion, t.acceptanceSessionId, t.documentSlug)
      .where(sql`${t.organizationId} IS NULL`),
    index("legal_acceptances_user_idx").on(t.userId),
    uniqueIndex("legal_acceptances_org_unique")
      .on(t.organizationId, t.subjectType, t.packVersion, t.acceptanceSessionId, t.documentSlug)
      .where(sql`${t.organizationId} IS NOT NULL`),
    uniqueIndex("legal_acceptances_session_document_unique")
      .on(t.acceptanceSessionId, t.documentSlug),
    uniqueIndex("legal_acceptances_id_session_unique")
      .on(t.id, t.acceptanceSessionId),
    index("legal_acceptances_organization_idx").on(t.organizationId),
    index("legal_acceptances_session_idx").on(t.acceptanceSessionId),
    check(
      "legal_acceptances_org_subject_chk",
      sql`${t.organizationId} IS NULL OR ${t.subjectType} = 'venue'`,
    ),
    check(
      "legal_acceptances_org_profile_scope_chk",
      sql`${t.organizationId} IS NULL OR (${t.artistId} IS NULL AND ${t.venueId} IS NULL)`,
    ),
  ],
);

/**
 * Durable per-recipient retry state for complete PDF contract delivery. The
 * signed evidence and every signer/admin delivery are created in one database
 * transaction. Resend receives stable idempotency keys per recipient/channel.
 * Authoritative SQL: 0030.
 */
export const legalContractDeliveryOutbox = pgTable(
  "legal_contract_delivery_outbox",
  {
    id: serial("id").primaryKey(),
    acceptanceSessionId: uuid("acceptance_session_id").notNull(),
    anchorAcceptanceId: integer("anchor_acceptance_id")
      .notNull(),
    channel: text("channel").notNull(),
    recipientKey: text("recipient_key").notNull(),
    recipientEmail: text("recipient_email").notNull(),
    status: text("status").default("pending").notNull(),
    attempts: integer("attempts").default(0).notNull(),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).defaultNow().notNull(),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    /** Random ownership token; a stale worker cannot clear a newer lease. */
    leaseToken: uuid("lease_token"),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    deadLetteredAt: timestamp("dead_lettered_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    unique("legal_contract_delivery_recipient_unique").on(
      t.acceptanceSessionId,
      t.channel,
      t.recipientKey,
    ),
    index("legal_contract_delivery_pending_idx")
      .on(t.nextAttemptAt, t.createdAt)
      .where(sql`${t.deliveredAt} IS NULL AND ${t.deadLetteredAt} IS NULL`),
    index("legal_contract_delivery_session_idx").on(t.acceptanceSessionId),
    check(
      "legal_contract_delivery_status_chk",
      sql`${t.status} IN ('pending', 'processing', 'delivered', 'failed', 'dead_letter')`,
    ),
    check(
      "legal_contract_delivery_channel_chk",
      sql`${t.channel} IN ('signer', 'admin')`,
    ),
    foreignKey({
      name: "legal_contract_delivery_anchor_session_fk",
      columns: [t.anchorAcceptanceId, t.acceptanceSessionId],
      foreignColumns: [legalAcceptances.id, legalAcceptances.acceptanceSessionId],
    }).onDelete("restrict"),
  ],
);

export const commissionStatusEnum = pgEnum("commission_status", [
  /** Owed, not yet settled. */
  "pending",
  /** Invoice issued, awaiting payment. */
  "invoiced",
  /** Settled — admin confirmed receipt. */
  "paid",
  /** Dropped (event did not happen, recalculation per Tariffs §10). */
  "cancelled",
  /** Deliberately not charged (promo, individual terms — Tariffs §13). */
  "waived",
]);

export const commissions = pgTable(
  "commissions",
  {
    id: serial("id").primaryKey(),
    /** One commission per booking. ADR 0028 #6 — RESTRICT (not cascade): a
     *  booking with a commission cannot be deleted, so financial evidence is
     *  never destroyed. Archive the booking instead. */
    bookingRequestId: integer("booking_request_id")
      .notNull()
      .references(() => bookingRequests.id, { onDelete: "restrict" }),
    /** Which side of the marketplace owes it. */
    vendorType: text("vendor_type").notNull(), // "artist" | "venue"
    // ADR 0028 #6 — SET NULL (not cascade): keep the commission if the
    // artist/venue row is removed; names are snapshotted below.
    artistId: integer("artist_id").references(() => artists.id, { onDelete: "set null" }),
    venueId: integer("venue_id").references(() => venues.id, { onDelete: "set null" }),
    /** ADR 0028 — hall context for per-hall reporting. Same-venue composite FK
     *  (hall_id, venue_id) with ON DELETE SET NULL (hall_id) is defined in
     *  migration 0028 (authoritative); never deletes financial evidence. */
    hallId: integer("hall_id"),
    /** Snapshots so reports survive hall/venue deletion. */
    hallNameSnapshot: text("hall_name_snapshot"),
    venueNameSnapshot: text("venue_name_snapshot"),

    /** Order value the fee was computed from, in minor-unit-free integers. */
    baseAmount: integer("base_amount").notNull(),
    currency: varchar("currency", { length: 3 }).default("EUR").notNull(),
    /** Rate in basis points (500 = 5%). Null when a flat fee was applied. */
    rateBps: integer("rate_bps"),
    /** The fee itself, same currency as baseAmount. */
    amount: numeric("amount", { precision: 12, scale: 2, mode: "number" }).notNull(),
    /** Snapshot for audit — venue tiers depend on it and it can change later. */
    guestCount: integer("guest_count"),
    /** Which rule produced this row: artist_flat | venue_below | venue_above. */
    tier: text("tier"),

    status: commissionStatusEnum("status").default("pending").notNull(),
    /** Tariffs §7 — 10 calendar days from notice unless agreed otherwise. */
    dueDate: date("due_date"),

    paidAt: timestamp("paid_at"),
    /** Admin who recorded the manual settlement. */
    paidBy: uuid("paid_by").references(() => users.id, { onDelete: "set null" }),
    paymentMethod: text("payment_method"),
    paymentNote: text("payment_note"),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("commissions_booking_unique").on(t.bookingRequestId),
    index("commissions_status_idx").on(t.status),
    index("commissions_artist_idx").on(t.artistId),
    index("commissions_venue_idx").on(t.venueId),
    index("commissions_hall_idx").on(t.hallId),
    /**
     * Composite FK — do NOT set onDelete() here. Authoritative SQL is 0028:
     * PG15+ SET NULL (hall_id) / PG<15 RESTRICT. venue_id must never be nulled.
     */
    foreignKey({
      name: "commissions_hall_venue_fk",
      columns: [t.hallId, t.venueId],
      foreignColumns: [venueHalls.id, venueHalls.venueId],
    }),
    check("commissions_hall_requires_venue_chk", sql`${t.hallId} IS NULL OR ${t.venueId} IS NOT NULL`),
  ],
);

export const bookingPaidStatusEnum = pgEnum("booking_paid_status", [
  "unpaid",
  "partial",
  "paid",
]);

/**
 * Price offer entry stored inside `bookingRequests.priceOffers` (jsonb array).
 * Each entry represents a proposal from either side during negotiation.
 */
export type BookingPriceOffer = {
  from: "artist" | "client";
  amount: number; // EUR
  message?: string;
  at: string; // ISO timestamp
};

export const bookingRequests = pgTable("booking_requests", {
  id: serial("id").primaryKey(),
  /** Either artistId OR venueId is set — a booking targets one entity. */
  artistId: integer("artist_id"),
  /** Historical display identity retained after an artist profile is deleted. */
  artistNameSnapshot: text("artist_name_snapshot"),
  venueId: integer("venue_id")
    .references(() => venues.id, { onDelete: "set null" }),
  /** ADR 0028 — concrete hall for venue bookings. Nullable in the expand
   *  phase; required for new venue bookings once MULTI_HALL is enabled.
   *  Composite FK below guarantees the hall belongs to `venueId`. */
  hallId: integer("hall_id"),
  /** `hall` = only this hall is occupied; `venue` = the whole location is
   *  closed for the interval. */
  reservationScope: reservationScopeEnum("reservation_scope"),
  /** Canonical interval (tz-aware). Legacy event_date/start_time/end_time are
   *  kept for compatibility during the transition. */
  startsAt: timestamp("starts_at", { withTimezone: true }),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  timezone: text("timezone"),
  agreedCurrency: varchar("agreed_currency", { length: 3 }),
  /** Immutable commercial snapshot frozen at confirmation (org/venue/hall,
   *  pricing model, agreed price, deposit, package, terms). */
  commercialSnapshot: jsonb("commercial_snapshot").$type<Record<string, unknown>>(),
  /** Optional link to the client's event plan so artist bookings show up in
   *  that plan's "Rezervări Artiști" tab and feed the budget. */
  eventPlanId: integer("event_plan_id")
    .references(() => eventPlans.id, { onDelete: "set null" }),
  // CP3 #3 — SET NULL (not cascade): deleting a client anonymizes the booking
  // and keeps it (and its commission) as financial evidence.
  clientUserId: uuid("client_user_id")
    .references(() => users.id, { onDelete: "set null" }),
  clientName: text("client_name").notNull(),
  clientPhone: text("client_phone").notNull(),
  clientEmail: text("client_email"),
  eventDate: date("event_date").notNull(),
  startTime: text("start_time"), // "14:00"
  endTime: text("end_time"), // "18:00"
  eventType: text("event_type"),
  guestCount: integer("guest_count"),
  message: text("message"),
  status: bookingRequestStatusEnum("status").default("pending").notNull(),
  /** Final negotiated price in EUR. Set when the artist posts their
   *  accepted offer. Feeds the event plan budget. */
  agreedPrice: integer("agreed_price"),
  paidStatus: bookingPaidStatusEnum("paid_status").default("unpaid").notNull(),
  /** Full history of price proposals between client and artist. */
  priceOffers: jsonb("price_offers").$type<BookingPriceOffer[]>().default([]),
  artistReply: text("artist_reply"),
  adminNotes: text("admin_notes"),
  adminSeen: boolean("admin_seen").default(false).notNull(),
  /** E-signature: the typed-name / drawn-signature base64 captured when the
   *  client signs the contract. Empty = not signed yet. */
  clientSignature: text("client_signature"),
  clientSignedAt: timestamp("client_signed_at"),
  /** Client accepted the venue offer; a venue must still confirm afterwards. */
  clientConfirmedAt: timestamp("client_confirmed_at", { withTimezone: true }),
  /** Final bilateral confirmation, used as the fee's due-date origin. */
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  /** Generated PDF URL (Vercel Blob) with both parties' details + signature. */
  contractPdfUrl: text("contract_pdf_url"),
  /** Who created the row.
   *   "client"  — standard client-submitted request (default)
   *   "manual"  — artist added it directly on the calendar (private block
   *                with a note and preset duration/price from their tarife) */
  source: text("source").default("client").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("idx_booking_artist_status").on(t.artistId, t.status),
  index("idx_booking_client_user").on(t.clientUserId),
  index("idx_booking_event_plan").on(t.eventPlanId),
  index("booking_requests_hall_idx").on(t.hallId),
  foreignKey({
    name: "booking_requests_artist_fk",
    columns: [t.artistId],
    foreignColumns: [artists.id],
  }).onDelete("set null"),
  /**
   * Composite FK — do NOT set onDelete() here. Authoritative SQL is 0028:
   * PG15+ SET NULL (hall_id) / PG<15 RESTRICT. venue_id must never be nulled.
   */
  foreignKey({
    name: "booking_requests_hall_venue_fk",
    columns: [t.hallId, t.venueId],
    foreignColumns: [venueHalls.id, venueHalls.venueId],
  }),
  check("booking_requests_hall_requires_venue_chk", sql`${t.hallId} IS NULL OR ${t.venueId} IS NOT NULL`),
]);

export type BookingEffectStatus =
  | "pending"
  | "processing"
  | "failed"
  | "delivered"
  | "cancelled"
  | "dead_letter";
export type BookingEffectDeliveryStatus = BookingEffectStatus | "dispatching";
export type BookingEffectStepStatus =
  | "pending"
  | "failed"
  | "delivered"
  | "dead_letter";
export type BookingEffectChannel = "in_app" | "push" | "whatsapp" | "email";

/**
 * Durable external effects for a booking (emails / push / in-app notify).
 *
 * The row is inserted in the same transaction as the confirmation. Workers
 * claim it with a renewable lease and only mark it delivered after every
 * channel has returned successfully. Authoritative SQL: 0030 + 0031.
 */
export const bookingEffectOutbox = pgTable(
  "booking_effect_outbox",
  {
    id: serial("id").primaryKey(),
    // Confirmation delivery is evidence. A booking must be archived/cancelled,
    // never deleted out from underneath a still-retryable external effect.
    bookingId: integer("booking_id").notNull(),
    effectKey: text("effect_key").notNull(),
    status: text("status")
      .$type<BookingEffectStatus>()
      .default("pending")
      .notNull(),
    attempts: integer("attempts").default(0).notNull(),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    referralStatus: text("referral_status")
      .$type<BookingEffectStepStatus>()
      .default("pending")
      .notNull(),
    referralAttempts: integer("referral_attempts").default(0).notNull(),
    referralNextAttemptAt: timestamp("referral_next_attempt_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    referralLastError: text("referral_last_error"),
    materializationStatus: text("materialization_status")
      .$type<BookingEffectStepStatus>()
      .default("pending")
      .notNull(),
    materializationAttempts: integer("materialization_attempts").default(0).notNull(),
    materializationNextAttemptAt: timestamp("materialization_next_attempt_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    materializationLastError: text("materialization_last_error"),
    leaseToken: uuid("lease_token"),
    leaseUntil: timestamp("lease_until", { withTimezone: true }),
    lastError: text("last_error"),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    alertedAt: timestamp("alerted_at", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolutionNote: text("resolution_note"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    foreignKey({
      name: "booking_effect_outbox_booking_fk",
      columns: [t.bookingId],
      foreignColumns: [bookingRequests.id],
    }).onDelete("restrict"),
    unique("booking_effect_outbox_booking_key_unique").on(t.bookingId, t.effectKey),
    index("booking_effect_outbox_due_idx").on(
      t.effectKey,
      t.status,
      t.nextAttemptAt,
      t.id,
    ).where(sql`${t.status} IN ('pending', 'failed')`),
    index("booking_effect_outbox_expired_lease_idx")
      .on(t.effectKey, t.leaseUntil, t.id)
      .where(sql`${t.status} = 'processing'`),
    check(
      "booking_effect_outbox_status_chk",
      sql`${t.status} IN ('pending', 'processing', 'failed', 'delivered', 'cancelled', 'dead_letter')`,
    ),
    check("booking_effect_outbox_attempts_chk", sql`${t.attempts} >= 0`),
    check(
      "booking_effect_outbox_step_status_chk",
      sql`${t.referralStatus} IN ('pending', 'failed', 'delivered', 'dead_letter') AND ${t.materializationStatus} IN ('pending', 'failed', 'delivered', 'dead_letter')`,
    ),
    check(
      "booking_effect_outbox_step_attempts_chk",
      sql`${t.referralAttempts} >= 0 AND ${t.materializationAttempts} >= 0`,
    ),
    check(
      "booking_effect_outbox_state_chk",
      sql`(
        (${t.status} = 'processing' AND ${t.leaseToken} IS NOT NULL AND ${t.leaseUntil} IS NOT NULL AND ${t.deliveredAt} IS NULL)
        OR (${t.status} = 'delivered' AND ${t.deliveredAt} IS NOT NULL AND ${t.leaseToken} IS NULL AND ${t.leaseUntil} IS NULL)
        OR (${t.status} IN ('pending', 'failed', 'cancelled', 'dead_letter') AND ${t.deliveredAt} IS NULL AND ${t.leaseToken} IS NULL AND ${t.leaseUntil} IS NULL)
      )`,
    ),
  ],
);

/**
 * Per-recipient/per-channel delivery state for a booking effect.
 *
 * The immutable payload makes a retry independent from mutable presentation
 * copy. External channels are at-least-once; the in-app channel additionally
 * uses notifications.dedupe_key for exactly-once database insertion.
 */
export const bookingEffectDeliveries = pgTable(
  "booking_effect_deliveries",
  {
    id: serial("id").primaryKey(),
    effectId: integer("effect_id").notNull(),
    // Deliberately not an FK: deleting/anonymising a user must not erase the
    // delivery audit row. Unavailable recipients naturally dead-letter.
    recipientUserId: uuid("recipient_user_id").notNull(),
    channel: text("channel").$type<BookingEffectChannel>().notNull(),
    dedupeKey: text("dedupe_key").notNull(),
    payload: jsonb("payload")
      .$type<{
        userId: string;
        type: string;
        title: string;
        message?: string;
        actionUrl?: string;
        email?: string;
        emailSubject?: string;
        emailHtml?: string;
        dedupeKey: string;
      }>()
      .notNull(),
    status: text("status")
      .$type<BookingEffectDeliveryStatus>()
      .default("pending")
      .notNull(),
    attempts: integer("attempts").default(0).notNull(),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    leaseToken: uuid("lease_token"),
    leaseUntil: timestamp("lease_until", { withTimezone: true }),
    dispatchStartedAt: timestamp("dispatch_started_at", { withTimezone: true }),
    cancelRequestedAt: timestamp("cancel_requested_at", { withTimezone: true }),
    lastError: text("last_error"),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    foreignKey({
      name: "booking_effect_deliveries_effect_fk",
      columns: [t.effectId],
      foreignColumns: [bookingEffectOutbox.id],
    }).onDelete("restrict"),
    unique("booking_effect_deliveries_effect_recipient_channel_unique").on(
      t.effectId,
      t.recipientUserId,
      t.channel,
    ),
    unique("booking_effect_deliveries_dedupe_unique").on(t.dedupeKey),
    index("booking_effect_deliveries_due_idx").on(
      t.status,
      t.nextAttemptAt,
      t.id,
    ).where(sql`${t.status} IN ('pending', 'failed')`),
    index("booking_effect_deliveries_expired_lease_idx")
      .on(t.leaseUntil, t.id)
      .where(sql`${t.status} IN ('processing', 'dispatching')`),
    check(
      "booking_effect_deliveries_channel_chk",
      sql`${t.channel} IN ('in_app', 'push', 'whatsapp', 'email')`,
    ),
    check(
      "booking_effect_deliveries_status_chk",
      sql`${t.status} IN ('pending', 'processing', 'dispatching', 'failed', 'delivered', 'cancelled', 'dead_letter')`,
    ),
    check("booking_effect_deliveries_attempts_chk", sql`${t.attempts} >= 0`),
    check(
      "booking_effect_deliveries_state_chk",
      sql`(
        (${t.status} = 'processing' AND ${t.leaseToken} IS NOT NULL AND ${t.leaseUntil} IS NOT NULL AND ${t.deliveredAt} IS NULL)
        OR (${t.status} = 'dispatching' AND ${t.leaseToken} IS NOT NULL AND ${t.leaseUntil} IS NOT NULL AND ${t.dispatchStartedAt} IS NOT NULL AND ${t.deliveredAt} IS NULL)
        OR (${t.status} = 'delivered' AND ${t.deliveredAt} IS NOT NULL AND ${t.leaseToken} IS NULL AND ${t.leaseUntil} IS NULL)
        OR (${t.status} IN ('pending', 'failed', 'cancelled', 'dead_letter') AND ${t.deliveredAt} IS NULL AND ${t.leaseToken} IS NULL AND ${t.leaseUntil} IS NULL)
      )`,
    ),
  ],
);

/**
 * Artist availability slots — granular "I'm free from 14:00 to 18:00 for
 * 150 EUR" records. Multiple slots per day are allowed (day gig + evening
 * gig can coexist with different prices). When a slot gets claimed by a
 * confirmed booking the `is_booked` flag flips and `booking_request_id`
 * links the claim, but we keep the row so the artist's timeline stays
 * auditable.
 */
export const artistAvailabilitySlots = pgTable("artist_availability_slots", {
  id: serial("id").primaryKey(),
  artistId: integer("artist_id")
    .references(() => artists.id, { onDelete: "cascade" })
    .notNull(),
  date: date("date").notNull(),
  /** "HH:MM" 24-hour — matches the same text format used by calendarEvents. */
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  /** Per-slot price in EUR. Optional; the client UI hides the number when
   *  null (e.g., "sell on request"). */
  price: integer("price"),
  note: text("note"),
  isBooked: boolean("is_booked").default(false).notNull(),
  /** When booked, tracks which request claimed the slot so we can release
   *  it automatically on cancel/reject. */
  bookingRequestId: integer("booking_request_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("idx_slot_artist_date").on(t.artistId, t.date),
  index("idx_slot_artist_booked").on(t.artistId, t.isBooked),
]);

// Phase 5 — venue_booking_requests legacy table dropped. Venue bookings
// now live in the unified booking_requests table (same as artists) with
// bookingRequests.venueId set. See src/lib/db/queries/venue-bookings.ts.

// ═══════════════════════════════════════════════════════
// CONVERSATIONS (M0b #10)
//
// Persistent 1-on-1 chat between a client and an artist that lives BEYOND the
// scope of a single booking request. A conversation is created the first time
// the client opens the chat widget on an artist profile — even before they
// send a booking. This lets the chat outlive the booking lifecycle (and
// rejected/cancelled bookings) while still being reusable across future
// requests between the same pair.
// ═══════════════════════════════════════════════════════

export const conversations = pgTable("conversations", {
  id: serial("id").primaryKey(),
  clientUserId: uuid("client_user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  /** Either artistId OR venueId is set — a conversation targets one vendor. */
  artistId: integer("artist_id")
    .references(() => artists.id, { onDelete: "cascade" }),
  venueId: integer("venue_id")
    .references(() => venues.id, { onDelete: "cascade" }),
  lastMessageAt: timestamp("last_message_at").defaultNow().notNull(),
  lastMessagePreview: text("last_message_preview"),
  clientUnread: integer("client_unread").default(0).notNull(),
  artistUnread: integer("artist_unread").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("idx_conv_client_artist").on(t.clientUserId, t.artistId),
  index("idx_conv_artist").on(t.artistId),
  index("idx_conv_client_venue").on(t.clientUserId, t.venueId),
  // Authoritative SQL: 0030 (DROP NOT NULL on artist_id + this CHECK).
  check("conversations_vendor_required_chk", sql`${t.artistId} IS NOT NULL OR ${t.venueId} IS NOT NULL`),
]);

// ═══════════════════════════════════════════════════════
// CHAT MESSAGES
// ═══════════════════════════════════════════════════════

export const chatMessages = pgTable("chat_messages", {
  id: serial("id").primaryKey(),
  // A message belongs to either a legacy booking request OR a persistent
  // conversation (preferred for new messages). Both columns are nullable and
  // we rely on application logic to ensure at least one is set.
  bookingRequestId: integer("booking_request_id")
    .references(() => bookingRequests.id, { onDelete: "cascade" }),
  conversationId: integer("conversation_id")
    .references(() => conversations.id, { onDelete: "cascade" }),
  senderType: text("sender_type").notNull(), // "client" | "artist" | "admin"
  senderName: text("sender_name").notNull(),
  message: text("message").notNull(),
  /** Optional file attachment. Single URL (Blob/R2 hosted). Content type
   *  inferred from the extension on the client when rendering. */
  attachmentUrl: text("attachment_url"),
  attachmentName: text("attachment_name"),
  attachmentMime: text("attachment_mime"),
  isRead: boolean("is_read").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("idx_chat_booking").on(t.bookingRequestId),
  index("idx_chat_conversation").on(t.conversationId, t.createdAt),
]);

// ═══════════════════════════════════════════════════════
// EVENT PLANNING SUITE (M4)
//
// A signed-in client can manage their event end-to-end: planning checklist,
// guest list (RSVP tracking), seating chart (drag guests onto tables), and
// user-generated content (photo uploads + post-event reviews). Every row is
// scoped to a single event_plan owned by a user.
// ═══════════════════════════════════════════════════════

export const rsvpStatusEnum = pgEnum("rsvp_status", [
  "pending",
  "accepted",
  "declined",
  "maybe",
]);

export const checklistPriorityEnum = pgEnum("checklist_priority", [
  "low",
  "medium",
  "high",
]);

/**
 * Lifecycle of an event plan. `active` — still being planned; `completed`
 * — the event date passed and the user (or the auto-archive job) marked it
 * done; `cancelled` — user abandoned the plan but kept the record.
 */
export const eventPlanStatusEnum = pgEnum("event_plan_status", [
  "active",
  "completed",
  "cancelled",
]);

export const eventPlans = pgTable("event_plans", {
  id: serial("id").primaryKey(),
  /** Stable identity of one explicitly submitted wizard, safe across retries. */
  wizardSubmissionId: uuid("wizard_submission_id"),
  wizardSubmissionHash: text("wizard_submission_hash"),
  userId: uuid("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  /** Short friendly name the user picks: "Nunta Ana & Ion" */
  title: text("title").notNull(),
  eventType: text("event_type"),
  eventDate: date("event_date"),
  /** Wizard step 2: start time "HH:MM" chosen by the client. */
  startTime: text("start_time"),
  /** Wizard step 2: total duration in hours. Auto-derived from event
   *  type (wedding=10, birthday=5, etc.) but editable in the wizard. */
  durationHours: integer("duration_hours"),
  location: text("location"),
  guestCountTarget: integer("guest_count_target"),
  budgetTarget: integer("budget_target"),
  seatsPerTable: integer("seats_per_table").default(10),
  notes: text("notes"),
  /** Whether the user indicated in the wizard they also need a venue.
   *  When true the plan detail page surfaces the "Săli" tab. */
  venueNeeded: boolean("venue_needed").default(false).notNull(),
  /** Wizard-toggled extras: which optional planning sections the user
   *  enabled. Each gates a tab on the plan dashboard. Default false so
   *  legacy plans don't force tabs the owner never asked for; existing
   *  plans get the tabs back via the Setări tab. */
  checklistEnabled: boolean("checklist_enabled").default(false).notNull(),
  budgetEnabled: boolean("budget_enabled").default(false).notNull(),
  guestsEnabled: boolean("guests_enabled").default(false).notNull(),
  /** Seating only makes sense once a guest list exists, so the wizard
   *  hides the seating question when guestsEnabled is false. */
  seatingEnabled: boolean("seating_enabled").default(false).notNull(),
  /** The ONE invitation this plan sends from. Before this existed the
   *  planner's Send button minted a fresh invitation (new slug, new RSVP
   *  tokens) on every press, so day two's send produced a second
   *  invitation holding every guest — everyone got a duplicate mail with
   *  a different link and day one's RSVPs were orphaned on the first
   *  invitation. Set on the first send; every later send reuses it and
   *  only adds the guests it doesn't already hold. */
  invitationId: integer("invitation_id").references(() => invitations.id, {
    onDelete: "set null",
  }),
  /** Max radius (km) from the event city the user is willing to travel
   *  for a venue. 0 = only the selected city, 999 = no limit. Used to
   *  expand the city filter on the Săli tab via a city-proximity map.
   *  Does not affect the budget — venue fees are excluded from artist
   *  totals per product spec. */
  venueRadiusKm: integer("venue_radius_km").default(25),
  /** Array of category IDs the user picked in the wizard (singer, DJ,
   *  photographer, ...). Used to pre-filter the "Artiști disponibili"
   *  section inside the Rezervări Artiști tab. */
  selectedCategories: jsonb("selected_categories").$type<number[]>().default([]),
  status: eventPlanStatusEnum("status").default("active").notNull(),
  /** AI-generated (or user-edited) ordered list of timeline items.
   *  Each item: { time: "14:00", label: "...", durationMin: 45 }. */
  timeline: jsonb("timeline").$type<
    Array<{ time: string; label: string; durationMin: number }>
  >().default([]),
  /** Set when the plan moves to the Arhivă section. */
  archivedAt: timestamp("archived_at"),
  /** Event Moments (F-C8): unique slug guests use to reach the public
   *  upload page via QR code. Anonymous upload, no auth required. */
  momentsSlug: text("moments_slug").unique(),
  momentsEnabled: boolean("moments_enabled").default(false).notNull(),
  /** When uploads start being accepted from guests. NULL = open
   *  immediately upon activation (legacy behavior). Used to create
   *  the once.film-style "wait for the event to start" gate. */
  momentsOpenAt: timestamp("moments_open_at"),
  /** When uploads stop being accepted. NULL = always open.
   *  Combined with momentsOpenAt to define the upload window. */
  momentsCloseAt: timestamp("moments_close_at"),
  /** When uploaded photos become visible to guests on the public
   *  gallery + slideshow. NULL = visible immediately as before.
   *  The owner always sees every photo regardless of this gate
   *  (so moderation still works). */
  momentsRevealAt: timestamp("moments_reveal_at"),
  /** Maximum photos per guest device. NULL = unlimited. Enforced
   *  via the device_id fingerprint on event_photos. */
  momentsShotLimit: integer("moments_shot_limit"),
  /** When true the guest upload page applies a polaroid-style filter
   *  (warm tint + sepia + soft vignette) client-side before uploading.
   *  Default off so existing films keep their original photos. */
  momentsVintage: boolean("moments_vintage").default(false).notNull(),
  /** Phase 4A — ordered list of shot prompts ("Foto cu mireasa",
   *  "Selfie cu nașii", ...). When non-empty the guest UI walks
   *  through them one at a time instead of showing a single free-form
   *  upload field. NULL / empty array = legacy free-form mode. */
  momentsPrompts: jsonb("moments_prompts").$type<string[]>(),
  /** Phase 4B — when true, every guest upload lands with
   *  isApproved=false and only shows in the public gallery / slideshow
   *  after the owner approves it from the moderation queue. Default
   *  false so existing films keep their auto-approve behavior. */
  momentsRequireApproval: boolean("moments_require_approval")
    .default(true)
    .notNull(),
  /** Phase 5/C1 — direct audio URL (mp3/wav/m4a/ogg) the projector
   *  slideshow loops in the background. NULL = silent slideshow.
   *  Owner can drop any HTTPS URL; we don't validate the codec here
   *  because the <audio> element fails gracefully when it can't play. */
  momentsMusicUrl: text("moments_music_url"),
  /** Phase 5/C3 — list of table labels for per-table QR rolls.
   *  ["Masa 1", "Masa 2", ...]. Used by the qr-tables page to render
   *  one card per table and by stats to break down activity per
   *  table. NULL / empty = no per-table mode. */
  momentsTables: jsonb("moments_tables").$type<string[]>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("idx_event_plan_user_status").on(t.userId, t.status),
  uniqueIndex("event_plans_user_wizard_submission_uidx").on(t.userId, t.wizardSubmissionId),
]);

// Planning checklist — seed from template on plan creation.
export const checklistItems = pgTable("checklist_items", {
  id: serial("id").primaryKey(),
  planId: integer("plan_id")
    .references(() => eventPlans.id, { onDelete: "cascade" })
    .notNull(),
  title: text("title").notNull(),
  category: text("category"),            // "venue" | "artists" | "menu" | ...
  priority: checklistPriorityEnum("priority").default("medium").notNull(),
  /** Days-before-event when this task should ideally be done. */
  dueDaysBefore: integer("due_days_before"),
  done: boolean("done").default(false).notNull(),
  doneAt: timestamp("done_at"),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Guest list with RSVP tracking.
export const guestList = pgTable("guest_list", {
  id: serial("id").primaryKey(),
  planId: integer("plan_id")
    .references(() => eventPlans.id, { onDelete: "cascade" })
    .notNull(),
  fullName: text("full_name").notNull(),
  phone: text("phone"),
  email: text("email"),
  /** Legacy "side of the family" field — kept for backwards-compat with
   *  imported guests. New rows use `guestType` instead. */
  group: text("group"),
  /**
   * Party shape for the new guest model:
   *   - "single"  → one adult, partySize = 1
   *   - "couple"  → two adults, partySize = 2 (locked)
   *   - "family"  → one household, partySize 2..8 picked by the host
   * Defaults to "single" so legacy rows behave like a single guest.
   */
  guestType: text("guest_type").default("single").notNull(),
  /** Total adults invited under this entry. 1 / 2 / 2..8 depending on type. */
  partySize: integer("party_size").default(1).notNull(),
  /** Number of children expected to attend (separate from adults). */
  kidsCount: integer("kids_count").default(0).notNull(),
  /** Legacy field — historically mixed +1s and children. New rows leave
   *  this at 0 and rely on `kidsCount` instead. Kept so old data renders. */
  plusOnes: integer("plus_ones").default(0).notNull(),
  /**
   * Channel the host wants the invitation sent on. Drives both the
   * input label on the form ("Email" vs "Telefon" vs "@telegram") and
   * the dispatch logic when invitations are actually sent.
   */
  contactChannel: text("contact_channel").default("whatsapp").notNull(),
  /** The contact value (email, phone, @username) for the chosen channel.
   *  Mirrored into `email` / `phone` for legacy reads. */
  contactValue: text("contact_value"),
  dietary: text("dietary"),
  rsvp: rsvpStatusEnum("rsvp").default("pending").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Seating plan: tables + per-seat guest assignments.
export const seatingTables = pgTable("seating_tables", {
  id: serial("id").primaryKey(),
  planId: integer("plan_id")
    .references(() => eventPlans.id, { onDelete: "cascade" })
    .notNull(),
  name: text("name").notNull(),          // "Masa 1", "Masa mirilor", etc.
  seats: integer("seats").default(10).notNull(),
  // NULL preserves legacy layouts; new clients send an explicit shape.
  shape: text("shape").$type<TableShape>(),
  /** Optional x/y canvas coords for drag-to-arrange layout. */
  posX: integer("pos_x"),
  posY: integer("pos_y"),
  sortOrder: integer("sort_order").default(0),
}, (table) => [
  check("seating_tables_shape_check", sql`${table.shape} IS NULL OR ${table.shape} IN ('round', 'rectangular', 'long')`),
]);

export const seatAssignments = pgTable("seat_assignments", {
  id: serial("id").primaryKey(),
  tableId: integer("table_id")
    .references(() => seatingTables.id, { onDelete: "cascade" })
    .notNull(),
  guestId: integer("guest_id")
    .references(() => guestList.id, { onDelete: "cascade" })
    .notNull()
    .unique(),        // a guest can only sit at one table
  seatNumber: integer("seat_number"),
});

// UGC — event photos uploaded by the client after the wedding, OR by
// anonymous guests during the event via the Event Moments QR flow (F-C8).
export const eventPhotos = pgTable("event_photos", {
  id: serial("id").primaryKey(),
  planId: integer("plan_id")
    .references(() => eventPlans.id, { onDelete: "cascade" })
    .notNull(),
  userId: uuid("user_id")
    .references(() => users.id, { onDelete: "set null" }),
  url: text("url").notNull(),
  caption: text("caption"),
  /** Event Moments — name the guest typed when uploading anonymously. */
  guestName: text("guest_name"),
  /** Event Moments — optional short message from the uploader. */
  guestMessage: text("guest_message"),
  /** Event Moments — source of the upload: "client" (plan owner) or
   *  "guest" (anonymous via QR). */
  source: text("source").default("client").notNull(),
  /** Event Moments — anonymous per-device fingerprint (UUID stored in
   *  the guest's localStorage). Lets us enforce the per-guest shot
   *  limit without requiring auth. NULL for legacy rows and owner
   *  uploads. Not a real identity — wipe the browser and you get a
   *  fresh allowance, which we accept for a wedding-night use case. */
  deviceId: text("device_id"),
  /** Phase 4A — which prompt this photo answers. Stored as the prompt
   *  label string rather than an FK so renaming a prompt mid-event
   *  doesn't orphan the photos already submitted for it. NULL when the
   *  film runs in free-form (no prompts) mode. */
  prompt: text("prompt"),
  /** Phase 5/C3 — which table the guest scanned the QR at. Sourced
   *  from the `?t=Masa+5` query param on the upload page. NULL for
   *  guests who scanned the main QR (no table). */
  tableLabel: text("table_label"),
  /** Phase 5/E1 — Claude-classified category. One of "ceremonie",
   *  "dans", "grup", "portret", "decor", "mancare", "candid", "other".
   *  Free-text not enum so we can iterate the prompt without a
   *  migration. NULL = not yet categorized. */
  category: text("category"),
  /** Optional FK to an artist the client tags as having been at the event. */
  taggedArtistId: integer("tagged_artist_id").references(() => artists.id, {
    onDelete: "set null",
  }),
  taggedVenueId: integer("tagged_venue_id").references(() => venues.id, {
    onDelete: "set null",
  }),
  isPublic: boolean("is_public").default(false).notNull(),
  isApproved: boolean("is_approved").default(false).notNull(),
  /** Phase 4B — owner-side "favorite" star. Used to filter the
   *  collage / ZIP download to a curated subset, and to highlight
   *  hero photos in the slideshow. */
  isFavorite: boolean("is_favorite").default(false).notNull(),
  /** Evidence that the anonymous uploader actively confirmed they own the
   * image rights and, for a child's image, are the parent/guardian or have
   * their authorization. The exact copy is versioned so the proof remains
   * intelligible after the public notice changes. */
  uploadConsentAt: timestamp("upload_consent_at"),
  uploadConsentVersion: text("upload_consent_version"),
  /** HMAC of the source IP, never the raw IP. Useful only for abuse and
   * incident correlation and automatically removed with the photo. */
  uploaderIpHash: text("uploader_ip_hash"),
  /** A public report immediately hides the image pending organizer review. */
  reportedAt: timestamp("reported_at"),
  reportReason: text("report_reason"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Phase 4A — emoji reactions on event photos. A device may stack
// multiple emoji on the same photo but only one of each type
// (enforced by the unique index). Counts aggregate to the gallery
// view post-reveal.
export const photoReactions = pgTable(
  "photo_reactions",
  {
    id: serial("id").primaryKey(),
    photoId: integer("photo_id")
      .references(() => eventPhotos.id, { onDelete: "cascade" })
      .notNull(),
    /** Anonymous per-device fingerprint — same UUID the upload page
     *  uses for the shot-limit accounting. Lets a guest toggle their
     *  own reaction without auth. */
    deviceId: text("device_id").notNull(),
    /** Short emoji string. Validated server-side against a small
     *  allowlist (❤️ 🔥 😂 🥺 🎉) so the table doesn't fill with junk. */
    emoji: text("emoji").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_photo_reactions_photo").on(t.photoId),
    uniqueIndex("uq_photo_reactions_device_emoji").on(
      t.photoId,
      t.deviceId,
      t.emoji,
    ),
  ],
);

// ═══════════════════════════════════════════════════════
// LEAD ENGINE (M3)
//
// When a client submits a lead through the wizard / request form we
// automatically match it against all eligible active vendors (artists
// first, venues as phase 2). A row in lead_matches is created for each
// candidate. Vendors see the lead in their dashboard but contact details
// are REDACTED until they spend a lead credit to unlock it — the
// pay-per-lead monetization model for the marketplace.
// ═══════════════════════════════════════════════════════

export const leadMatchStatusEnum = pgEnum("lead_match_status", [
  "matched",   // system produced the match, vendor has not opened it
  "seen",      // vendor opened the lead card
  "unlocked",  // vendor spent a credit and revealed contact info
  "contacted", // vendor marked they reached out to the client
  "won",       // vendor booked this lead
  "lost",      // vendor explicitly passed / client picked someone else
]);

export const leadMatches = pgTable("lead_matches", {
  id: serial("id").primaryKey(),
  leadId: integer("lead_id")
    .references(() => leads.id, { onDelete: "cascade" })
    .notNull(),
  artistId: integer("artist_id").references(() => artists.id, {
    onDelete: "cascade",
  }),
  venueId: integer("venue_id").references(() => venues.id, {
    onDelete: "cascade",
  }),
  /** 0-100 match score from the matching algorithm (category+city+date+budget). */
  score: integer("score").default(0).notNull(),
  /** JSON snapshot of why this vendor was matched (for transparency). */
  reasons: jsonb("reasons").$type<string[]>().default([]),
  status: leadMatchStatusEnum("status").default("matched").notNull(),
  /** When the vendor opened the card (null = never opened). */
  seenAt: timestamp("seen_at"),
  /** When the vendor spent a credit to unlock the lead. */
  unlockedAt: timestamp("unlocked_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Vendor credit wallet. A lead unlock costs 1 credit; admin tops up.
export const vendorCredits = pgTable("vendor_credits", {
  id: serial("id").primaryKey(),
  artistId: integer("artist_id")
    .references(() => artists.id, { onDelete: "cascade" })
    .unique()
    .notNull(),
  balance: integer("balance").default(0).notNull(),
  totalPurchased: integer("total_purchased").default(0).notNull(),
  totalSpent: integer("total_spent").default(0).notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Ledger of every credit movement for audit + history.
export const creditTransactions = pgTable("credit_transactions", {
  id: serial("id").primaryKey(),
  artistId: integer("artist_id")
    .references(() => artists.id, { onDelete: "cascade" })
    .notNull(),
  /** Positive = top-up, negative = spend. */
  delta: integer("delta").notNull(),
  /** "topup" | "unlock" | "refund" | "bonus" */
  kind: text("kind").notNull(),
  /** Optional FK to the lead match when kind = "unlock". */
  leadMatchId: integer("lead_match_id").references(() => leadMatches.id, {
    onDelete: "set null",
  }),
  note: text("note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ═══════════════════════════════════════════════════════
// OFFER REQUESTS (mini CRM for admin)
// ═══════════════════════════════════════════════════════

export const offerRequests = pgTable("offer_requests", {
  id: serial("id").primaryKey(),
  artistId: integer("artist_id")
    .references(() => artists.id, { onDelete: "cascade" }),
  venueId: integer("venue_id")
    .references(() => venues.id, { onDelete: "cascade" }),
  clientName: text("client_name").notNull(),
  clientPhone: text("client_phone").notNull(),
  clientEmail: text("client_email"),
  eventType: text("event_type"),
  eventDate: date("event_date"),
  message: text("message"),
  source: text("source").default("form").notNull(), // "form" | "wizard" | "direct"
  adminSeen: boolean("admin_seen").default(false).notNull(),
  adminComment: text("admin_comment"),
  status: text("status").default("new").notNull(), // "new" | "seen" | "processed"
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ═══════════════════════════════════════════════════════
// PROFILE VIEWS (M5 — analytics)
//
// Lightweight view tracking for artist / venue public detail pages.
// A session token is derived from hashed IP+UA server-side and is used
// to dedupe multiple hits from the same visitor within 30 minutes so
// counts reflect unique engagement, not page reloads. Aggregates power
// the vendor dashboard + admin analytics.
// ═══════════════════════════════════════════════════════

export const profileViews = pgTable("profile_views", {
  id: serial("id").primaryKey(),
  artistId: integer("artist_id").references(() => artists.id, {
    onDelete: "cascade",
  }),
  venueId: integer("venue_id").references(() => venues.id, {
    onDelete: "cascade",
  }),
  /** SHA-256 of `${ip}|${userAgent}|salt` — opaque, not reversible. */
  sessionHash: text("session_hash").notNull(),
  referrer: text("referrer"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * Per-click tracking on a public profile. Each CTA (Solicită Rezervare,
 * call phone, open gallery, open menu, open contact, etc.) fires a
 * fire-and-forget POST so Analytics can compute conversion rate.
 *
 * Separate from `profile_views` because views are passive (just hitting the
 * page) while clicks are intentional. The split also keeps the existing
 * traffic-source aggregation simple — referrer lives on views only.
 */
export const profileClicks = pgTable(
  "profile_clicks",
  {
    id: serial("id").primaryKey(),
    artistId: integer("artist_id").references(() => artists.id, {
      onDelete: "cascade",
    }),
    venueId: integer("venue_id").references(() => venues.id, {
      onDelete: "cascade",
    }),
    /** Narrow, stable set so the UI can translate + pivot reliably. */
    clickType: text("click_type").notNull(), // "cta" | "phone" | "gallery" | "menu" | "contact"
    sessionHash: text("session_hash").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_profile_clicks_venue").on(t.venueId, t.createdAt),
    index("idx_profile_clicks_artist").on(t.artistId, t.createdAt),
  ],
);

// ═══════════════════════════════════════════════════════
// RELATIONS
// ═══════════════════════════════════════════════════════

export const usersRelations = relations(users, ({ many }) => ({
  artists: many(artists),
  venues: many(venues),
  organizationMemberships: many(partnerOrganizationMembers),
  leads: many(leads, { relationName: "assignedLeads" }),
  blogPosts: many(blogPosts),
  aiConversations: many(aiConversations),
  notifications: many(notifications),
}));

export const artistsRelations = relations(artists, ({ one, many }) => ({
  user: one(users, { fields: [artists.userId], references: [users.id] }),
  images: many(artistImages),
  videos: many(artistVideos),
  packages: many(artistPackages),
  bookings: many(bookings),
  reviews: many(reviews),
}));

export const artistImagesRelations = relations(artistImages, ({ one }) => ({
  artist: one(artists, {
    fields: [artistImages.artistId],
    references: [artists.id],
  }),
}));

export const artistVideosRelations = relations(artistVideos, ({ one }) => ({
  artist: one(artists, {
    fields: [artistVideos.artistId],
    references: [artists.id],
  }),
}));

export const artistPackagesRelations = relations(artistPackages, ({ one }) => ({
  artist: one(artists, {
    fields: [artistPackages.artistId],
    references: [artists.id],
  }),
}));

export const venuesRelations = relations(venues, ({ one, many }) => ({
  user: one(users, { fields: [venues.userId], references: [users.id] }),
  organization: one(partnerOrganizations, {
    fields: [venues.organizationId],
    references: [partnerOrganizations.id],
  }),
  halls: many(venueHalls),
  menuSets: many(venueMenuSets),
  images: many(venueImages),
  bookings: many(bookings),
  reviews: many(reviews),
}));

export const venueImagesRelations = relations(venueImages, ({ one }) => ({
  venue: one(venues, {
    fields: [venueImages.venueId],
    references: [venues.id],
  }),
  hall: one(venueHalls, {
    fields: [venueImages.hallId],
    references: [venueHalls.id],
  }),
}));

// ── ADR 0028 relations ───────────────────────────────────────────────────
export const partnerOrganizationsRelations = relations(
  partnerOrganizations,
  ({ many }) => ({
    members: many(partnerOrganizationMembers),
    venues: many(venues),
  }),
);

export const partnerOrganizationMembersRelations = relations(
  partnerOrganizationMembers,
  ({ one }) => ({
    organization: one(partnerOrganizations, {
      fields: [partnerOrganizationMembers.organizationId],
      references: [partnerOrganizations.id],
    }),
    user: one(users, {
      fields: [partnerOrganizationMembers.userId],
      references: [users.id],
    }),
  }),
);

export const venueHallsRelations = relations(venueHalls, ({ one, many }) => ({
  venue: one(venues, {
    fields: [venueHalls.venueId],
    references: [venues.id],
  }),
  seatingOptions: many(venueHallSeatingOptions),
  menuSets: many(venueHallMenuSets),
}));

export const venueHallSeatingOptionsRelations = relations(
  venueHallSeatingOptions,
  ({ one }) => ({
    hall: one(venueHalls, {
      fields: [venueHallSeatingOptions.hallId],
      references: [venueHalls.id],
    }),
  }),
);

export const venueMenuSetsRelations = relations(
  venueMenuSets,
  ({ one, many }) => ({
    venue: one(venues, {
      fields: [venueMenuSets.venueId],
      references: [venues.id],
    }),
    halls: many(venueHallMenuSets),
  }),
);

export const venueHallMenuSetsRelations = relations(
  venueHallMenuSets,
  ({ one }) => ({
    hall: one(venueHalls, {
      fields: [venueHallMenuSets.hallId],
      references: [venueHalls.id],
    }),
    menuSet: one(venueMenuSets, {
      fields: [venueHallMenuSets.menuSetId],
      references: [venueMenuSets.id],
    }),
  }),
);

export const venueScheduleBlocksRelations = relations(
  venueScheduleBlocks,
  ({ one }) => ({
    venue: one(venues, {
      fields: [venueScheduleBlocks.venueId],
      references: [venues.id],
    }),
    hall: one(venueHalls, {
      fields: [venueScheduleBlocks.hallId],
      references: [venueHalls.id],
    }),
  }),
);

export const venueHallConflictGroupsRelations = relations(
  venueHallConflictGroups,
  ({ one, many }) => ({
    venue: one(venues, {
      fields: [venueHallConflictGroups.venueId],
      references: [venues.id],
    }),
    members: many(venueHallConflictGroupMembers),
  }),
);

export const venueHallConflictGroupMembersRelations = relations(
  venueHallConflictGroupMembers,
  ({ one }) => ({
    group: one(venueHallConflictGroups, {
      fields: [venueHallConflictGroupMembers.groupId],
      references: [venueHallConflictGroups.id],
    }),
    hall: one(venueHalls, {
      fields: [venueHallConflictGroupMembers.hallId],
      references: [venueHalls.id],
    }),
  }),
);

export const leadsRelations = relations(leads, ({ one, many }) => ({
  assignedUser: one(users, {
    fields: [leads.assignedTo],
    references: [users.id],
    relationName: "assignedLeads",
  }),
  bookings: many(bookings),
  activities: many(leadActivities),
}));

export const bookingsRelations = relations(bookings, ({ one }) => ({
  lead: one(leads, { fields: [bookings.leadId], references: [leads.id] }),
  artist: one(artists, {
    fields: [bookings.artistId],
    references: [artists.id],
  }),
  venue: one(venues, { fields: [bookings.venueId], references: [venues.id] }),
}));

export const leadActivitiesRelations = relations(
  leadActivities,
  ({ one }) => ({
    lead: one(leads, {
      fields: [leadActivities.leadId],
      references: [leads.id],
    }),
    user: one(users, {
      fields: [leadActivities.userId],
      references: [users.id],
    }),
  }),
);

export const reviewsRelations = relations(reviews, ({ one }) => ({
  artist: one(artists, {
    fields: [reviews.artistId],
    references: [artists.id],
  }),
  venue: one(venues, { fields: [reviews.venueId], references: [venues.id] }),
}));

export const blogPostsRelations = relations(blogPosts, ({ one }) => ({
  author: one(users, {
    fields: [blogPosts.authorId],
    references: [users.id],
  }),
}));

export const aiConversationsRelations = relations(
  aiConversations,
  ({ one }) => ({
    user: one(users, {
      fields: [aiConversations.userId],
      references: [users.id],
    }),
  }),
);

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, {
    fields: [notifications.userId],
    references: [users.id],
  }),
}));

// ═══════════════════════════════════════════════════════
// M8 — INVITATIONS (templates, invitations, guests, RSVPs)
// ═══════════════════════════════════════════════════════

export const invitationRsvpStatusEnum = pgEnum("invitation_rsvp_status", [
  "pending",
  "yes",
  "no",
  "maybe",
]);

export const invitationStatusEnum = pgEnum("invitation_status", [
  "draft",
  "published",
  "closed",
]);

export const invitationTemplates = pgTable("invitation_templates", {
  id: serial("id").primaryKey(),
  slug: text("slug").unique().notNull(),
  nameRo: text("name_ro").notNull(),
  nameRu: text("name_ru"),
  nameEn: text("name_en"),
  description: text("description"),
  category: text("category"), // wedding, birthday, baptism, corporate
  thumbnailUrl: text("thumbnail_url"),
  // Design tokens the template uses — colors, fonts, decorative elements.
  // Serialized so we can tweak per-invitation without forking the template.
  designTokens: jsonb("design_tokens"),
  isPremium: boolean("is_premium").default(false).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const invitations = pgTable("invitations", {
  id: serial("id").primaryKey(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  templateId: integer("template_id").references(() => invitationTemplates.id, {
    onDelete: "set null",
  }),
  slug: text("slug").unique().notNull(), // public URL slug
  status: invitationStatusEnum("status").default("draft").notNull(),
  // Event metadata rendered in the public invitation
  eventType: text("event_type"), // wedding, birthday, baptism
  coupleNames: text("couple_names"), // "Ana & Ion" for weddings
  hostName: text("host_name"), // for birthdays, corporate
  eventDate: date("event_date"),
  ceremonyTime: text("ceremony_time"),
  receptionTime: text("reception_time"),
  ceremonyLocation: text("ceremony_location"),
  receptionLocation: text("reception_location"),
  message: text("message"), // invitation message / story
  dressCode: text("dress_code"),
  // Design overrides on top of the template's default design
  customColors: jsonb("custom_colors"),
  customFonts: jsonb("custom_fonts"),
  coverImageUrl: text("cover_image_url"),
  // RSVP config
  rsvpDeadline: date("rsvp_deadline"),
  rsvpEnabled: boolean("rsvp_enabled").default(true).notNull(),
  allowPlusOne: boolean("allow_plus_one").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const invitationGuests = pgTable("invitation_guests", {
  id: serial("id").primaryKey(),
  invitationId: integer("invitation_id")
    .references(() => invitations.id, { onDelete: "cascade" })
    .notNull(),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  whatsapp: text("whatsapp"),
  group: text("group"), // "family", "friends", "colleagues"
  /** Same axis as guest_list.guest_type — drives singular vs plural
   *  conjugation in the rendered greeting ("Ești invitat" vs "Sunteți
   *  invitați"). Defaults to "single" so legacy rows keep their copy. */
  guestType: text("guest_type").default("single").notNull(),
  // RSVP response
  rsvpStatus: invitationRsvpStatusEnum("rsvp_status").default("pending").notNull(),
  respondedAt: timestamp("responded_at"),
  plusOne: boolean("plus_one").default(false).notNull(),
  plusOneName: text("plus_one_name"),
  dietaryNotes: text("dietary_notes"),
  /** Health-related dietary details are accepted only from the guest, with
   * a separate explicit acknowledgement. */
  dietaryConsentAt: timestamp("dietary_consent_at", { withTimezone: true }),
  message: text("message"), // message from guest to host
  // Unique token for one-click RSVP links (sent via email/SMS)
  rsvpToken: text("rsvp_token").unique(),
  rsvpTokenExpiresAt: timestamp("rsvp_token_expires_at", { withTimezone: true }),
  rsvpTokenRevokedAt: timestamp("rsvp_token_revoked_at", { withTimezone: true }),
  /** When this guest was actually mailed their invitation. NULL = never
   *  sent. Without it the bulk send had nothing to exclude on, so every
   *  press re-mailed the whole list — a host who added one guest on day
   *  two spammed everyone invited on day one. The send route filters on
   *  this and stamps it per guest the moment that guest's mail succeeds,
   *  so a failure halfway through doesn't re-mail the ones already done. */
  invitationSentAt: timestamp("invitation_sent_at", { withTimezone: true }),
  remindersSent: integer("reminders_sent").default(0).notNull(),
  lastReminderAt: timestamp("last_reminder_at"),
  // Event-day check-in — when the guest scans their QR at the door the
  // host's dashboard marks this timestamp so a live "142/200 sosit" counter
  // can update. Null = not arrived yet.
  checkedInAt: timestamp("checked_in_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const invitationsRelations = relations(invitations, ({ one, many }) => ({
  template: one(invitationTemplates, {
    fields: [invitations.templateId],
    references: [invitationTemplates.id],
  }),
  user: one(users, {
    fields: [invitations.userId],
    references: [users.id],
  }),
  guests: many(invitationGuests),
}));

export const invitationGuestsRelations = relations(
  invitationGuests,
  ({ one }) => ({
    invitation: one(invitations, {
      fields: [invitationGuests.invitationId],
      references: [invitations.id],
    }),
  }),
);

// ═══════════════════════════════════════════════════════
// PUSH NOTIFICATIONS (mobile)
//
// Mobile devices register their Expo push token here so we can fan
// out notifications when a booking event lands. A single user can
// have multiple tokens (phone + tablet) and each row tracks when it
// was last refreshed so we can prune stale ones (Apple/Google
// recycle tokens — typical lifetime is 60 days of inactivity).
// ═══════════════════════════════════════════════════════

export const pushTokens = pgTable(
  "push_tokens",
  {
    id: serial("id").primaryKey(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    /** Expo push token, e.g. "ExponentPushToken[xxx]". Stored verbatim
     *  so the Expo push service accepts it. We do NOT store raw FCM /
     *  APNs tokens — Expo abstracts those. */
    expoToken: text("expo_token").notNull(),
    platform: text("platform").notNull(), // "ios" | "android"
    deviceLabel: text("device_label"), // e.g. "iPhone 17 Pro"
    /** Bumped every time the mobile app starts and re-registers its
     *  token. Lets a cron prune rows untouched for >60 days. */
    lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    // One token per user can only be registered once; if the same
    // device opens the app from a different account, the older row
    // gets owned by the new userId. Unique on the token alone keeps
    // the constraint clean.
    uniqueIndex("idx_push_token_unique").on(t.expoToken),
    index("idx_push_user").on(t.userId),
  ],
);

export const pushTokensRelations = relations(pushTokens, ({ one }) => ({
  user: one(users, {
    fields: [pushTokens.userId],
    references: [users.id],
  }),
}));
