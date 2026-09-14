import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

import {
  hallCreateSchema,
  hallPatchSchema,
} from "../src/lib/partner/validation";
import { normalizeHallCreateRequestId } from "../src/lib/partner/onboarding-create-request";

const REQUEST_ID = "a0ebc785-9f34-4d01-a2d0-a235f332b1c4";

describe("Hall create/PATCH contracts", () => {
  test("create requires a durable UUID and applies create-only defaults", () => {
    assert.equal(hallCreateSchema.safeParse({ venueId: 7, nameRo: "Sala" }).success, false);
    assert.equal(hallCreateSchema.safeParse({
      venueId: 7,
      hallCreateRequestId: "not-a-uuid",
      nameRo: "Sala",
    }).success, false);

    const parsed = hallCreateSchema.parse({
      venueId: 7,
      hallCreateRequestId: REQUEST_ID,
      nameRo: "Sala",
    });
    assert.equal(parsed.inheritMenu, true);
    assert.deepEqual(parsed.imageUrls, []);
    assert.deepEqual(parsed.seating, []);
    assert.deepEqual(parsed.menuSetIds, []);
    assert.equal(hallCreateSchema.safeParse({
      venueId: 7,
      hallCreateRequestId: REQUEST_ID,
      nameRo: "Sala",
      depositType: "percent",
    }).success, false);
    assert.equal(hallCreateSchema.safeParse({
      venueId: 7,
      hallCreateRequestId: REQUEST_ID,
      nameRo: "Sala",
      currency: "1$!",
    }).success, false);
  });

  test("PATCH rejects empty input and never injects child defaults", () => {
    assert.equal(hallPatchSchema.safeParse({}).success, false);

    const scalar = hallPatchSchema.parse({ nameRo: "Sala renovată" });
    assert.deepEqual(scalar, { nameRo: "Sala renovată" });
    assert.equal(Object.hasOwn(scalar, "imageUrls"), false);
    assert.equal(Object.hasOwn(scalar, "seating"), false);
    assert.equal(Object.hasOwn(scalar, "menuSetIds"), false);

    assert.deepEqual(hallPatchSchema.parse({ imageUrls: [] }), { imageUrls: [] });
    assert.deepEqual(hallPatchSchema.parse({ seating: [] }), { seating: [] });
  });

  test("menu inheritance has one coherent representation", () => {
    assert.equal(hallPatchSchema.safeParse({ menuSetIds: [1] }).success, false);
    assert.equal(hallPatchSchema.safeParse({ inheritMenu: true, menuSetIds: [1] }).success, false);
    assert.equal(hallPatchSchema.safeParse({ inheritMenu: false, menuSetIds: [] }).success, false);
    assert.deepEqual(
      hallPatchSchema.parse({ inheritMenu: true, menuSetIds: [] }),
      { inheritMenu: true, menuSetIds: [] },
    );
    assert.deepEqual(
      hallPatchSchema.parse({ inheritMenu: false, menuSetIds: [2, 5] }),
      { inheritMenu: false, menuSetIds: [2, 5] },
    );
  });

  test("working hours are strict HH:mm intervals with open before close", () => {
    assert.equal(hallPatchSchema.safeParse({
      workingHours: { mon: { open: "09:00", close: "17:30" } },
    }).success, true);
    for (const workingHours of [
      { mon: { open: "9:00", close: "17:00" } },
      { mon: { open: "17:00", close: "17:00" } },
      { mon: { open: "18:00", close: "17:00" } },
      { monday: { open: "09:00", close: "17:00" } },
    ]) {
      assert.equal(hallPatchSchema.safeParse({ workingHours }).success, false);
    }
  });

  test("normalizes only valid Hall creation UUIDs", () => {
    assert.equal(normalizeHallCreateRequestId(REQUEST_ID.toUpperCase()), REQUEST_ID);
    assert.equal(normalizeHallCreateRequestId("not-a-uuid"), null);
  });
});

