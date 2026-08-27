// Zod schemas — the wire-format validators used identically by:
//   - web API routes (parse request bodies + verify responses)
//   - mobile API client (parse responses, validate forms)
//
// Keep these aligned with packages/shared/src/types — when the type
// changes, the schema must follow. If they drift the mobile compiler
// will catch it on the next build because schemas infer types via
// z.infer<typeof X>.

import { z } from "zod";

// ─── Enums ──────────────────────────────────────────────────────────

export const EventTypeSchema = z.enum([
  "wedding",
  "proposal",
  "cununie",
  "baptism",
  "cumatrie",
  "birthday",
  "kids_birthday",
  "corporate",
  "concert",
  "other",
]);

export const BookingRequestStatusSchema = z.enum([
  "pending",
  "accepted",
  "confirmed_by_client",
  "rejected",
  "cancelled",
  "completed",
  "expired",
]);

export const RsvpStatusSchema = z.enum([
  "pending",
  "accepted",
  "declined",
  "maybe",
]);

// ─── Reusable primitives ────────────────────────────────────────────

const IsoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data trebuie să fie în format YYYY-MM-DD");

const HHMMSchema = z
  .string()
  .regex(/^([01]?\d|2[0-3]):[0-5]\d$/, "Ora trebuie să fie HH:MM");

const PhoneSchema = z
  .string()
  .min(7, "Numărul de telefon e prea scurt")
  .max(20, "Numărul de telefon e prea lung");

const EmailSchema = z.string().email("Email invalid");

// ─── Booking request — create from client ───────────────────────────

export const BookingRequestCreateSchema = z.object({
  artistId: z.number().int().positive().nullable().optional(),
  venueId: z.number().int().positive().nullable().optional(),
  eventPlanId: z.number().int().positive().nullable().optional(),
  clientName: z.string().min(2, "Numele e prea scurt").max(100),
  clientPhone: PhoneSchema,
  clientEmail: EmailSchema.nullable().optional(),
  eventDate: IsoDateSchema,
  startTime: HHMMSchema.nullable().optional(),
  endTime: HHMMSchema.nullable().optional(),
  eventType: z.string().nullable().optional(),
  guestCount: z.number().int().positive().nullable().optional(),
  message: z.string().max(2000).nullable().optional(),
});

// ─── Booking request — artist actions on a pending request ─────────

export const BookingAcceptSchema = z.object({
  artistReply: z.string().max(2000).optional(),
  agreedPrice: z.number().int().positive().optional(),
});

export const BookingRejectSchema = z.object({
  artistReply: z.string().max(2000).optional(),
});

export const BookingProposePriceSchema = z.object({
  amount: z.number().int().positive(),
  message: z.string().max(2000).optional(),
});

// ─── Chat message — send ────────────────────────────────────────────

export const ChatMessageSendSchema = z.object({
  conversationId: z.number().int().positive().optional(),
  bookingRequestId: z.number().int().positive().optional(),
  message: z.string().min(1).max(4000),
  attachmentUrl: z.string().url().optional(),
});

// ─── Event plan — create from planning wizard ──────────────────────

export const EventPlanCreateSchema = z.object({
  title: z.string().min(2).max(120),
  eventType: z.string().nullable().optional(),
  eventDate: IsoDateSchema.nullable().optional(),
  startTime: HHMMSchema.nullable().optional(),
  durationHours: z.number().int().positive().nullable().optional(),
  location: z.string().max(200).nullable().optional(),
  guestCountTarget: z.number().int().positive().nullable().optional(),
  budgetTarget: z.number().int().positive().nullable().optional(),
  venueNeeded: z.boolean().default(false),
  checklistEnabled: z.boolean().default(false),
  budgetEnabled: z.boolean().default(false),
  guestsEnabled: z.boolean().default(false),
  seatingEnabled: z.boolean().default(false),
  momentsEnabled: z.boolean().default(false),
  selectedCategories: z.array(z.number().int().positive()).default([]),
});

// ─── Guest — create / RSVP update ───────────────────────────────────

export const GuestCreateSchema = z.object({
  fullName: z.string().min(2).max(120),
  partySize: z.number().int().positive().default(1),
  contactChannel: z.enum(["whatsapp", "viber", "telegram", "sms", "email"]),
  contactValue: z.string().max(120).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export const GuestRsvpUpdateSchema = z.object({
  rsvp: RsvpStatusSchema,
  partySize: z.number().int().positive().optional(),
});

// ─── Push token — mobile-only ──────────────────────────────────────

export const PushTokenRegisterSchema = z.object({
  expoToken: z.string().min(10),
  platform: z.enum(["ios", "android"]),
  deviceLabel: z.string().max(120).optional(),
});

// ─── Inferred types — re-exportable so callers don't double-declare ─

export type BookingRequestCreateInput = z.infer<typeof BookingRequestCreateSchema>;
export type BookingAcceptInput = z.infer<typeof BookingAcceptSchema>;
export type BookingRejectInput = z.infer<typeof BookingRejectSchema>;
export type BookingProposePriceInput = z.infer<typeof BookingProposePriceSchema>;
export type ChatMessageSendInput = z.infer<typeof ChatMessageSendSchema>;
export type EventPlanCreateInput = z.infer<typeof EventPlanCreateSchema>;
export type GuestCreateInput = z.infer<typeof GuestCreateSchema>;
export type GuestRsvpUpdateInput = z.infer<typeof GuestRsvpUpdateSchema>;
export type PushTokenRegisterInput = z.infer<typeof PushTokenRegisterSchema>;
