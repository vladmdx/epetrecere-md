export type Locale = "ro" | "ru" | "en";

export type UserRole = "super_admin" | "admin" | "editor" | "artist" | "user";

export type EntityType = "artist" | "venue";

export type CategoryType = "artist" | "service" | "venue";

export type CalendarStatus = "available" | "booked" | "tentative" | "blocked";

export type BookingStatus =
  | "pending"
  | "accepted"
  | "declined"
  | "confirmed"
  | "completed"
  | "cancelled";

export type LeadStatus =
  | "new"
  | "contacted"
  | "proposal_sent"
  | "negotiation"
  | "confirmed"
  | "completed"
  | "lost"
  | "follow_up";

export type LeadSource = "form" | "wizard" | "direct" | "import";

export type LeadActivityType =
  | "note"
  | "email"
  | "call"
  | "sms"
  | "status_change"
  | "assignment";

export type BlogStatus = "draft" | "published" | "archived";

export type HomepageSectionType =
  | "hero"
  | "search_bar"
  | "categories"
  | "featured_artists"
  | "featured_venues"
  | "event_planner"
  | "services"
  | "process"
  | "testimonials"
  | "stats"
  | "clients"
  | "blog"
  | "cta";

export type ImportStatus = "pending" | "processing" | "completed" | "failed";
