import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

import { organizationCreateSchema } from "../src/lib/partner/validation";
import {
  clearPendingOrganizationCreateRequest,
  newPendingOrganizationCreateRequest,
  newPendingOrganizationProfileCreateRequest,
  normalizeOrganizationCreateRequestId,
  organizationCreateRequestPayload,
  persistPendingOrganizationCreateRequest,
  readPendingOrganizationCreateRequest,
} from "../src/lib/partner/onboarding-create-request";
import {
  resolveOnboardingFlow,
  type RecoverableOnboardingDraft,
  type RecoverableOnboardingVenue,
} from "../src/lib/partner/onboarding-flow";
import {
  organizationCapabilitiesForRole,
  organizationRoleHasCapability,
} from "../src/lib/partner/organization-dto";

const ORG_KEY = "11111111-1111-4111-8111-111111111111";
const VENUE_KEY = "22222222-2222-4222-8222-222222222222";
const ACTOR_A = "user_actor_a";
const ACTOR_B = "user_actor_b";

function unattachedVenue(id = 91): RecoverableOnboardingVenue {
  return {
    id,
    nameRo: `Legacy ${id}`,
    phone: "+37369000000",
    city: "Chișinău",
    address: "str. Test 1",
  };
}

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
    removeItem(key: string) {
      values.delete(key);
    },
  };
}

function draft(
  id: number,
  venueIds: number[] = [],
  creationRequestId: string | null = null,
): RecoverableOnboardingDraft {
  return {
    organization: {
      id,
      displayName: `Org ${id}`,
      type: "company",
      creationRequestId,
    },
    venues: venueIds.map((venueId) => ({
      id: venueId,
      nameRo: `Venue ${venueId}`,
      onboardingSubmissionId: venueId === 22 ? VENUE_KEY : null,
    })),
  };
}

