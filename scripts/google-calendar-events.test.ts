import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createGoogleCalendarSyncWindow,
  expandDays,
  fetchUpcomingEvents,
  GoogleCalendarFetchError,
} from "../src/lib/google/calendar-events";

const NOW = new Date("2026-09-14T10:00:00.000Z");

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("non-2xx Google response rejects and cannot be mistaken for an empty feed", async () => {
  let replacementCalls = 0;
  const fetchImpl = async () => jsonResponse({ error: "temporarily unavailable" }, 503);

  await assert.rejects(
    async () => {
      const events = await fetchUpcomingEvents("secret", {
        fetchImpl: fetchImpl as typeof fetch,
        now: NOW,
      });
      replacementCalls += 1;
      assert.deepEqual(events, []);
    },
    (error: unknown) => {
      assert.ok(error instanceof GoogleCalendarFetchError);
      assert.equal(error.status, 503);
      return true;
    },
  );
  assert.equal(replacementCalls, 0);
});

test("all nextPageToken pages are fetched and merged before returning", async () => {
  const requests: Array<{ url: URL; authorization: string | null }> = [];
  const pages = [
    {
      items: [
        {
          id: "first",
          summary: "Ziua unu",
          status: "confirmed",
          start: { date: "2026-09-20" },
          end: { date: "2026-09-21" },
        },
      ],
      nextPageToken: "page / two",
    },
    {
      items: [
        {
          id: "second",
          summary: "Ziua doi",
          status: "tentative",
          start: { date: "2026-09-22" },
          end: { date: "2026-09-23" },
        },
      ],
    },
  ];
  const fetchImpl = async (rawUrl: string | URL | Request, init?: RequestInit) => {
    requests.push({
      url: new URL(String(rawUrl)),
      authorization: new Headers(init?.headers).get("authorization"),
    });
    return jsonResponse(pages[requests.length - 1]);
  };

  const events = await fetchUpcomingEvents("secret-token", {
    fetchImpl: fetchImpl as typeof fetch,
    now: NOW,
  });

  assert.deepEqual(events.map((event) => event.id), ["first", "second"]);
  assert.equal(events[1]?.status, "tentative");
  assert.equal(requests.length, 2);
  assert.equal(requests[0]?.url.searchParams.has("pageToken"), false);
  assert.equal(requests[1]?.url.searchParams.get("pageToken"), "page / two");
  assert.ok(requests.every((request) => request.authorization === "Bearer secret-token"));
  const syncWindow = createGoogleCalendarSyncWindow(NOW);
  assert.equal(
    requests[0]?.url.searchParams.get("timeMin"),
    syncWindow.timeMin.toISOString(),
  );
  assert.equal(
    requests[0]?.url.searchParams.get("timeMax"),
    syncWindow.timeMax.toISOString(),
  );
  assert.equal(
    requests[0]?.url.searchParams.get("timeZone"),
    "Europe/Chisinau",
  );
});

test("provider bounds and projection use the same complete Chisinau days across DST", async () => {
  const nearUtcDayBoundary = new Date("2026-09-14T22:30:00.000Z");
  const window = createGoogleCalendarSyncWindow(nearUtcDayBoundary);
  assert.equal(window.dates.length, 91);
  assert.equal(window.dates[0], "2026-09-15");
  assert.equal(window.dates.at(-1), "2026-12-14");
  assert.equal(window.timeMin.toISOString(), "2026-09-14T21:00:00.000Z");
  assert.equal(window.timeMax.toISOString(), "2026-12-14T22:00:00.000Z");
  assert.equal(
    window.timeMax.getTime() - window.timeMin.getTime(),
    91 * 24 * 60 * 60 * 1_000 + 60 * 60 * 1_000,
    "the complete-day range must include the autumn DST hour",
  );

  const requestedUrls: URL[] = [];
  const fetchImpl = async (rawUrl: string | URL | Request) => {
    requestedUrls.push(new URL(String(rawUrl)));
    return jsonResponse({ items: [] });
  };
  await fetchUpcomingEvents("secret", {
    fetchImpl: fetchImpl as typeof fetch,
    window,
  });
  assert.equal(
    requestedUrls[0]?.searchParams.get("timeMin"),
    window.timeMin.toISOString(),
  );
  assert.equal(
    requestedUrls[0]?.searchParams.get("timeMax"),
    window.timeMax.toISOString(),
  );
});

test("a mismatched provider boundary is rejected before any request", async () => {
  const valid = createGoogleCalendarSyncWindow(NOW);
  let requests = 0;
  await assert.rejects(
    fetchUpcomingEvents("secret", {
      fetchImpl: (async () => {
        requests += 1;
        return jsonResponse({ items: [] });
      }) as typeof fetch,
      window: {
        ...valid,
        timeMax: new Date(valid.timeMax.getTime() - 1),
      },
    }),
    /bounds do not match/i,
  );
  assert.equal(requests, 0);
});

test("repeated or excessive pagination rejects the complete pull", async () => {
  let calls = 0;
  const repeatedTokenFetch = async () => {
    calls += 1;
    return jsonResponse({ items: [], nextPageToken: "repeat" });
  };
  await assert.rejects(
    fetchUpcomingEvents("secret", {
      fetchImpl: repeatedTokenFetch as typeof fetch,
      now: NOW,
    }),
    /repeated page token/i,
  );
  assert.equal(calls, 2);

  const endlessFetch = async () =>
    jsonResponse({ items: [], nextPageToken: crypto.randomUUID() });
  await assert.rejects(
    fetchUpcomingEvents("secret", {
      fetchImpl: endlessFetch as typeof fetch,
      now: NOW,
      maxPages: 2,
    }),
    /exceeded 2 pages/i,
  );
});

test("malformed provider collections reject instead of clearing the projection", async () => {
  const malformedFetch = async () =>
    jsonResponse({ items: { unexpected: true } });
  await assert.rejects(
    fetchUpcomingEvents("secret", {
      fetchImpl: malformedFetch as typeof fetch,
      now: NOW,
    }),
    /invalid events collection/i,
  );
});

test("timed events use an exclusive day boundary across midnight", async () => {
  const fetchImpl = async () => jsonResponse({
    items: [
      {
        id: "evening",
        start: { dateTime: "2026-09-20T18:00:00+03:00" },
        end: { dateTime: "2026-09-20T22:00:00+03:00" },
      },
      {
        id: "overnight",
        start: { dateTime: "2026-09-20T23:00:00+03:00" },
        end: { dateTime: "2026-09-21T02:00:00+03:00" },
      },
      {
        id: "midnight-end",
        start: { dateTime: "2026-09-20T23:00:00+03:00" },
        end: { dateTime: "2026-09-21T00:00:00+03:00" },
      },
    ],
  });
  const events = await fetchUpcomingEvents("secret", {
    fetchImpl: fetchImpl as typeof fetch,
    now: NOW,
  });
  const days = new Map(
    events.map((event) => [event.id, expandDays(event.start, event.end)]),
  );
  assert.deepEqual(days.get("evening"), ["2026-09-20"]);
  assert.deepEqual(days.get("overnight"), ["2026-09-20", "2026-09-21"]);
  assert.deepEqual(days.get("midnight-end"), ["2026-09-20"]);
});
