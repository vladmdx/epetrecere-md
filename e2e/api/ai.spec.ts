import { test, expect, request as pwRequest } from "@playwright/test";

// AI-01 / AI-02 — Artist AI assistant reachability.
//
// The AI endpoints fan out to Anthropic Claude. This suite verifies the
// contract: with a valid ANTHROPIC_API_KEY set on Vercel, the routes return
// either 200 (successful completion) or 400 (validation failure); without
// the key they return 503 "not configured". The spec adapts to whichever
// environment we're hitting so it always provides a signal.

const BASE = process.env.E2E_BASE_URL || "https://epetrecere.md";

test.describe("AI assistant reachability (AI-01 / AI-02)", () => {
  test("AI-02: POST /api/ai/generate responds with 200, 400, or 503", async () => {
    const req = await pwRequest.newContext({ baseURL: BASE });
    const res = await req.post("/api/ai/generate", {
      data: {
        type: "description",
        name: "Test Artist",
        category: "dj",
        description: "Short test description.",
        language: "ro",
      },
    });
    expect([200, 400, 503]).toContain(res.status());

    if (res.status() === 200) {
      const json = await res.json();
      expect(json.result).toBeTruthy();
    } else if (res.status() === 503) {
      const json = await res.json();
      // Either no Anthropic key OR Anthropic itself errored — both map to
      // a 503 in this route. Body check is best-effort.
      expect(json).toBeTruthy();
    }
  });

  test("AI-01: POST /api/ai/chat responds with 200, 400, or 503", async () => {
    const req = await pwRequest.newContext({ baseURL: BASE });
    const res = await req.post("/api/ai/chat", {
      data: {
        context: "vendor",
        messages: [
          { role: "user", content: "Cât e ora?" },
        ],
      },
    });
    expect([200, 400, 503]).toContain(res.status());
  });
});
