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
  source: calendarSourceEnum("source").default("manual").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

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
});

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

export const bookingRequestStatusEnum = pgEnum("booking_request_status", [
  "pending",
  "accepted",
  "rejected",
  "cancelled",
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
});

// ═══════════════════════════════════════════════════════
// CHAT MESSAGES
// ═══════════════════════════════════════════════════════

export const chatMessages = pgTable("chat_messages", {
  id: serial("id").primaryKey(),
  bookingRequestId: integer("booking_request_id")
    .references(() => bookingRequests.id, { onDelete: "cascade" })
    .notNull(),
  senderType: text("sender_type").notNull(), // "client" | "artist" | "admin"
  senderName: text("sender_name").notNull(),
  message: text("message").notNull(),
  isRead: boolean("is_read").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ═══════════════════════════════════════════════════════
// OFFER REQUESTS (mini CRM for admin)
// ═══════════════════════════════════════════════════════

export const offerRequests = pgTable("offer_requests", {
  id: serial("id").primaryKey(),
  artistId: integer("artist_id")
    .references(() => artists.id, { onDelete: "cascade" })
    .notNull(),
  clientName: text("client_name").notNull(),
  clientPhone: text("client_phone").notNull(),
  clientEmail: text("client_email"),
  eventType: text("event_type"),
  eventDate: date("event_date"),
  message: text("message"),
  adminSeen: boolean("admin_seen").default(false).notNull(),
  adminComment: text("admin_comment"),
  status: text("status").default("new").notNull(), // "new" | "seen" | "processed"
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