describe("Hall writer source invariants", () => {
  const service = readFileSync("src/lib/partner/hall-writes.ts", "utf8");
  const collectionRoute = readFileSync("src/app/api/venues/[id]/halls/route.ts", "utf8");
  const itemRoute = readFileSync("src/app/api/venues/[id]/halls/[hallId]/route.ts", "utf8");
  const editor = readFileSync("src/components/vendor/hall-editor.tsx", "utf8");
  const onboarding = readFileSync(
    "src/app/[locale]/(vendor)/dashboard/venue-onboarding/multi-hall-client.tsx",
    "utf8",
  );

  test("POST/PATCH delegate actor-scoped authorization to the locked service", () => {
    const postHandler = collectionRoute.slice(collectionRoute.indexOf("export async function POST"));
    const patchStart = itemRoute.indexOf("export async function PATCH");
    const patchHandler = itemRoute.slice(patchStart, itemRoute.indexOf("export async function DELETE"));
    assert.match(postHandler, /createHallDraft\(actor\.id,/);
    assert.match(patchHandler, /patchHallDraft\(actor\.id, venueId, hallId, body\)/);
    assert.doesNotMatch(postHandler, /requireVenueCapability/);
    assert.doesNotMatch(patchHandler, /requireHallAccess/);
    assert.match(service, /authorizeVenueCapabilityLocked\([^]*"manage_halls"/);
    assert.match(service, /if \(!isMultiHallEnabled\(\)\) return failure\(404, "FEATURE_DISABLED"\)/);
  });

  test("all Hall children and legacy capacity use the transaction executor", () => {
    assert.match(service, /replaceHallImages\(\s*executor,/);
    assert.match(service, /replaceHallSeating\(executor,/);
    assert.match(service, /replaceHallMenuSets\(\s*executor,/);
    assert.match(service, /await executor\s*\.update\(venues\)/);
    assert.match(service, /MENU_SET_VENUE_MISMATCH/);
    assert.match(service, /current\.status === "rejected"\s*\? "draft"/);
    assert.match(service, /"HALL_NOT_EDITABLE"/);
  });

  test("UI freezes actor-scoped create payload before URL and POST", () => {
    assert.match(editor, /hallCreateRequestId/);
    assert.match(editor, /useUser\(\)/);
    assert.match(editor, /readPendingHallCreateRequest\(/);
    assert.match(editor, /hasPendingHallCreateRequestSlot\(/);
    assert.match(editor, /newPendingHallCreateRequest\(/);
    assert.match(editor, /persistPendingHallCreateRequest\(/);
    assert.match(editor, /hallCreateRequestPayload\(createRequest\)/);
    assert.match(editor, /clearPendingHallCreateRequest\(/);
    assert.match(editor, /discardPendingHallCreateRequest\(/);
    assert.match(editor, /window\.confirm\(/);
    assert.match(editor, /window\.history\.replaceState/);
    assert.doesNotMatch(editor, /window\.sessionStorage\.setItem/);
    assert.match(editor, /fetch\(`\/api\/venues\/\$\{venueId\}\/halls`\)/);
    assert.match(editor, /candidate\.creationRequestId\.toLowerCase\(\) === effectiveRequestId/);
    assert.match(editor, /actorRef\.current !== actorId/);
    assert.match(editor, /activeIdentityRef\.current !== identity/);
    assert.match(editor, /recoveryEpochRef\.current !== recoveryEpoch/);
    assert.match(editor, /recoveryEpochRef\.current \+= 1/);
    assert.match(editor, /fieldset disabled=\{editorDisabled\}/);
    assert.match(editor, /Payload-ul original lipsește/);
    assert.match(editor, /!createRequest && \(slotOccupied \|\| hallCreateRequestId != null\)/);
    assert.match(editor, /if \(!clearPendingHallCreateRequest\(/);
    assert.match(editor, /Hall load failed/);
    assert.match(editor, /setEditLoadFailed\(true\)/);
    assert.ok(
      editor.indexOf("crypto.randomUUID()") > editor.indexOf("async function save"),
      "a Hall UUID must not exist in the URL before an exact payload can be frozen",
    );
    const save = editor.slice(
      editor.indexOf("async function save"),
      editor.indexOf("if (!actorReady)", editor.indexOf("async function save")),
    );
    assert.ok(
      save.indexOf("persistPendingHallCreateRequest")
        < save.indexOf("window.history.replaceState"),
      "the frozen Hall body must be durable before the UUID enters history",
    );
    assert.ok(
      save.indexOf("window.history.replaceState") < save.indexOf("await fetch"),
      "the Hall UUID must enter history before POST",
    );
    assert.match(editor, /if \(imagesDirty/);
    assert.match(editor, /if \(seatingDirty/);
    assert.match(editor, /if \(menuDirty\)/);
    assert.match(onboarding, /method: hallId \? "PATCH" : "POST"/);
    assert.match(onboarding, /hallCreateRequestId/);
    assert.doesNotMatch(onboarding, /\)\s*\?\?\s*halls\[0\]/);
  });
});
