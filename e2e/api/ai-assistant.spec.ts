// AI Assistant + AI suggestion + AI venue description endpoints (spec 10).

import { test, expect, request } from "@playwright/test";

test.describe("AI endpoints — auth + validation", () => {
  test("POST /api/ai/venue-assistant anonymous → 401", async ({ baseURL }) => {
    const ctx = await request.newContext({ baseURL, ignoreHTTPSErrors: true });
    const res = await ctx.post("/api/ai/venue-assistant", {
      data: { messages: [{ role: "user", content: "hi" }] },
    });
    expect(res.status()).toBe(401);
    await ctx.dispose();
  });

  test("POST /api/ai/analytics-suggestion anonymous → 401", async ({
    baseURL,
  }) => {
    const ctx = await request.newContext({ baseURL, ignoreHTTPSErrors: true });
    const res = await ctx.post("/api/ai/analytics-suggestion", {
      data: {
        venueId: 1,
        period: "30d",
        stats: {
          views: 0,
          ctaClicks: 0,
          conversionRate: 0,
          galleryClicks: 0,
          menuClicks: 0,
          rating: null,
          price: null,
          city: null,
          cityAvgPrice: null,
          cityAvgRating: null,
          cityAvgViews: null,
        },
      },
    });
    expect(res.status()).toBe(401);
    await ctx.dispose();
  });

  test("POST /api/ai/venue-description anonymous → 401", async ({
    baseURL,
  }) => {
    const ctx = await request.newContext({ baseURL, ignoreHTTPSErrors: true });
    const res = await ctx.post("/api/ai/venue-description", {
      data: { venueId: 1, lang: "ro", mode: "generate" },
    });
    expect(res.status()).toBe(401);
    await ctx.dispose();
  });

  test("POST /api/venue-menu/scan anonymous → 401", async ({ baseURL }) => {
    const ctx = await request.newContext({ baseURL, ignoreHTTPSErrors: true });
    const res = await ctx.post("/api/venue-menu/scan", {
      data: {
        venueId: 1,
        fileUrl: "https://example.com/menu.jpg",
        mimeType: "image/jpeg",
      },
    });
    expect(res.status()).toBe(401);
    await ctx.dispose();
  });

  test("POST /api/venue-menu/translate anonymous → 401", async ({
    baseURL,
  }) => {
    const ctx = await request.newContext({ baseURL, ignoreHTTPSErrors: true });
    const res = await ctx.post("/api/venue-menu/translate", {
      data: { venueId: 1 },
    });
    expect(res.status()).toBe(401);
    await ctx.dispose();
  });

  test("POST /api/venue-menu/import anonymous → 401", async ({ baseURL }) => {
    const ctx = await request.newContext({ baseURL, ignoreHTTPSErrors: true });
    const res = await ctx.post("/api/venue-menu/import", {
      data: { venueId: 1, categories: [] },
    });
    expect(res.status()).toBe(401);
    await ctx.dispose();
  });
});