describe("organization create request", () => {
  test("contract metadata follows manage_legal rather than general org visibility", () => {
    assert.equal(organizationRoleHasCapability("staff", "manage_legal"), false);
    assert.equal(organizationRoleHasCapability("manager", "manage_legal"), false);
    assert.equal(organizationRoleHasCapability("admin", "manage_legal"), false);
    assert.equal(organizationRoleHasCapability("owner", "manage_legal"), true);
    assert.deepEqual(organizationCapabilitiesForRole("admin"), {
      manageVenues: true,
      manageBilling: true,
      manageLegal: false,
      manageMembers: false,
    });
    assert.equal(organizationCapabilitiesForRole("manager").manageVenues, false);
    const route = readFileSync("src/app/api/organizations/[id]/route.ts", "utf8");
    assert.match(
      route,
      /organizationRoleHasCapability\(access\.role, "manage_legal"\)[\s\S]+organizationContractRows/,
    );
  });

  test("uses a distinct required UUID", () => {
    assert.equal(normalizeOrganizationCreateRequestId(ORG_KEY.toUpperCase()), ORG_KEY);
    assert.equal(normalizeOrganizationCreateRequestId("bad"), null);
    assert.equal(organizationCreateSchema.safeParse({ type: "company", displayName: "Acme" }).success, false);
    assert.equal(organizationCreateSchema.safeParse({
      organizationCreateRequestId: ORG_KEY,
      type: "company",
      displayName: "Acme",
    }).success, true);
    assert.equal(organizationCreateSchema.safeParse({
      createRequestId: ORG_KEY,
      type: "company",
      displayName: "Acme",
    }).success, false, "the venue key must not satisfy organization creation");
  });

  test("routes POST and role bootstrap through separate services", () => {
    const organizationRoute = readFileSync("src/app/api/organizations/route.ts", "utf8");
    const selectRoleRoute = readFileSync("src/app/api/auth/select-role/route.ts", "utf8");
    const onboardingClient = readFileSync(
      "src/app/[locale]/(vendor)/dashboard/venue-onboarding/multi-hall-client.tsx",
      "utf8",
    );
    const organizationDashboard = readFileSync(
      "src/components/vendor/organization-dashboard.tsx",
      "utf8",
    );
    assert.match(organizationRoute, /createDraftOrganization\(user, parsed\.data\)/);
    assert.doesNotMatch(organizationRoute, /ensureDraftOrganization\(/);
    assert.match(selectRoleRoute, /bootstrapDraftOrganization\(selected\.user/);
    assert.match(
      selectRoleRoute,
      /error\.code === "ORGANIZATION_SELECTION_REQUIRED"[\s\S]+organizationSelectionRequired: true/,
    );
    const onboardingService = readFileSync("src/lib/partner/onboarding.ts", "utf8");
    assert.match(onboardingService, /venueOnboardingAccountConflict/);
    assert.match(onboardingService, /user\.role === "editor"/);
    assert.match(onboardingService, /throw new OrganizationDraftUpdateError\(accountConflict, 409\)/);
    assert.doesNotMatch(onboardingClient, /drafts\[0\]/);
    assert.match(onboardingService, /const attachingLegacyVenue = existing\.organizationId == null/);
    assert.match(
      onboardingService,
      /reopenLegacyVenueForMultiHallOnboarding[\s\S]+venueHalls\.isLegacyDefault[\s\S]+venueHalls\.status, "pending"/,
    );
    assert.match(onboardingService, /if \(data\.imageUrls !== undefined\)/);
    const legacyAttachService = onboardingService.slice(
      onboardingService.indexOf("export async function attachVenueRoleDraftToOrganization"),
      onboardingService.indexOf("export async function replaceVenueImages"),
    );
    assert.match(legacyAttachService, /reopenLegacyVenueForMultiHallOnboarding\(/);
    assert.match(onboardingClient, /window\.history\.replaceState[\s\S]+fetch\(url/);
    assert.match(onboardingClient, /organizationCreateRequestId/);
    assert.match(onboardingClient, /newPendingOrganizationProfileCreateRequest/);
    assert.match(onboardingClient, /organizationCreateRequestPayload\(request!\)/);
    assert.doesNotMatch(onboardingClient, /isDefinitiveOrganizationCreateFailure/);
    assert.match(onboardingClient, /function discardPendingOrganizationCreate/);
    const onboardingSaveOrg = onboardingClient.slice(
      onboardingClient.indexOf("async function saveOrg"),
      onboardingClient.indexOf("async function saveVenue"),
    );
    assert.ok(
      onboardingSaveOrg.indexOf("persistPendingOrganizationCreateRequest")
        < onboardingSaveOrg.indexOf("window.history.replaceState"),
      "the complete organization body must be frozen before its key enters browser history",
    );
    assert.ok(
      onboardingSaveOrg.indexOf("window.history.replaceState")
        < onboardingSaveOrg.indexOf("fetch(url"),
      "the operation key must be durable in history before POST",
    );
    const requestIdentityStart = onboardingClient.indexOf("useEffect(() => {");
    const requestIdentityEnd = onboardingClient.indexOf(
      "\n\n  useEffect(() => {",
      requestIdentityStart + 1,
    );
    const requestIdentityEffect = onboardingClient.slice(
      requestIdentityStart,
      requestIdentityEnd,
    );
    assert.doesNotMatch(
      requestIdentityEffect,
      /params\.set\("organizationCreateRequestId"/,
      "a URL-less resume must not look like a submitted organization create",
    );
    const actorRestore = onboardingClient.slice(
      onboardingClient.indexOf("Clerk can switch accounts without remounting"),
      onboardingClient.indexOf("if (!venueId || hallId || hallCreateRequestId)"),
    );
    for (const reset of [
      "setOrganizationId(null)",
      "setVenueId(null)",
      "setHallId(null)",
      "setOrg({ ...EMPTY_ORGANIZATION_FORM })",
      "setVenue({ ...EMPTY_VENUE_FORM })",
      "setHall({ ...EMPTY_HALL_FORM })",
    ]) {
      assert.match(actorRestore, new RegExp(reset.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
    assert.match(actorRestore, /setOrganizationCreateRequestId\(presetOrganizationCreateRequestId\)/);
    assert.ok(
      actorRestore.indexOf("setOrg({ ...EMPTY_ORGANIZATION_FORM })")
        < actorRestore.indexOf("setResolvedActorId(actorId)"),
      "switching actors or history keys must clear the previous legal form before restore",
    );
    const chooseOrganization = onboardingClient.slice(
      onboardingClient.indexOf("function chooseOrganization"),
      onboardingClient.indexOf("function chooseVenue"),
    );
    assert.match(chooseOrganization, /setOnboardingLoaded\(false\)/);
    assert.match(chooseOrganization, /setOrganizationId\(nextOrganizationId\)/);
    assert.match(
      onboardingClient,
      /if \(!response\.ok\)[\s\S]+throw new Error\(`Onboarding load failed/,
    );
    assert.match(
      onboardingClient,
      /\.catch\(\(\) => \{[\s\S]+setOnboardingLoaded\(false\)[\s\S]+setOnboardingLoadError\(/,
    );
    assert.doesNotMatch(onboardingClient, /r\.ok \? r\.json\(\) : null/);
    assert.match(
      onboardingClient,
      /draft\.organization\.capabilities\?\.manageVenues === true/,
    );
    assert.match(
      onboardingClient,
      /organizationCapabilities\?\.manageLegal[\s\S]+organizationCapabilities\?\.manageBilling/,
    );
    assert.match(onboardingClient, /if \(!actorReady\)[\s\S]+Loader2/);
    const onboardingRoute = readFileSync("src/app/api/partner/onboarding/route.ts", "utf8");
    assert.match(onboardingRoute, /venue\.organizationId == null/);
    assert.match(onboardingRoute, /unattachedVenues: await Promise\.all/);
    assert.match(onboardingClient, /unattachedVenues,/);
    assert.match(onboardingClient, /resolution\.venueNeedsAttachment/);
    assert.match(onboardingClient, /setVenueNeedsAttachment\(false\)[\s\S]+router\.replace/);
    const createSection = organizationDashboard.slice(
      organizationDashboard.indexOf("async function createOrg"),
      organizationDashboard.indexOf("async function addMember"),
    );
    assert.match(createSection, /readPendingOrganizationCreateRequest\(window\.sessionStorage, actorId\)/);
    assert.match(createSection, /newPendingOrganizationCreateRequest\(displayName, crypto\.randomUUID\(\), actorId\)/);
    assert.match(createSection, /currentRequest\?\.actorId === actorId/);
    assert.doesNotMatch(createSection, /isDefinitiveOrganizationCreateFailure/);
    assert.match(organizationDashboard, /organizationCreateRequest\.current = null/);
    const restoreSection = organizationDashboard.slice(
      organizationDashboard.indexOf("sessionStorage survives refresh/back"),
      organizationDashboard.indexOf("useEffect(() => {\n    const actorId = user?.id;"),
    );
    assert.ok(
      restoreSection.indexOf("organizationCreateRequest.current = null")
        < restoreSection.indexOf("if (!userLoaded || !user?.id) return"),
      "an account switch must clear the previous actor's in-memory operation before restore",
    );
    const actorReloadSection = organizationDashboard.slice(
      organizationDashboard.indexOf("const actorId = userLoaded ? user?.id ?? null : null"),
      organizationDashboard.indexOf("sessionStorage survives refresh/back"),
    );
    for (const reset of [
      "setOrgs([])",
      "selectOrganization(organizationId ?? null)",
    ]) {
      assert.match(
        actorReloadSection,
        new RegExp(reset.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      );
    }
    const selectionHelper = organizationDashboard.slice(
      organizationDashboard.indexOf("const selectOrganization"),
      organizationDashboard.indexOf("const loadList"),
    );
    assert.match(selectionHelper, /selectedRef\.current = nextOrganizationId/);
    assert.match(selectionHelper, /setDetail\(null\)/);
    assert.match(selectionHelper, /setMembers\(\[\]\)/);
    assert.match(organizationDashboard, /actorRef\.current !== actorId/);
    assert.match(organizationDashboard, /selectedRef\.current !== id/);
    assert.match(organizationDashboard, /detailRequestGenerationRef\.current !== requestGeneration/);
    assert.match(organizationDashboard, /detail\?\.organization\.id === selected/);
    assert.match(
      organizationDashboard,
      /actorRef\.current !== actorId \|\| selectedRef\.current !== targetOrganizationId/,
    );
    assert.match(organizationDashboard, /if \(!actorReady \|\| loading\)/);
    assert.match(
      organizationDashboard,
      /detail\.organization\.capabilities\?\.manageVenues === true/,
    );
    assert.ok(
      createSection.indexOf("persistPendingOrganizationCreateRequest")
        < createSection.indexOf('fetch("/api/organizations"'),
      "the exact organization request must be persisted before POST",
    );
    assert.ok(
      createSection.indexOf("selectOrganization(createdOrganizationId)")
        < createSection.indexOf("void loadList(actorId).catch"),
      "a successful POST must be committed in UI state before a fallible list refresh",
    );

    const agreementStep = onboardingClient.slice(
      onboardingClient.indexOf("if (step === 1 && !hasContract)"),
      onboardingClient.indexOf("if (step === 2"),
    );
    assert.match(
      agreementStep,
      /catch \(error\) \{[\s\S]+!isScopeTokenCurrent\(scopeToken\)[\s\S]+setShowAgreementValidation/,
      "a rejected legal preparation from an old actor or organization scope must not contaminate the current UI",
    );

    const roleRedirect = readFileSync(
      "src/app/[locale]/(auth)/auth-redirect/page.tsx",
      "utf8",
    );
    const roleHandler = roleRedirect.slice(
      roleRedirect.indexOf("async function handleRoleSelect"),
      roleRedirect.indexOf("if (checking &&"),
    );
    assert.match(roleHandler, /if \(!roleRes\?\.ok\)[\s\S]+setRoleError[\s\S]+return;/);
    assert.ok(
      roleHandler.indexOf("if (!roleRes?.ok)")
        < roleHandler.indexOf('if (selectedRole === "client")'),
      "ROLE_CONFLICT and every other non-2xx response must stop navigation",
    );
    const checkRoleRoute = readFileSync("src/app/api/auth/check-role/route.ts", "utf8");
    assert.match(checkRoleRoute, /onboardingComplete: dbUser\.onboardingComplete/);
    assert.match(checkRoleRoute, /venueRows\.find\(\(row\) => row\.organizationId == null\)/);
    assert.match(checkRoleRoute, /dbUser\.onboardingComplete && !venueNeedsOrganization/);
    const dashboardScope = readFileSync("src/lib/venues/dashboard-scope.ts", "utf8");
    assert.match(
      dashboardScope,
      /isMultiHallEnabled\(\) && venue\.organizationId == null[\s\S]+dashboard\/venue-onboarding[\s\S]+venueId=/,
    );
    assert.match(
      roleRedirect,
      /data\.hasVenue && !data\.onboardingComplete[\s\S]+dashboard\/venue-onboarding/,
    );
  });

  test("persists the frozen key and normalized payload across refresh/back retries", () => {
    const storage = memoryStorage();
    const request = newPendingOrganizationCreateRequest("  Acme Events  ", ORG_KEY, ACTOR_A);
    assert.deepEqual(request, {
      actorId: ACTOR_A,
      requestId: ORG_KEY,
      displayName: "Acme Events",
      type: "company",
      legalName: null,
      idNumber: null,
      legalAddress: null,
      billingEmail: null,
      billingPhone: null,
    });
    assert.ok(request);
    assert.equal(persistPendingOrganizationCreateRequest(storage, request), true);

    const restoredAfterRefresh = readPendingOrganizationCreateRequest(storage, ACTOR_A);
    assert.deepEqual(restoredAfterRefresh, request);
    assert.equal(readPendingOrganizationCreateRequest(storage, ACTOR_B), null,
      "another signed-in account must not restore this request");
    assert.equal(clearPendingOrganizationCreateRequest(storage, ACTOR_A, VENUE_KEY), false);
    assert.deepEqual(readPendingOrganizationCreateRequest(storage, ACTOR_A), request,
      "a stale response must not clear a newer/different key");

    const replacement = newPendingOrganizationCreateRequest(
      "Second operation",
      VENUE_KEY,
      ACTOR_A,
    );
    assert.ok(replacement);
    assert.equal(
      persistPendingOrganizationCreateRequest(storage, replacement),
      false,
      "an unresolved operation must never be overwritten by another key",
    );
    assert.deepEqual(readPendingOrganizationCreateRequest(storage, ACTOR_A), request);

    assert.equal(clearPendingOrganizationCreateRequest(storage, ACTOR_A, ORG_KEY), true);
    assert.equal(readPendingOrganizationCreateRequest(storage, ACTOR_A), null);
  });

  test("does not report success when storage ignores organization-slot removal", () => {
    const backing = memoryStorage();
    const request = newPendingOrganizationCreateRequest("Acme Events", ORG_KEY, ACTOR_A);
    assert.ok(request);
    assert.equal(persistPendingOrganizationCreateRequest(backing, request), true);
    assert.equal(clearPendingOrganizationCreateRequest({
      getItem: backing.getItem,
      setItem: backing.setItem,
      removeItem: () => undefined,
    }, ACTOR_A, ORG_KEY), false);
    assert.deepEqual(readPendingOrganizationCreateRequest(backing, ACTOR_A), request);
  });

  test("freezes the complete onboarding payload for an exact replay", () => {
    const request = newPendingOrganizationProfileCreateRequest({
      displayName: "  Imperial Events  ",
      type: "sole_trader",
      legalName: "  Imperial ÎI  ",
      idNumber: " 1234567890123 ",
      legalAddress: "  Chișinău, str. Test 1 ",
      billingEmail: " owner@example.test ",
      billingPhone: " +373 69 000 123 ",
    }, ORG_KEY, ACTOR_A);
    assert.ok(request);
    assert.deepEqual(organizationCreateRequestPayload(request), {
      organizationCreateRequestId: ORG_KEY,
      displayName: "Imperial Events",
      type: "sole_trader",
      legalName: "Imperial ÎI",
      idNumber: "1234567890123",
      legalAddress: "Chișinău, str. Test 1",
      billingEmail: "owner@example.test",
      billingPhone: "+373 69 000 123",
    });

    const storage = memoryStorage();
    assert.equal(persistPendingOrganizationCreateRequest(storage, request), true);
    assert.deepEqual(readPendingOrganizationCreateRequest(storage, ACTOR_A), request);
  });
});

describe("pure multi-hall onboarding resolver", () => {
  test("recovers an organization-null legacy venue without silently choosing among organizations", () => {
    const legacy = unattachedVenue();
    const noOrganization = resolveOnboardingFlow({
      drafts: [],
      unattachedVenues: [legacy],
      organizationId: null,
      venueId: null,
      createIntent: false,
      organizationCreateRequestId: null,
      venueCreateRequestId: null,
    });
    assert.equal(noOrganization.kind, "resolved");
    if (noOrganization.kind === "resolved") {
      assert.equal(noOrganization.draft, null);
      assert.equal(noOrganization.venue?.id, legacy.id);
      assert.equal(noOrganization.venueNeedsAttachment, true);
    }

    const oneOrganization = resolveOnboardingFlow({
      drafts: [draft(1)],
      unattachedVenues: [legacy],
      organizationId: null,
      venueId: legacy.id,
      createIntent: false,
      organizationCreateRequestId: null,
      venueCreateRequestId: null,
    });
    assert.equal(oneOrganization.kind, "organization_selection_required");
    if (oneOrganization.kind === "organization_selection_required") {
      assert.deepEqual(oneOrganization.drafts.map((item) => item.organization.id), [1]);
      assert.equal(oneOrganization.venueToAttach?.id, legacy.id);
    }

    const ambiguousOrganization = resolveOnboardingFlow({
      drafts: [draft(1), draft(2)],
      unattachedVenues: [legacy],
      organizationId: null,
      venueId: legacy.id,
      createIntent: false,
      organizationCreateRequestId: null,
      venueCreateRequestId: null,
    });
    assert.equal(ambiguousOrganization.kind, "organization_selection_required");
    if (ambiguousOrganization.kind === "organization_selection_required") {
      assert.equal(ambiguousOrganization.venueToAttach?.id, legacy.id);
      assert.deepEqual(ambiguousOrganization.drafts.map((item) => item.organization.id), [1, 2]);
    }

    const explicitOrganization = resolveOnboardingFlow({
      drafts: [draft(1), draft(2)],
      unattachedVenues: [legacy],
      organizationId: 2,
      venueId: legacy.id,
      createIntent: false,
      organizationCreateRequestId: null,
      venueCreateRequestId: null,
    });
    assert.equal(explicitOrganization.kind, "resolved");
    if (explicitOrganization.kind === "resolved") {
      assert.equal(explicitOrganization.draft?.organization.id, 2);
      assert.equal(explicitOrganization.venueNeedsAttachment, true);
    }
  });

  test("never falls back to the first unattached venue and keeps explicit create separate", () => {
    const ambiguousLegacy = resolveOnboardingFlow({
      drafts: [draft(1)],
      unattachedVenues: [unattachedVenue(91), unattachedVenue(92)],
      organizationId: null,
      venueId: null,
      createIntent: false,
      organizationCreateRequestId: null,
      venueCreateRequestId: null,
    });
    assert.equal(ambiguousLegacy.kind, "unattached_venue_selection_required");

    const explicitCreate = resolveOnboardingFlow({
      drafts: [draft(1)],
      unattachedVenues: [unattachedVenue()],
      organizationId: 1,
      venueId: null,
      createIntent: true,
      organizationCreateRequestId: null,
      venueCreateRequestId: VENUE_KEY,
    });
    assert.equal(explicitCreate.kind, "resolved");
    if (explicitCreate.kind === "resolved") {
      assert.equal(explicitCreate.venue, null);
      assert.equal(explicitCreate.venueNeedsAttachment, false);
    }
  });

  test("keeps the legacy venue identity while an organization create response is ambiguous", () => {
    const legacy = unattachedVenue();
    const pending = resolveOnboardingFlow({
      drafts: [],
      unattachedVenues: [legacy],
      organizationId: null,
      venueId: legacy.id,
      createIntent: false,
      organizationCreateRequestId: ORG_KEY,
      venueCreateRequestId: null,
    });
    assert.equal(pending.kind, "organization_create_pending");
    if (pending.kind === "organization_create_pending") {
      assert.equal(pending.requestId, ORG_KEY);
      assert.equal(pending.venueToAttach?.id, legacy.id);
    }
  });

  test("an explicit new legal holder keeps the legacy venue despite existing organizations", () => {
    const legacy = unattachedVenue();
    for (const drafts of [[draft(1)], [draft(1), draft(2)]]) {
      const result = resolveOnboardingFlow({
        drafts,
        unattachedVenues: [legacy],
        organizationId: null,
        venueId: legacy.id,
        createIntent: false,
        createOrganizationIntent: true,
        organizationCreateRequestId: null,
        venueCreateRequestId: null,
      });
      assert.equal(result.kind, "resolved");
      if (result.kind === "resolved") {
        assert.equal(result.draft, null);
        assert.equal(result.venue?.id, legacy.id);
        assert.equal(result.venueNeedsAttachment, true);
      }
    }

    const recovered = resolveOnboardingFlow({
      drafts: [draft(1), draft(2, [], ORG_KEY)],
      unattachedVenues: [legacy],
      organizationId: null,
      venueId: legacy.id,
      createIntent: false,
      createOrganizationIntent: true,
      organizationCreateRequestId: ORG_KEY,
      venueCreateRequestId: null,
    });
    assert.equal(recovered.kind, "resolved");
    if (recovered.kind === "resolved") {
      assert.equal(recovered.draft?.organization.id, 2);
      assert.equal(recovered.venue?.id, legacy.id);
      assert.equal(recovered.recoveredOrganization, true);
      assert.equal(recovered.venueNeedsAttachment, true);
    }
  });

  test("preserves an authorized legacy venue when its URL organization was revoked", () => {
    const legacy = unattachedVenue();
    const noRemainingOrganization = resolveOnboardingFlow({
      drafts: [],
      unattachedVenues: [legacy],
      organizationId: 99,
      venueId: legacy.id,
      createIntent: false,
      organizationCreateRequestId: null,
      venueCreateRequestId: null,
    });
    assert.equal(noRemainingOrganization.kind, "resolved");
    if (noRemainingOrganization.kind === "resolved") {
      assert.equal(noRemainingOrganization.draft, null);
      assert.equal(noRemainingOrganization.venue?.id, legacy.id);
      assert.equal(noRemainingOrganization.venueNeedsAttachment, true);
    }

    const oneRemainingOrganization = resolveOnboardingFlow({
      drafts: [draft(2)],
      unattachedVenues: [legacy],
      organizationId: 99,
      venueId: legacy.id,
      createIntent: false,
      organizationCreateRequestId: null,
      venueCreateRequestId: null,
    });
    assert.equal(oneRemainingOrganization.kind, "organization_selection_required");
    if (oneRemainingOrganization.kind === "organization_selection_required") {
      assert.deepEqual(
        oneRemainingOrganization.drafts.map((candidate) => candidate.organization.id),
        [2],
      );
      assert.equal(oneRemainingOrganization.venueToAttach?.id, legacy.id);
    }
  });

  test("accepts an exact pair and rejects a cross-organization pair", () => {
    const drafts = [draft(1, [11]), draft(2, [22])];
    const exact = resolveOnboardingFlow({
      drafts,
      organizationId: 2,
      venueId: 22,
      createIntent: false,
      organizationCreateRequestId: null,
      venueCreateRequestId: null,
    });
    assert.equal(exact.kind, "resolved");
    if (exact.kind === "resolved") assert.equal(exact.venue?.id, 22);

    const cross = resolveOnboardingFlow({
      drafts,
      organizationId: 1,
      venueId: 22,
      createIntent: false,
      organizationCreateRequestId: null,
      venueCreateRequestId: null,
    });
    assert.deepEqual(cross, { kind: "invalid", code: "VENUE_ORGANIZATION_MISMATCH" });
  });

  test("an explicit create intent can never update an existing venue id", () => {
    const result = resolveOnboardingFlow({
      drafts: [draft(1, [11])],
      organizationId: 1,
      venueId: 11,
      createIntent: true,
      organizationCreateRequestId: null,
      venueCreateRequestId: VENUE_KEY,
    });
    assert.deepEqual(result, {
      kind: "invalid",
      code: "CREATE_INTENT_WITH_EXISTING_VENUE",
    });
  });

  test("never falls back to drafts[0] when an organization choice is ambiguous", () => {
    const result = resolveOnboardingFlow({
      drafts: [draft(1), draft(2)],
      organizationId: null,
      venueId: null,
      createIntent: true,
      organizationCreateRequestId: null,
      venueCreateRequestId: VENUE_KEY,
    });
    assert.equal(result.kind, "organization_selection_required");
  });

  test("URL-less resume is automatic only for a unique organization and venue", () => {
    const unique = resolveOnboardingFlow({
      drafts: [draft(1, [11])],
      organizationId: null,
      venueId: null,
      createIntent: false,
      organizationCreateRequestId: null,
      venueCreateRequestId: null,
    });
    assert.equal(unique.kind, "resolved");
    if (unique.kind === "resolved") assert.equal(unique.venue?.id, 11);

    const ambiguousVenue = resolveOnboardingFlow({
      drafts: [draft(1, [11, 12])],
      organizationId: null,
      venueId: null,
      createIntent: false,
      organizationCreateRequestId: null,
      venueCreateRequestId: null,
    });
    assert.equal(ambiguousVenue.kind, "venue_selection_required");
  });

  test("recovers exact lost organization and venue responses by their distinct keys", () => {
    const result = resolveOnboardingFlow({
      drafts: [draft(1), draft(2, [21, 22], ORG_KEY)],
      organizationId: null,
      venueId: null,
      createIntent: true,
      organizationCreateRequestId: ORG_KEY,
      venueCreateRequestId: VENUE_KEY,
    });
    assert.equal(result.kind, "resolved");
    if (result.kind === "resolved") {
      assert.equal(result.draft?.organization.id, 2);
      assert.equal(result.venue?.id, 22);
      assert.equal(result.recoveredOrganization, true);
      assert.equal(result.recoveredVenue, true);
    }
  });

  test("an organization recovery key cannot be paired with another organization's venue", () => {
    const drafts = [draft(1, [11], ORG_KEY), draft(2, [22])];
    const crossVenue = resolveOnboardingFlow({
      drafts,
      organizationId: null,
      venueId: 22,
      createIntent: false,
      organizationCreateRequestId: ORG_KEY,
      venueCreateRequestId: null,
    });
    assert.deepEqual(crossVenue, {
      kind: "invalid",
      code: "VENUE_ORGANIZATION_MISMATCH",
    });

    const crossOrganization = resolveOnboardingFlow({
      drafts,
      organizationId: 2,
      venueId: null,
      createIntent: false,
      organizationCreateRequestId: ORG_KEY,
      venueCreateRequestId: null,
    });
    assert.deepEqual(crossOrganization, {
      kind: "invalid",
      code: "ORGANIZATION_CREATE_REQUEST_MISMATCH",
    });
  });

  test("an unmatched submitted organization key never falls back to an unrelated unique draft", () => {
    const result = resolveOnboardingFlow({
      drafts: [draft(1, [11])],
      organizationId: null,
      venueId: null,
      createIntent: false,
      organizationCreateRequestId: ORG_KEY,
      venueCreateRequestId: null,
    });
    assert.deepEqual(result, {
      kind: "organization_create_pending",
      requestId: ORG_KEY,
    });
  });
});
