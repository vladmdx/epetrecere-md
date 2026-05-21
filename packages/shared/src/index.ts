// @epetrecere/shared — entry point.
//
// Re-exports everything from sub-modules so callers can do either:
//   import { BookingRequestStatus, formatPriceEUR } from "@epetrecere/shared";
//   import type { ArtistProfile } from "@epetrecere/shared/types";
//   import { bookingRequestCreate } from "@epetrecere/shared/validators";
//
// Keep this file as a thin barrel — no logic, no constants, no types
// defined directly here. Add new exports in their sub-module then
// re-export from the barrel below.

export * from "./types";
export * from "./validators";
export * from "./utils";
export * from "./api";
