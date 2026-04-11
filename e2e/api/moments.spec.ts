import { test, expect, request as pwRequest } from "@playwright/test";
import { CLIENT_STATE } from "../helpers/paths";
import { sql, getTestUsers } from "../helpers/db";

// MOM-01 / MOM-02 — Event Moments guest-upload + live slideshow flow.
//
//   1. Client creates an event plan
//   2. Client enables Moments on it → slug minted
//   3. Guest POSTs a photo to /api/moments/{slug} (no auth)
//   4. Public GET /api/moments/{slug} includes the new photo
//   5. Slideshow page (`/moments/{slug}/slideshow`) returns 200
//   6. Teardown removes the plan + photos

const BASE = process.env.E2E_BASE_URL || "https://epetrecere.md";

test.describe.serial("Event Moments (MOM-01 / MOM-02)", () => {
  let planId: number;
  let slug: string;
  let clientDbId: string;

  test.beforeAll(async () => {
    const { client } = await getTestUsers();
    clientDbId = client.id as string;
  });

  test.afterAll(async () => {
    if (planId) {
      await sql`delete from event_photos where plan_id = ${planId}`;
      await sql`delete from checklist_items where plan_id = ${planId}`;
      await sql`delete from event_plans where id = ${planId}`;
    }
  });

  test("1. client creates an event plan", async () => {
    const req = await pwRequest.newContext({
      baseURL: BASE,
      storageState: CLIENT_STATE,
    });
    const res = await req.post("/api/event-plans", {
      data: {
        title: "E2E Moments Test",
        eventType: "nunta",
        eventDate: "2028-06-15",
        location: "Chișinău",
        guestCountTarget: 50,
      },
    });
    expect(res.status(), await res.text()).toBe(201);
    const json = await res.json();
    planId = json.plan.id;
    expect(json.plan.userId).toBe(clientDbId);
  });

  test("2. client enables Moments → slug minted", async () => {
    const req = await pwRequest.newContext({
      baseURL: BASE,
      storageState: CLIENT_STATE,
    });
    const res = await req.post(`/api/event-plans/${planId}/moments`);
    expect(res.status(), await res.text()).toBe(200);
    const json = await res.json();
    expect(json.enabled).toBe(true);
    expect(typeof json.slug).toBe("string");
    slug = json.slug;
  });

  test("3. guest POSTs a photo anonymously → event_photos row created", async () => {
    const req = await pwRequest.newContext({ baseURL: BASE });
    const res = await req.post(`/api/moments/${slug}`, {
      data: {
        url: "https://example.com/e2e-photo.jpg",
        guestName: "E2E Guest",
        guestMessage: "Test upload",
      },
    });
    expect(res.status(), await res.text()).toBe(201);
    const json = await res.json();
    expect(typeof json.id).toBe("number");

    const [row] = await sql`
      select guest_name, guest_message, source, is_approved
      from event_photos where id = ${json.id}
    `;
    expect(row.guest_name).toBe("E2E Guest");
    expect(row.source).toBe("guest");
    expect(row.is_approved).toBe(true); // auto-approve for live slideshow
  });

  test("4. public GET /api/moments/{slug} returns the new photo", async () => {
    const req = await pwRequest.newContext({ baseURL: BASE });
    const res = await req.get(`/api/moments/${slug}`);
    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(Array.isArray(json.photos)).toBe(true);
    expect(json.photos.length).toBeGreaterThan(0);
    expect(json.photos[0].guestName).toBe("E2E Guest");
  });

  test("5. slideshow page returns 200", async () => {
    const req = await pwRequest.newContext({ baseURL: BASE });
    const res = await req.get(`/moments/${slug}/slideshow`);
    expect(res.status()).toBe(200);
  });

  test("6. unknown slug returns 404", async () => {
    const req = await pwRequest.newContext({ baseURL: BASE });
    const res = await req.get(`/api/moments/nonexistent-slug-xyz`);
    expect(res.status()).toBe(404);
  });
});
