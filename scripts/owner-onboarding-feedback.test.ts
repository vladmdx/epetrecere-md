import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { venueFormValidationMessage, venueReviewLabel } from "../src/lib/partner/onboarding-feedback";
import { plainText } from "../src/lib/content/plain-text";

const valid = { organizationId: 3, name: "DEMO local", phone: "+37369123456", city: "Chișinău", address: "Adresă DEMO 1" };

test("invalid venue phone is explained before freezing an idempotent request", () => {
  assert.match(venueFormValidationMessage({ ...valid, phone: "" })!, /telefon/);
  assert.match(venueFormValidationMessage({ ...valid, phone: "+373123" })!, /8 cifre/);
  assert.equal(venueFormValidationMessage(valid), null);
  assert.match(venueFormValidationMessage({ ...valid, name: "A", address: "X" })!, /Numele.*Adresa/);
});

test("pending halls distinguish submitted venues from drafts", () => {
  assert.equal(venueReviewLabel(false, ["draft"]), "draft");
  assert.equal(venueReviewLabel(false, ["pending", "draft"]), "în așteptarea aprobării");
  assert.equal(venueReviewLabel(true, ["active", "pending"]), "activ · săli în aprobare");
  assert.equal(venueReviewLabel(true, ["active"]), "activ");
  assert.equal(venueReviewLabel(false, ["rejected"]), "necesită corectări");
});

test("onboarding does not display raw rich-text markup and offers the actual hall editor", () => {
  assert.equal(plainText("<p>DEMO <strong>TEST</strong> &amp; sală</p>"), "DEMO TEST & sală");
  const source = readFileSync("src/app/[locale]/(vendor)/dashboard/venue-onboarding/multi-hall-client.tsx", "utf8");
  assert.match(source, /value=\{plainText\(venue.descriptionRo\)\}/);
  assert.match(source, /value=\{plainText\(venue.descriptionRo\)\} onChange=\{\(e\) => setVenue/);
  assert.match(source, /if \(venueId \|\| !hasPendingVenueCreate\)/);
  const save = source.slice(source.indexOf("async function saveVenue()"));
  assert.ok(save.indexOf("venueFormValidationMessage(") < save.indexOf("persistPendingVenueCreateRequest("));
  assert.equal((source.match(/href=\{`\/dashboard\/locatii\/\$\{venueId\}\/sali\/\$\{hallId\}`\}/g) ?? []).length, 2);
  assert.match(source, /role="alert"/);
});

test("saving organization retains the selected venue and hall retry without contaminating new-venue intent", () => {
  const source = readFileSync("src/app/[locale]/(vendor)/dashboard/venue-onboarding/multi-hall-client.tsx", "utf8");
  const saveOrg = source.slice(source.indexOf("async function saveOrg()"), source.indexOf("async function saveVenue()"));
  const canonicalization = saveOrg.slice(saveOrg.indexOf("const canonical = new URLSearchParams"), saveOrg.indexOf("router.replace(venueOnboardingUrl(locale, canonical))"));
  assert.ok(canonicalization.length > 0);
  // Execute the production URL construction, not a duplicated test implementation.
  const build = new Function("savedOrganizationId", "venueId", "createIntent", "venueNeedsAttachment", "hallCreateRequestId", "createRequestId", `${canonicalization} return canonical;`);
  assert.equal(build(3, 31, false, false, null, null).toString(), "organizationId=3&venueId=31");
  assert.equal(build(3, 30, false, false, "hall-retry", null).toString(), "organizationId=3&venueId=30&hallCreateRequestId=hall-retry");
  assert.equal(build(3, null, false, false, null, null).toString(), "organizationId=3");
  assert.equal(build(3, 31, true, false, "stale-hall", "venue-retry").toString(), "organizationId=3&intent=create&createRequestId=venue-retry");
  assert.equal(build(3, 31, false, true, null, null).toString(), "organizationId=3&venueId=31");
});
