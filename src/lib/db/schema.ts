import {
  pgTable,
  text,
  timestamp,
  integer,
  boolean,
  pgEnum,
  uuid,
  real,
  jsonb,
  varchar,
  serial,
  date,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

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
  googleRefreshToken: text("google_refresh_token"),
  googleAccessToken: text("google_access_token"),
  googleTokenExpiresAt: timestamp("google_token_expires_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

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
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ═══════════════════════════════════════════════════════
// ARTISTS
// ═══════════════════════════════════════════════════════

export const artists = pgTable("artists", {
  id: serial("id").primaryKey(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  nameRo: text("name_ro").notNull(),
  nameRu: text("name_ru"),
  nameEn: text("name_en"),
  slug: text("slug").unique().notNull(),
  descriptionRo: text("description_ro"),
  descriptionRu: text("description_ru"),
  descriptionEn: text("description_en"),
  categoryIds: integer("category_ids").array(),
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
  sortOrder: integer("sort_order").default(0),
  // Feature 14 — auto-reply on new booking request. When enabled, the message
  // is emailed to the client the moment their request lands, reducing bounce.
  autoReplyEnabled: boolean("auto_reply_enabled").default(false).notNull(),
  autoReplyMessage: text("auto_reply_message"),
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
  isVisible: boolean("is_visible").default(true).notNull(),
});

// ═══════════════════════════════════════════════════════
// VENUES
// ═══════════════════════════════════════════════════════

export const venues = pgTable("venues", {
  id: serial("id").primaryKey(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
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
  /** M12 — URL to an embeddable virtual tour (Matterport, Kuula, YouTube 360).
   *  Rendered as an iframe on the public venue detail page. */
  virtualTourUrl: text("virtual_tour_url"),
  calendarEnabled: boolean("calendar_enabled").default(false).notNull(),
  isActive: boolean("is_active").default(false).notNull(),
  isFeatured: boolean("is_featured").default(false).notNull(),
  ratingAvg: real("rating_avg").default(0),
  ratingCount: integer("rating_count").default(0),
  seoTitleRo: text("seo_title_ro"),
  seoTitleRu: text("seo_title_ru"),
  seoTitleEn: text("seo_title_en"),
  seoDescRo: text("seo_desc_ro"),
  seoDescRu: text("seo_desc_ru"),
  seoDescEn: text("seo_desc_en"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const venueImages = pgTable("venue_images", {
  id: serial("id").primaryKey(),
  venueId: integer("venue_id")
    .references(() => venues.id, { onDelete: "cascade" })
    .notNull(),
  url: text("url").notNull(),
  altRo: text("alt_ro"),
  altRu: text("alt_ru"),
  altEn: text("alt_en"),
  sortOrder: integer("sort_order").default(0),
  isCover: boolean("is_cover").default(false).notNull(),
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
  note: text("note"),
  /** F-S6 — Event type for color coding on the owner dashboard calendar.
   *  Free-form string (e.g. "nunta", "cumetrie", "corporate") so new types
   *  can be introduced without a schema migration. Null = uncategorized. */
  eventType: text("event_type"),
  source: calendarSourceEnum("source").default("manual").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("idx_cal_entity_date").on(t.entityType, t.entityId, t.date),
  index("idx_cal_entity_type_date_status").on(t.entityType, t.date, t.status),
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
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

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
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("idx_notif_user_read").on(t.userId, t.isRead),
  index("idx_notif_user_created").on(t.userId, t.createdAt),
]);

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
]);

export const bookingRequests = pgTable("booking_requests", {
  id: serial("id").primaryKey(),
  artistId: integer("artist_id")
    .references(() => artists.id, { onDelete: "cascade" })
    .notNull(),
  clientUserId: uuid("client_user_id")
    .references(() => users.id, { onDelete: "cascade" }),
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
  artistReply: text("artist_reply"),
  adminNotes: text("admin_notes"),
  adminSeen: boolean("admin_seen").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("idx_booking_artist_status").on(t.artistId, t.status),
  index("idx_booking_client_user").on(t.clientUserId),
]);

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
  artistId: integer("artist_id")
    .references(() => artists.id, { onDelete: "cascade" })
    .notNull(),
  lastMessageAt: timestamp("last_message_at").defaultNow().notNull(),
  lastMessagePreview: text("last_message_preview"),
  clientUnread: integer("client_unread").default(0).notNull(),
  artistUnread: integer("artist_unread").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("idx_conv_client_artist").on(t.clientUserId, t.artistId),
  index("idx_conv_artist").on(t.artistId),
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

export const eventPlans = pgTable("event_plans", {
  id: serial("id").primaryKey(),
  userId: uuid("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  /** Short friendly name the user picks: "Nunta Ana & Ion" */
  title: text("title").notNull(),
  eventType: text("event_type"),
  eventDate: date("event_date"),
  location: text("location"),
  guestCountTarget: integer("guest_count_target"),
  budgetTarget: integer("budget_target"),
  seatsPerTable: integer("seats_per_table").default(10),
  notes: text("notes"),
  /** Event Moments (F-C8): unique slug guests use to reach the public
   *  upload page via QR code. Anonymous upload, no auth required. */
  momentsSlug: text("moments_slug").unique(),
  momentsEnabled: boolean("moments_enabled").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

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
  /** "Side of the family": "bride" | "groom" | "friends" | "work" */
  group: text("group"),
  /** Number of +1s / children this guest brings. */
  plusOnes: integer("plus_ones").default(0).notNull(),
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
  /** Optional x/y canvas coords for drag-to-arrange layout. */
  posX: integer("pos_x"),
  posY: integer("pos_y"),
  sortOrder: integer("sort_order").default(0),
});

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
  /** Optional FK to an artist the client tags as having been at the event. */
  taggedArtistId: integer("tagged_artist_id").references(() => artists.id, {
    onDelete: "set null",
  }),
  taggedVenueId: integer("tagged_venue_id").references(() => venues.id, {
    onDelete: "set null",
  }),
  isPublic: boolean("is_public").default(false).notNull(),
  isApproved: boolean("is_approved").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

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

// ═══════════════════════════════════════════════════════
// RELATIONS
// ═══════════════════════════════════════════════════════

export const usersRelations = relations(users, ({ many }) => ({
  artists: many(artists),
  venues: many(venues),
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
  images: many(venueImages),
  bookings: many(bookings),
  reviews: many(reviews),
}));

export const venueImagesRelations = relations(venueImages, ({ one }) => ({
  venue: one(venues, {
    fields: [venueImages.venueId],
    references: [venues.id],
  }),
}));

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
  group: text("group"), // "family", "friends", "colleagues"
  // RSVP response
  rsvpStatus: invitationRsvpStatusEnum("rsvp_status").default("pending").notNull(),
  respondedAt: timestamp("responded_at"),
  plusOne: boolean("plus_one").default(false).notNull(),
  plusOneName: text("plus_one_name"),
  dietaryNotes: text("dietary_notes"),
  message: text("message"), // message from guest to host
  // Unique token for one-click RSVP links (sent via email/SMS)
  rsvpToken: text("rsvp_token").unique(),
  remindersSent: integer("reminders_sent").default(0).notNull(),
  lastReminderAt: timestamp("last_reminder_at"),
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
