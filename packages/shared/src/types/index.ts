// Cross-platform domain types.
//
// Source of truth for the shape of every entity that crosses the wire
// between the web/mobile apps and the API. When we change schema in
// drizzle, we mirror the change here — so the web stops compiling if
// the mobile client would break, and vice versa.
//
// Convention:
//   - All ISO dates are typed `string` (YYYY-MM-DD or full ISO 8601).
//   - All money amounts are `number` in whole EUR (no cents), so a
//     1200 means €1200. The platform prices in EUR only — there is no
//     currency conversion anywhere in the product.
//   - Nullable fields use `T | null`, not `T?`. Explicit null beats
//     implicit undefined when serialising across HTTP.

export type EventType =
  | "wedding"
  | "proposal"
  | "cununie"
  | "baptism"
  | "cumatrie"
  | "birthday"
  | "kids_birthday"
  | "corporate"
  | "concert"
  | "other";

export type BookingRequestStatus =
  | "pending"
  | "accepted"
  | "confirmed_by_client"
  | "rejected"
  | "cancelled"
  | "completed"
  | "expired";

export type BookingPaidStatus = "unpaid" | "partial" | "paid";

export type RsvpStatus = "pending" | "accepted" | "declined" | "maybe";

export type UserRole = "user" | "artist" | "admin";

export type VendorKind = "artist" | "venue";

/** Single entry inside booking_requests.priceOffers — the negotiation
 *  history between client and artist. */
export interface BookingPriceOffer {
  from: "artist" | "client";
  amount: number; // whole EUR
  message?: string;
  at: string; // ISO timestamp
}

export interface ArtistProfile {
  id: number;
  nameRo: string;
  nameRu: string | null;
  nameEn: string | null;
  slug: string;
  descriptionRo: string | null;
  descriptionRu: string | null;
  descriptionEn: string | null;
  categoryIds: number[];
  priceFrom: number | null;
  priceCurrency: string; // typically "EUR"
  priceHidden: boolean;
  location: string | null;
  baseCity: string | null;
  phone: string | null;
  email: string | null;
  instagram: string | null;
  facebook: string | null;
  youtube: string | null;
  tiktok: string | null;
  photoUrl: string | null;
  ratingAvg: number | null;
  ratingCount: number;
  isActive: boolean;
  isVerified: boolean;
  isPremium: boolean;
  isFeatured: boolean;
}

export interface VenueProfile {
  id: number;
  nameRo: string;
  slug: string;
  descriptionRo: string | null;
  location: string | null;
  capacityMin: number | null;
  capacityMax: number | null;
  pricePerPerson: number | null;
  photoUrl: string | null;
  coverImageUrl: string | null;
  ratingAvg: number | null;
  ratingCount: number;
  isActive: boolean;
  isVerified: boolean;
}

export interface BookingRequest {
  id: number;
  artistId: number | null;
  venueId: number | null;
  eventPlanId: number | null;
  clientUserId: string | null;
  clientName: string;
  clientPhone: string;
  clientEmail: string | null;
  eventDate: string; // YYYY-MM-DD
  startTime: string | null; // "HH:MM"
  endTime: string | null;
  eventType: EventType | string | null;
  guestCount: number | null;
  message: string | null;
  status: BookingRequestStatus;
  agreedPrice: number | null; // whole EUR
  paidStatus: BookingPaidStatus;
  priceOffers: BookingPriceOffer[];
  artistReply: string | null;
  source: "client" | "manual";
  createdAt: string;
  updatedAt: string;
  // Hydrated joins — null when not requested.
  artistName?: string | null;
  artistSlug?: string | null;
  venueName?: string | null;
  venueSlug?: string | null;
  categoryNames?: string[] | null;
}

export interface EventPlan {
  id: number;
  userId: string;
  title: string;
  eventType: EventType | string | null;
  eventDate: string | null;
  startTime: string | null;
  durationHours: number | null;
  location: string | null;
  guestCountTarget: number | null;
  budgetTarget: number | null;
  seatsPerTable: number | null;
  notes: string | null;
  venueNeeded: boolean;
  checklistEnabled: boolean;
  budgetEnabled: boolean;
  guestsEnabled: boolean;
  seatingEnabled: boolean;
  momentsEnabled: boolean;
  venueRadiusKm: number | null;
  selectedCategories: number[];
  status: "active" | "archived";
  momentsSlug: string | null;
  momentsOpenAt: string | null;
  momentsCloseAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChecklistItem {
  id: number;
  eventPlanId: number;
  title: string;
  done: boolean;
  category: string | null;
  dueDaysBefore: number | null;
  sortOrder: number;
  createdAt: string;
}

export interface Guest {
  id: number;
  eventPlanId: number;
  fullName: string;
  partySize: number;
  rsvp: RsvpStatus;
  contactChannel: "whatsapp" | "viber" | "telegram" | "sms" | "email";
  contactValue: string | null;
  notes: string | null;
  tableNumber: number | null;
  createdAt: string;
}

export interface Conversation {
  id: number;
  clientUserId: string;
  artistId: number | null;
  venueId: number | null;
  vendorKind: VendorKind;
  vendorName: string | null;
  vendorSlug: string | null;
  lastMessageAt: string;
  lastMessagePreview: string | null;
  clientUnread: number;
  artistUnread: number;
  createdAt: string;
}

export interface ChatMessage {
  id: number;
  bookingRequestId: number | null;
  conversationId: number | null;
  senderType: "client" | "artist" | "admin";
  senderName: string;
  message: string;
  attachmentUrl: string | null;
  isRead: boolean;
  createdAt: string;
}

export interface MomentsPhoto {
  id: number;
  eventPlanId: number;
  url: string;
  thumbUrl: string | null;
  uploaderName: string | null;
  uploaderTable: number | null;
  caption: string | null;
  isFavorite: boolean;
  isApproved: boolean;
  width: number | null;
  height: number | null;
  createdAt: string;
}

/** Stat tiles + deltas shown on the partner home dashboard. */
export interface ArtistDashboardStats {
  pendingRequests: number;
  pendingRequestsCreatedToday: number;
  pendingRequestsCreatedYesterday: number;
  profileViews30d: number;
  ratingAvg: number | null;
  ratingCount: number;
  confirmedThisMonth: number;
  confirmedThisWeek: number;
  confirmedLastWeek: number;
  unreadMessages: number;
  unreadMessagesToday: number;
  unreadMessagesYesterday: number;
  revenueThisMonthEUR: number;
  revenueLastMonthEUR: number;
}

export interface ArtistDashboardNextEvent {
  id: number;
  eventType: EventType | string | null;
  clientName: string;
  eventDate: string;
  startTime: string | null;
  endTime: string | null;
  location: string | null;
  guestCount: number | null;
  venueName: string | null;
  venueImage: string | null;
  status: BookingRequestStatus;
}

export interface ArtistDashboardRecentRequest {
  id: number;
  eventType: EventType | string | null;
  clientName: string;
  eventDate: string;
  location: string | null;
  guestCount: number | null;
  status: BookingRequestStatus;
  createdAt: string;
}

export interface ArtistDashboardProfileSnapshot {
  id: number;
  nameRo: string;
  slug: string;
  photoUrl: string | null;
  isPremium: boolean;
  isVerified: boolean;
  profileCompletionPct: number;
}
