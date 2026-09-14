import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

const editor = readFileSync("src/components/vendor/hall-editor.tsx", "utf8");
const collectionRoute = readFileSync("src/app/api/venues/[id]/halls/route.ts", "utf8");
const itemRoute = readFileSync("src/app/api/venues/[id]/halls/[hallId]/route.ts", "utf8");

describe("Hall editor Phase 3 completeness", () => {
  test("maps every commercial, schedule, facility, menu, and translation field", () => {
    for (const field of [
      "basePrice",
      "minimumOrder",
      "currency",
      "depositValue",
      "facilities",
      "workingHours",
      "bufferMinutes",
      "bookingTermsRo",
      "bookingTermsRu",
      "bookingTermsEn",
      "inheritMenu",
      "menuSetIds",
    ]) {
      assert.match(editor, new RegExp(`${field}:`), `${field} must be mapped into the Hall payload`);
    }
    for (const type of ["banquet", "theatre", "classroom", "cocktail", "u_shape", "custom"]) {
      assert.match(editor, new RegExp(`\\b${type}\\b`), `${type} seating must be represented`);
    }
    assert.match(editor, /labelRo: row\.labelRo/);
    assert.match(editor, /labelRu: row\.labelRu/);
    assert.match(editor, /labelEn: row\.labelEn/);
    assert.match(editor, /notesRo: row\.notesRo/);
    assert.match(editor, /notesRu: row\.notesRu/);
    assert.match(editor, /notesEn: row\.notesEn/);
  });

  test("uploads images through the authenticated upload endpoint and retains partial success", () => {
    assert.match(editor, /const MAX_HALL_IMAGES = 20/);
    assert.match(editor, /const MAX_HALL_IMAGE_BYTES = 10 \* 1024 \* 1024/);
    assert.match(editor, /fetch\("\/api\/upload", \{ method: "POST", body: formData \}\)/);
    assert.match(editor, /formData\.append\("folder", "venues"\)/);
    assert.match(editor, /nextUrls = \[\.\.\.nextUrls, data\.url\]/);
    assert.match(editor, /imaginile reușite au fost păstrate/);
    assert.doesNotMatch(editor, /imageUrlsText/);
    assert.doesNotMatch(editor, /câte un URL pe linie/);
  });

  test("only dirty child collections enter edit PATCH payloads", () => {
    const patchBranch = editor.slice(
      editor.indexOf("const { seating, imageUrls, inheritMenu, menuSetIds"),
      editor.indexOf("const saveToken", editor.indexOf("const { seating, imageUrls, inheritMenu, menuSetIds")),
    );
    assert.match(patchBranch, /if \(seatingDirty\) payload\.seating = seating/);
    assert.match(patchBranch, /if \(imagesDirty\) payload\.imageUrls = imageUrls/);
    assert.match(patchBranch, /if \(menuDirty\)/);
    assert.match(patchBranch, /payload\.inheritMenu = inheritMenu/);
    assert.match(patchBranch, /payload\.menuSetIds = menuSetIds/);
  });

  test("menu choices are scoped after venue or Hall authorization", () => {
    const collectionGet = collectionRoute.slice(
      collectionRoute.indexOf("export async function GET"),
      collectionRoute.indexOf("export async function POST"),
    );
    assert.match(collectionGet, /requireVenueCapability\(venueId, "view_private"\)/);
    assert.ok(
      collectionGet.indexOf("requireVenueCapability") < collectionGet.indexOf("from(venueMenuSets)"),
      "collection menu query must run only after authorization",
    );
    assert.match(collectionGet, /eq\(venueMenuSets\.venueId, venueId\)/);

    const itemGet = itemRoute.slice(
      itemRoute.indexOf("export async function GET"),
      itemRoute.indexOf("export async function PATCH"),
    );
    assert.match(itemGet, /requireHallAccess\(hallId, "staff"\)/);
    assert.ok(
      itemGet.indexOf("requireHallAccess") < itemGet.indexOf("from(venueMenuSets)"),
      "item menu query must run only after Hall authorization",
    );
    assert.match(itemGet, /eq\(venueMenuSets\.venueId, access\.venueId\)/);
  });

  test("active Halls remain editable while pending and terminal states are blocked", () => {
    assert.match(editor, /!\["draft", "rejected", "active"\]\.includes\(hallStatus\)/);
    assert.match(editor, /Sala este activă\. O modificare a datelor publice o va muta în draft/);
    assert.doesNotMatch(editor, /hallStatus === "pending" \|\| hallStatus === "active"/);
  });
});
