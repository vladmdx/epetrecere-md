// F-A1 — Vendor dashboard stats.
//
// Single source of truth for the partner home dashboard. Originally returned
// just 4 stat cards (pending requests / profile views / rating / confirmed
// this month). The redesign needs richer context: unread messages, monthly
// revenue (with WoW/MoM deltas), and short-window trend deltas for the
// "+X față de ieri / săpt. trecută" sub-labels under each tile.
//
// Stats returned (extended set):
//   - pendingRequests              booking_requests where status='pending'
//   - pendingRequestsCreatedToday  pending requests that landed today
//                                  (used as the "+X față de ieri" delta vs
//                                  yesterday's same window).
//   - pendingRequestsCreatedYesterday  for delta computation
//   - profileViews30d              profile_views in the last 30 days
//   - ratingAvg / ratingCount      rating rollup stored on artists row
//   - confirmedThisMonth           bookings flipped to confirmed_by_client
//                                  since the start of this calendar month
//   - confirmedThisWeek            same metric for the last 7 days
//   - confirmedLastWeek            previous 7-day window (for delta)
//   - unreadMessages               total artistUnread across this artist's
//                                  conversations rows
//   - unreadMessagesToday          messages landed today on this artist
//                                  (chat_messages created today)
//   - unreadMessagesYesterday      same for yesterday (delta)
//   - revenueThisMonthEUR          sum agreedPrice (EUR) for accepted /
//                                  confirmed_by_client / completed bookings
//                                  whose eventDate falls in this month
//   - revenueLastMonthEUR          same metric for last month (delta %)

import { db } from "@/lib/db";
import {
  artists,
  bookingRequests,
  chatMessages,
  conversations,
  profileViews,
} from "@/lib/db/schema";
import { and, count, eq, gte, lt, sum, inArray } from "drizzle-orm";

export type ArtistStats = {
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
};

