import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { bookingMutationTupleMatches } from "../src/lib/booking/booking-mutation-boundary";

const tuple = {
  clientUserId: "11111111-1111-4111-8111-111111111111",
  artistId: 12,
  venueId: null,
  hallId: null,
};

test("authorization tuple rejects every ownership or vendor reparent race", () => {
  assert.equal(bookingMutationTupleMatches(tuple, tuple), true);
  for (const changed of [
    { ...tuple, clientUserId: null },
    { ...tuple, artistId: 13 },
    { ...tuple, artistId: null },
    { ...tuple, venueId: 40 },
    { ...tuple, hallId: 8 },
  ]) {
    assert.equal(bookingMutationTupleMatches(changed, tuple), false);
  }
});

test("boundary locks live authority and parents before the booking mutation", () => {
  const source = readFileSync(
    "src/lib/booking/booking-mutation-boundary.ts",
    "utf8",
  );
  const transaction = source.indexOf("return db.transaction");
  const legalLocks = source.indexOf("acquireLegalScopeLocks(tx", transaction);
  const actor = source.indexOf("const [actorRow]", legalLocks);
  const availability = source.indexOf(
    "assertVendorAvailableForConfirmation",
    actor,
  );
  const barrier = source.indexOf("acquireBookingConfirmationBarrier", actor);
  const parents = source.indexOf("lockConfirmationVendorParents", barrier);
  const capability = source.indexOf("authorizeExpectedVendor", parents);
  const booking = source.indexOf('.from(bookingRequests)', capability);
  const bookingLock = source.indexOf('.for("update")', booking);
  const tupleCheck = source.indexOf("bookingMutationTupleMatches(current", bookingLock);
  const mutation = source.indexOf("return input.mutate", tupleCheck);

  assert.ok(transaction >= 0 && transaction < legalLocks);
  assert.ok(legalLocks < actor && actor < availability);
  assert.ok(availability < barrier && barrier < parents);
  assert.ok(parents < capability && capability < bookingLock);
  assert.ok(bookingLock < tupleCheck && tupleCheck < mutation);
  assert.match(
    source.slice(actor, barrier),
    /eq\(users\.id, candidateActor\.id\)[\s\S]*eq\(users\.clerkId, input\.clerkId\)[\s\S]*\.for\("update"\)/,
    "the locked actor must still be bound to the authenticated Clerk id",
  );
  assert.match(source, /expectedVenueOrganizationId[\s\S]*acquireLegalScopeLocks/);
  assert.match(source, /venue\.organizationId !== expectedVenueOrganizationId/);
  assert.match(source, /authorizeVenueCapabilityLocked\(/);
  assert.match(source, /\.from\(partnerOrganizations\)[\s\S]*\.for\("update"\)/);
  assert.ok(
    source.indexOf("preflightMutationAccess(")
      < source.indexOf("return db.transaction"),
    "unauthorized actors must be rejected before availability work",
  );
  assert.match(source, /authorizeVenueCapability\(/);
});

test("every booking action enters the boundary before mutation or effects", () => {
  const route = readFileSync(
    "src/app/api/booking-requests/[id]/route.ts",
    "utf8",
  );
  const actions = [
    "accept",
    "reject",
    "client_confirm",
    "venue_confirm",
    "cancel",
    "complete",
    "vendor_cancel",
    "set_paid",
    "propose_price",
  ];
  for (const [index, action] of actions.entries()) {
    const start = route.indexOf(`action === "${action}"`);
    const endAction = actions[index + 1];
    const fallbackEnd = route.indexOf("} else {", start);
    const end = endAction
      ? route.indexOf(`action === "${endAction}"`, start)
      : fallbackEnd;
    const branch = route.slice(start, end > start ? end : undefined);
    assert.match(
      branch,
      /withBookingMutationBoundary\(\{/,
      `${action} bypasses the canonical boundary`,
    );
  }

  const clientConfirm = route.slice(
    route.indexOf('action === "client_confirm"'),
    route.indexOf('action === "venue_confirm"'),
  );
  assert.ok(
    clientConfirm.indexOf("withBookingMutationBoundary")
      < clientConfirm.indexOf("casClientConfirm(executor"),
  );
  assert.ok(
    clientConfirm.indexOf("withBookingMutationBoundary")
      < clientConfirm.indexOf("persistConfirmationEffects(executor"),
  );

  const cancel = route.slice(
    route.indexOf('action === "cancel"'),
    route.indexOf('action === "complete"'),
  );
  assert.match(cancel, /confirmationBarrier: true/);
  assert.match(cancel, /clientCancelBooking\(current\.id, executor\)/);

  const setPaid = route.slice(
    route.indexOf('action === "set_paid"'),
    route.indexOf('action === "propose_price"'),
  );
  assert.match(setPaid, /venueCapability: "manage_financials"/);
  assert.match(setPaid, /casSetPaid\([\s\S]*executor/);

  const propose = route.slice(
    route.indexOf('action === "propose_price"'),
    route.indexOf("} else {", route.indexOf('action === "propose_price"')),
  );
  assert.match(propose, /venueCapability: "manage_bookings"/);
  assert.match(propose, /executor[\s\S]*\.update\(bookingRequests\)/);
  assert.match(route, /priceProposalPrincipal = result\.principal/);
});

test("vendor transitions are vendor-only and replay inside the same boundary", () => {
  const route = readFileSync(
    "src/app/api/booking-requests/[id]/route.ts",
    "utf8",
  );
  const vendorActions = [
    ["accept", "reject"],
    ["reject", "client_confirm"],
    ["venue_confirm", "cancel"],
    ["complete", "vendor_cancel"],
    ["vendor_cancel", "set_paid"],
  ] as const;
  for (const [action, next] of vendorActions) {
    const branch = route.slice(
      route.indexOf(`action === "${action}"`),
      route.indexOf(`action === "${next}"`),
    );
    assert.match(branch, /access: \{ mode: "vendor", venueCapability: "manage_bookings" \}/);
  }

  const venueConfirm = route.slice(
    route.indexOf('action === "venue_confirm"'),
    route.indexOf('action === "cancel"'),
  );
  assert.match(venueConfirm, /confirmationBarrier: true/);
  assert.ok(
    venueConfirm.indexOf("withBookingMutationBoundary")
      < venueConfirm.indexOf("persistConfirmationEffects(executor"),
  );
  assert.doesNotMatch(route, /requireBookingVendorAccess/);
});

test("new client commitments reject an erased or inactive vendor", () => {
  const route = readFileSync(
    "src/app/api/booking-requests/[id]/route.ts",
    "utf8",
  );
  const clientConfirm = route.slice(
    route.indexOf('action === "client_confirm"'),
    route.indexOf('action === "venue_confirm"'),
  );
  const propose = route.slice(
    route.indexOf('action === "propose_price"'),
    route.indexOf("} else {", route.indexOf('action === "propose_price"')),
  );
  assert.match(clientConfirm, /requireLiveVendor: true/);
  assert.match(
    clientConfirm,
    /current\.status === "accepted"[\s\S]*current\.venueId[\s\S]*current\.clientConfirmedAt/,
  );
  assert.match(propose, /requireLiveVendor: true/);

  const boundary = readFileSync(
    "src/lib/booking/booking-mutation-boundary.ts",
    "utf8",
  );
  assert.match(boundary, /!artist\?\.isActive \|\| !artist\.userId/);
  assert.match(
    boundary,
    /!venue\?\.isActive[\s\S]*venue\.organizationId !== expectedVenueOrganizationId[\s\S]*venue\.organizationId == null && venue\.userId == null/,
  );
  assert.match(boundary, /ORG_STATUSES_ALLOWING_ACCESS\.includes/);
  assert.match(
    boundary,
    /if \(input\.requireLiveVendor && expectedPrincipal === "client"\)/,
  );
});

test("past-date checks use the booking timezone and completion persists effects atomically", () => {
  const route = readFileSync(
    "src/app/api/booking-requests/[id]/route.ts",
    "utf8",
  );
  assert.match(
    route,
    /localDateInZone\([\s\S]*booking\.timezone \|\| DEFAULT_VENUE_TZ/,
  );
  const complete = route.slice(
    route.indexOf('action === "complete"'),
    route.indexOf('action === "vendor_cancel"'),
  );
  assert.match(complete, /persistConfirmationEffects\(executor, row\)/);
  assert.doesNotMatch(route, /function raiseCommission|raiseCommission\(/);
});

test("venue confirmation validates and inserts one transaction-bound commission snapshot", () => {
  const route = readFileSync(
    "src/app/api/booking-requests/[id]/route.ts",
    "utf8",
  );
  const venueConfirm = route.slice(
    route.indexOf('action === "venue_confirm"'),
    route.indexOf('action === "cancel"'),
  );
  const boundary = venueConfirm.indexOf("withBookingMutationBoundary");
  const rules = venueConfirm.indexOf("getCommissionRules(executor)", boundary);
  const compute = venueConfirm.indexOf("computeCommission", rules);
  const persist = venueConfirm.indexOf("persistConfirmationEffects(executor, row", compute);
  assert.ok(boundary >= 0 && boundary < rules);
  assert.ok(rules < compute && compute < persist);
  assert.match(
    venueConfirm.slice(persist),
    /commissionRules,[\s\S]*requireCommission: true/,
  );

  const service = readFileSync("src/lib/commissions/service.ts", "utf8");
  assert.match(
    service,
    /rulesSnapshot \?\? await getCommissionRules\(executor\)/,
  );
  assert.match(
    service,
    /if \(created\) return created\.id;[\s\S]*\.from\(commissions\)[\s\S]*bookingRequestId/,
  );

  const effects = readFileSync(
    "src/lib/booking/confirmation-persist.ts",
    "utf8",
  );
  assert.match(effects, /options\.commissionRules/);
  assert.match(
    effects,
    /options\.requireCommission && commissionId == null[\s\S]*CommissionRequiredError/,
  );
});

test("client cancellation can reuse the already-authorized transaction", () => {
  const transitions = readFileSync(
    "src/lib/booking/booking-transitions.ts",
    "utf8",
  );
  const helper = transitions.indexOf("async function clientCancelBookingWithExecutor");
  const barrier = transitions.indexOf("acquireBookingConfirmationBarrier", helper);
  const status = transitions.indexOf("casUpdateBookingStatus", barrier);
  const effects = transitions.indexOf("cancelBookingConfirmationEffects", status);
  assert.ok(helper >= 0 && helper < barrier);
  assert.ok(barrier < status && status < effects);
  assert.match(
    transitions,
    /if \(executor\) return clientCancelBookingWithExecutor\(executor, bookingId\)/,
  );
});

test("vendor cancellation can reuse the already-authorized transaction", () => {
  const transitions = readFileSync(
    "src/lib/booking/booking-transitions.ts",
    "utf8",
  );
  assert.match(
    transitions,
    /if \(executor\) \{[\s\S]*return vendorCancelBookingWithExecutor\(executor, bookingId, reply\)/,
  );
});