export async function getArtistStats(artistId: number): Promise<ArtistStats> {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(todayStart.getTime() - 7 * 24 * 60 * 60 * 1000);
  const fourteenDaysAgo = new Date(todayStart.getTime() - 14 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const monthStartIso = monthStart.toISOString().slice(0, 10);
  const lastMonthStartIso = lastMonthStart.toISOString().slice(0, 10);
  const nextMonthStartIso = nextMonthStart.toISOString().slice(0, 10);

  // Status values that count toward earned revenue. Includes accepted (price
  // agreed but client hasn't co-signed yet) so the partner sees a forward-
  // looking picture, not just sealed deals. Typed as mutable array of the
  // exact enum values so drizzle's `inArray` can accept it directly.
  const earningStatuses: Array<
    "accepted" | "confirmed_by_client" | "completed"
  > = ["accepted", "confirmed_by_client", "completed"];

  // Run reads in parallel — the dashboard is the first paint on login.
  const [
    pendingRow,
    pendingTodayRow,
    pendingYesterdayRow,
    viewsRow,
    ratingRow,
    confirmedMonthRow,
    confirmedWeekRow,
    confirmedLastWeekRow,
    unreadRow,
    msgsTodayRow,
    msgsYesterdayRow,
    revenueMonthRow,
    revenueLastMonthRow,
  ] = await Promise.all([
    db
      .select({ value: count() })
      .from(bookingRequests)
      .where(
        and(
          eq(bookingRequests.artistId, artistId),
          eq(bookingRequests.status, "pending"),
        ),
      ),
    db
      .select({ value: count() })
      .from(bookingRequests)
      .where(
        and(
          eq(bookingRequests.artistId, artistId),
          eq(bookingRequests.status, "pending"),
          gte(bookingRequests.createdAt, todayStart),
        ),
      ),
    db
      .select({ value: count() })
      .from(bookingRequests)
      .where(
        and(
          eq(bookingRequests.artistId, artistId),
          eq(bookingRequests.status, "pending"),
          gte(bookingRequests.createdAt, yesterdayStart),
          lt(bookingRequests.createdAt, todayStart),
        ),
      ),
    db
      .select({ value: count() })
      .from(profileViews)
      .where(
        and(
          eq(profileViews.artistId, artistId),
          gte(profileViews.createdAt, thirtyDaysAgo),
        ),
      ),
    db
      .select({
        ratingAvg: artists.ratingAvg,
        ratingCount: artists.ratingCount,
      })
      .from(artists)
      .where(eq(artists.id, artistId))
      .limit(1),
    db
      .select({ value: count() })
      .from(bookingRequests)
      .where(
        and(
          eq(bookingRequests.artistId, artistId),
          eq(bookingRequests.status, "confirmed_by_client"),
          gte(bookingRequests.updatedAt, monthStart),
        ),
      ),
    db
      .select({ value: count() })
      .from(bookingRequests)
      .where(
        and(
          eq(bookingRequests.artistId, artistId),
          eq(bookingRequests.status, "confirmed_by_client"),
          gte(bookingRequests.updatedAt, sevenDaysAgo),
        ),
      ),
    db
      .select({ value: count() })
      .from(bookingRequests)
      .where(
        and(
          eq(bookingRequests.artistId, artistId),
          eq(bookingRequests.status, "confirmed_by_client"),
          gte(bookingRequests.updatedAt, fourteenDaysAgo),
          lt(bookingRequests.updatedAt, sevenDaysAgo),
        ),
      ),
    db
      .select({ value: sum(conversations.artistUnread) })
      .from(conversations)
      .where(eq(conversations.artistId, artistId)),
    db
      .select({ value: count() })
      .from(chatMessages)
      .innerJoin(
        conversations,
        eq(chatMessages.conversationId, conversations.id),
      )
      .where(
        and(
          eq(conversations.artistId, artistId),
          eq(chatMessages.senderType, "client"),
          gte(chatMessages.createdAt, todayStart),
        ),
      ),
    db
      .select({ value: count() })
      .from(chatMessages)
      .innerJoin(
        conversations,
        eq(chatMessages.conversationId, conversations.id),
      )
      .where(
        and(
          eq(conversations.artistId, artistId),
          eq(chatMessages.senderType, "client"),
          gte(chatMessages.createdAt, yesterdayStart),
          lt(chatMessages.createdAt, todayStart),
        ),
      ),
    // Revenue this month: sum agreedPrice for bookings whose eventDate is
    // in the current calendar month. Limited to statuses that signal real
    // money on the table (accepted+ — see earningStatuses above).
    db
      .select({ value: sum(bookingRequests.agreedPrice) })
      .from(bookingRequests)
      .where(
        and(
          eq(bookingRequests.artistId, artistId),
          inArray(bookingRequests.status, earningStatuses),
          gte(bookingRequests.eventDate, monthStartIso),
          lt(bookingRequests.eventDate, nextMonthStartIso),
        ),
      ),
    db
      .select({ value: sum(bookingRequests.agreedPrice) })
      .from(bookingRequests)
      .where(
        and(
          eq(bookingRequests.artistId, artistId),
          inArray(bookingRequests.status, earningStatuses),
          gte(bookingRequests.eventDate, lastMonthStartIso),
          lt(bookingRequests.eventDate, monthStartIso),
        ),
      ),
  ]);

  return {
    pendingRequests: Number(pendingRow[0]?.value ?? 0),
    pendingRequestsCreatedToday: Number(pendingTodayRow[0]?.value ?? 0),
    pendingRequestsCreatedYesterday: Number(pendingYesterdayRow[0]?.value ?? 0),
    profileViews30d: Number(viewsRow[0]?.value ?? 0),
    ratingAvg: ratingRow[0]?.ratingAvg ?? null,
    ratingCount: Number(ratingRow[0]?.ratingCount ?? 0),
    confirmedThisMonth: Number(confirmedMonthRow[0]?.value ?? 0),
    confirmedThisWeek: Number(confirmedWeekRow[0]?.value ?? 0),
    confirmedLastWeek: Number(confirmedLastWeekRow[0]?.value ?? 0),
    unreadMessages: Number(unreadRow[0]?.value ?? 0),
    unreadMessagesToday: Number(msgsTodayRow[0]?.value ?? 0),
    unreadMessagesYesterday: Number(msgsYesterdayRow[0]?.value ?? 0),
    revenueThisMonthEUR: Number(revenueMonthRow[0]?.value ?? 0),
    revenueLastMonthEUR: Number(revenueLastMonthRow[0]?.value ?? 0),
  };
}
