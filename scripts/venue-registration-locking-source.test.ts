import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { test } from "node:test";

test("registration decisions lock the complete state and enqueue notifications atomically", () => {
  const state = readFileSync("src/lib/partner/registration-state.ts", "utf8");
  const decision = readFileSync("src/lib/partner/registration-decision.ts", "utf8");
  const access = readFileSync("src/lib/venue-access.ts", "utf8");

  const lockedStart = state.indexOf("export async function loadLockedVenueRegistrationSnapshot");
  const lockedEnd = state.indexOf("export async function captureVenueRegistrationSnapshot");
  assert.ok(lockedStart >= 0 && lockedEnd > lockedStart);
  const lockedBody = state.slice(lockedStart, lockedEnd);
  assert.equal(lockedBody.match(/\.for\("update"\)/g)?.length, 4);
  assert.match(lockedBody, /orderBy\(asc\(venueHalls\.id\)\)[\s\S]*\.for\("update"\)/);
  assert.match(
    lockedBody,
    /\.from\(venueImages\)[\s\S]*orderBy\(asc\(venueImages\.id\)\)[\s\S]*\.for\("update"\)/,
  );

  assert.equal(
    decision.match(/loadLockedVenueRegistrationSnapshot\(venueId, executor\)/g)?.length,
    2,
  );
  assert.equal(
    decision.match(/getVenueOwnerRecipients\(venueId, executor\)/g)?.length,
    2,
  );
  assert.doesNotMatch(decision, /getVenueOwnerRecipients\(venueId\);/);
  assert.match(access, /getVenueOwnerRecipients\([\s\S]*executor: typeof db = db/);
});

test("artist decisions are serialized and atomic inside the decision service", () => {
  const decision = readFileSync("src/lib/partner/registration-decision.ts", "utf8");
  const route = readFileSync("src/app/api/admin/registration-requests/route.ts", "utf8");
  const start = decision.indexOf("async function decidePartnerArtist");
  const end = decision.indexOf("export function approvePartnerArtist", start);
  assert.ok(start >= 0 && end > start);
  const body = decision.slice(start, end);

  assert.match(body, /db\.transaction/);
  assert.match(body, /acquireLegalScopeLocks\(tx/);
  assert.match(
    body,
    /participantUserIds[\s\S]*\.from\(users\)[\s\S]*\.orderBy\(asc\(users\.id\)\)[\s\S]*\.for\("update"\)[\s\S]*lockedAdmin/,
  );
  assert.match(body, /\.from\(artists\)[\s\S]*\.for\("update"\)/);
  assert.match(body, /rowVersion !== expected\.rowVersion/);
  assert.match(body, /missingRegistrationDocuments\(ownerId, "artist", executor\)/);
  assert.match(body, /insert\(notifications\)[\s\S]*dedupeKey:/);
  assert.match(body, /update\(users\)[\s\S]*delete\(artists\)/);
  assert.match(route, /approvePartnerArtist\(admin\.id, id\)/);
  assert.match(route, /rejectPartnerArtist\(admin\.id, id\)/);
  const artistBranch = route.slice(
    route.indexOf('if (type === "artist")'),
    route.indexOf('} else if (type === "venue")'),
  );
  assert.doesNotMatch(artistBranch, /db\.(?:update|delete|insert)/);
});

test("registration snapshots include venue image xmin versions in both unlocked and locked reads", () => {
  const state = readFileSync("src/lib/partner/registration-state.ts", "utf8");

  const unlockedStart = state.indexOf("export async function loadVenueRegistrationSnapshot");
  const unlockedEnd = state.indexOf("export async function loadLockedVenueRegistrationSnapshot");
  const lockedStart = unlockedEnd;
  const lockedEnd = state.indexOf("export async function captureVenueRegistrationSnapshot");
  assert.ok(unlockedStart >= 0 && unlockedEnd > unlockedStart);
  assert.ok(lockedStart >= 0 && lockedEnd > lockedStart);

  const unlockedBody = state.slice(unlockedStart, unlockedEnd);
  const lockedBody = state.slice(lockedStart, lockedEnd);
  assert.match(
    state,
    /images:\s*Array<\{[\s\S]*?id:\s*number;[\s\S]*?rowVersion:\s*string;[\s\S]*?\}>/,
  );
  assert.match(state, /images:\s*images\.map\(\(image\)\s*=>\s*\[/);
  assert.match(
    unlockedBody,
    /rowVersion:\s*sql<string>`xmin::text`[\s\S]*\.from\(venueImages\)/,
  );
  assert.match(
    lockedBody,
    /rowVersion:\s*sql<string>`xmin::text`[\s\S]*\.from\(venueImages\)[\s\S]*\.for\("update"\)/,
  );
  assert.equal(state.match(/\.from\(venueImages\)/g)?.length, 2);
});

test("registration transition actor reads take a users row lock", () => {
  const access = readFileSync("src/lib/venue-access.ts", "utf8");
  const decision = readFileSync("src/lib/partner/registration-decision.ts", "utf8");
  const onboarding = readFileSync("src/lib/partner/onboarding.ts", "utf8");

  const actorReadStart = access.indexOf("export async function getLockedAppUserById");
  const actorReadEnd = access.indexOf("export type AccessError", actorReadStart);
  assert.ok(actorReadStart >= 0 && actorReadEnd > actorReadStart);
  const actorReadBody = access.slice(actorReadStart, actorReadEnd);
  assert.match(actorReadBody, /\.from\(users\)[\s\S]*\.for\("update"\)[\s\S]*\.limit\(1\)/);

  assert.equal(
    decision.match(/getLockedAppUserById\(adminUserId, executor\)/g)?.length,
    2,
  );
  assert.match(
    decision,
    /const lockedParticipants = await executor[\s\S]*\.from\(users\)[\s\S]*\.orderBy\(asc\(users\.id\)\)[\s\S]*\.for\("update"\)/,
  );
  assert.equal(
    onboarding.match(/getLockedAppUserById\(actorUserId, executor\)/g)?.length,
    2,
  );
});

test("organization legal authority is rechecked under actor, organization, and membership row locks", () => {
  const access = readFileSync("src/lib/venue-access.ts", "utf8");
  const acceptance = readFileSync("src/lib/legal/record-acceptance.ts", "utf8");
  const onboarding = readFileSync("src/lib/partner/onboarding.ts", "utf8");
  const authStart = access.indexOf("export async function authorizeOrganizationCapabilityLocked");
  const authEnd = access.indexOf("/** Pure hall authorization", authStart);
  assert.ok(authStart >= 0 && authEnd > authStart);
  const authBody = access.slice(authStart, authEnd);

  const organizationLock = authBody.indexOf(".from(partnerOrganizations)");
  const membershipLock = authBody.indexOf(
    "membershipRole(user.id, organizationId, executor, true)",
  );
  assert.ok(organizationLock >= 0 && membershipLock > organizationLock);
  assert.match(
    authBody,
    /\.from\(partnerOrganizations\)[\s\S]*\.for\("update"\)[\s\S]*ORG_STATUSES_ALLOWING_ACCESS/,
  );

  const acceptanceStart = acceptance.indexOf(
    "export async function recordLegalAcceptancePack",
  );
  const acceptanceBody = acceptance.slice(acceptanceStart);
  assert.match(
    acceptanceBody,
    /const lockedAudience = await tx[\s\S]*?\.from\(users\)[\s\S]*?\.orderBy\(asc\(users\.id\)\)[\s\S]*?\.for\("share"\)[\s\S]*?lockedAudience\.find\([\s\S]*?candidate\.id === input\.userId/,
  );
  assert.match(
    acceptance,
    /authorizeOrganizationCapabilityLocked\([\s\S]*?"manage_legal",[\s\S]*?executor/,
  );
  assert.doesNotMatch(acceptance, /\bgetAppUserById\b/);
  assert.doesNotMatch(acceptance, /\bauthorizeOrganizationCapability\b/);
  assert.equal(
    onboarding.match(/authorizeOrganizationCapabilityLocked\(/g)?.length,
    5,
  );
  assert.doesNotMatch(onboarding, /\bauthorizeOrganizationCapability\(/);

  const memberWrites = readFileSync("src/lib/partner/organization-members.ts", "utf8");
  assert.match(memberWrites, /getLockedAppUserById\(actorUserId, executor\)/);
  assert.match(
    memberWrites,
    /authorizeOrganizationCapabilityLocked\([\s\S]*?"manage_members",[\s\S]*?executor/,
  );
  assert.doesNotMatch(memberWrites, /\bgetAppUserById\b/);
  assert.doesNotMatch(memberWrites, /\bauthorizeOrganizationCapability\b/);
});

test("generic profile editors cannot publish registered partners around approval gates", () => {
  const artistRoute = readFileSync("src/app/api/artists/crud/route.ts", "utf8");
  const venueRoute = readFileSync("src/app/api/venues/[id]/route.ts", "utf8");
  const bulkRoute = readFileSync("src/app/api/admin/bulk/route.ts", "utf8");

  assert.match(
    artistRoute,
    /db\.transaction[\s\S]*acquireLegalScopeLocks[\s\S]*getLockedAppUserById[\s\S]*\.from\(artists\)[\s\S]*\.for\("update"\)/,
  );
  assert.match(
    artistRoute,
    /existing\.userId[\s\S]*normalizedData\.isActive === true[\s\S]*APPROVAL_FLOW_REQUIRED/,
  );
  assert.match(artistRoute, /"userId" in rawData[\s\S]*OWNERSHIP_TRANSFER_REQUIRED/);
  assert.match(
    venueRoute,
    /db\.transaction[\s\S]*acquireLegalScopeLocks[\s\S]*acquireAvailabilityLocks[\s\S]*getLockedAppUserById[\s\S]*\.from\(venues\)[\s\S]*\.for\("update"\)[\s\S]*authorizeVenueCapabilityLocked/,
  );
  assert.match(
    venueRoute,
    /venue\.organizationId !== expectedOrganizationId[\s\S]*VENUE_SCOPE_CHANGED/,
  );
  assert.match(
    venueRoute,
    /data\.isActive === true[\s\S]*venue\.organizationId != null[\s\S]*APPROVAL_FLOW_REQUIRED/,
  );
  assert.match(
    bulkRoute,
    /action === "activate"[\s\S]*APPROVAL_FLOW_REQUIRED[\s\S]*status: 409/,
  );
});

test("submit owns the deduped admin notification and the route never redispatches it", () => {
  const onboarding = readFileSync("src/lib/partner/onboarding.ts", "utf8");
  const route = readFileSync("src/app/api/venues/[id]/submit-approval/route.ts", "utf8");
  const submitStart = onboarding.indexOf("export async function submitVenueForApproval");
  const submitEnd = onboarding.indexOf("export async function archiveHall", submitStart);
  assert.ok(submitStart >= 0 && submitEnd > submitStart);
  const submitBody = onboarding.slice(submitStart, submitEnd);

  assert.match(submitBody, /insert\(notifications\)/);
  assert.match(submitBody, /type:\s*"venue_registered"/);
  assert.match(submitBody, /dedupeKey:/);
  assert.match(submitBody, /submissionKey/);
  assert.match(submitBody, /\.onConflictDoNothing\(\)/);
  assert.doesNotMatch(route, /dispatchToAdmins/);
});

test("archive dates and approval lifecycle use the locked registration state", () => {
  const state = readFileSync("src/lib/partner/registration-state.ts", "utf8");
  const onboarding = readFileSync("src/lib/partner/onboarding.ts", "utf8");
  const decision = readFileSync("src/lib/partner/registration-decision.ts", "utf8");
  const archiveStart = onboarding.indexOf("export async function archiveHall");
  assert.ok(archiveStart >= 0);
  const archiveBody = onboarding.slice(archiveStart);

  assert.match(state, /timezone:\s*venues\.timezone/);
  assert.match(state, /venue\.timezone/);
  assert.match(archiveBody, /localDateInZone\(new Date\(\), expected\.venue\.timezone\)/);
  assert.doesNotMatch(archiveBody, /timeZone:\s*"Europe\/Chisinau"/);
  assert.match(decision, /code:\s*"ORGANIZATION_NOT_APPROVABLE"/);
  assert.match(decision, /RECONCILABLE_ORGANIZATION_STATUSES/);
});

test("legacy registration state is explicit and rollback writes preserve hidden hall data", () => {
  const state = readFileSync("src/lib/partner/registration-state.ts", "utf8");
  const decision = readFileSync("src/lib/partner/registration-decision.ts", "utf8");
  const claim = readFileSync("src/lib/auth/select-role.ts", "utf8");
  const route = readFileSync("src/app/api/auth/register-venue/route.ts", "utf8");

  assert.match(
    state,
    /venueRegistrationHasPendingWork[\s\S]*hall\.status === "pending"/,
  );
  assert.match(
    state,
    /venueRegistrationHasPendingWork[\s\S]*snapshot\.venue\.userId != null[\s\S]*!snapshot\.venue\.isActive[\s\S]*hall\.isLegacyDefault/,
  );
  assert.match(decision, /const LEGACY_PENDING = and\([\s\S]*isNull\(venues\.organizationId\)/);
  assert.match(decision, /const ORGANIZATION_PENDING_HALL = and\([\s\S]*organizationId\} IS NOT NULL/);
  assert.match(decision, /const PENDING_HALL = or\(ORGANIZATION_PENDING_HALL, LEGACY_PENDING\)/);
  assert.match(
    decision,
    /isMultiHallEnabled\(\) \? PENDING_HALL : LEGACY_PENDING/,
  );
  assert.match(claim, /directVenue\?\.organizationId != null/);
  assert.match(claim, /code: "VENUE_ALREADY_REGISTERED"/);
  assert.match(route, /eq\(venueHalls\.isLegacyDefault, true\)/);
  assert.doesNotMatch(route, /orderBy\(venueHalls\.id\)/);
  assert.match(
    route,
    /delete\(venueImages\)[\s\S]*isNull\(venueImages\.hallId\)/,
  );
  assert.match(
    route,
    /onConflictDoNothing\(\{\s*target: \[venueHalls\.venueId, venueHalls\.slug\]/,
  );
  assert.match(route, /onConflictDoNothing\(\{ target: venues\.slug \}\)/);
});

test("submit validates before no-op and blocks terminal organization states", () => {
  const onboarding = readFileSync("src/lib/partner/onboarding.ts", "utf8");
  const submitStart = onboarding.indexOf("export async function submitVenueForApproval");
  const submitEnd = onboarding.indexOf("export async function archiveHall", submitStart);
  assert.ok(submitStart >= 0 && submitEnd > submitStart);
  const submitBody = onboarding.slice(submitStart, submitEnd);

  assert.match(submitBody, /code: "ORGANIZATION_NOT_SUBMITTABLE"/);
  assert.ok(
    submitBody.indexOf("collectSubmitMissing(venueId, executor)") <
      submitBody.indexOf("transitioningHallIds.length === 0"),
  );
  assert.match(submitBody, /hall\.status === "pending"/);
  assert.match(submitBody, /current\.venue\.isActive[\s\S]*hall\.status === "active"/);
  assert.match(submitBody, /const completionUserIds = \[[\s\S]*actorUserId[\s\S]*current\.venue\.userId/);
  assert.equal(
    submitBody.match(/where\(inArray\(users\.id, completionUserIds\)\)/g)?.length,
    2,
    "both a real transition and an idempotent retry must complete actor plus legacy owner",
  );
});

test("personal and organization legal evidence remain separate", () => {
  const gate = readFileSync("src/lib/legal/registration-gate.ts", "utf8");
  const acceptRoute = readFileSync("src/app/api/legal/accept/route.ts", "utf8");
  const recorder = readFileSync("src/lib/legal/record-acceptance.ts", "utf8");
  const venueRoute = readFileSync("src/app/api/auth/register-venue/route.ts", "utf8");
  assert.match(gate, /isNull\(legalAcceptances\.organizationId\)/);
  const linkStart = venueRoute.indexOf(".update(legalAcceptances)");
  assert.ok(linkStart >= 0);
  assert.match(
    venueRoute.slice(linkStart, linkStart + 700),
    /isNull\(legalAcceptances\.organizationId\)/,
  );
  assert.match(acceptRoute, /const \[a\] = !organizationId && subjectType === "artist"/);
  assert.match(acceptRoute, /const \[v\] = !organizationId && subjectType === "venue"/);
  assert.match(acceptRoute, /artistId: organizationId \? null/);
  assert.match(acceptRoute, /venueId: organizationId \? null/);
  assert.match(recorder, /ORGANIZATION_PROFILE_LINK_NOT_ALLOWED/);
});

test("admin registration cache purge covers before-active and after-active states", () => {
  const route = readFileSync(
    "src/app/api/admin/registration-requests/route.ts",
    "utf8",
  );
  assert.match(
    route,
    /action === "approve" \|\| venue\.isActive \|\| decidedVenue\.isActive/,
  );
  assert.match(route, /new Set\(\[venue\.slug, decidedVenue\.slug\]\)/);
  const venueStart = route.indexOf('} else if (type === "venue")');
  const venueBody = route.slice(venueStart);
  const decisionEnd = Math.max(
    venueBody.indexOf("approvePartnerVenue(admin.id, id)"),
    venueBody.indexOf("rejectPartnerVenue(admin.id, id)"),
  );
  assert.ok(decisionEnd >= 0);
  assert.ok(venueBody.indexOf('revalidateVendorCatalog("venue"') > decisionEnd);
  assert.ok(venueBody.indexOf('revalidateVendorCatalog("venue"') < venueBody.indexOf("await sendEmail"));
});

test("a successful public AI description CAS invalidates the exact venue profile", () => {
  const route = readFileSync("src/app/api/auth/register-venue/route.ts", "utf8");
  const aiStart = route.indexOf("// Auto-improve the description with AI");
  const aiEnd = route.indexOf("// Referral milestone", aiStart);
  assert.ok(aiStart >= 0 && aiEnd > aiStart);
  const aiBody = route.slice(aiStart, aiEnd);

  assert.match(aiBody, /\.where\(and\(eq\(venues\.id, venue\.id\), eq\(venues\.descriptionRo, data\.description!\)\)\)/);
  assert.match(aiBody, /\.returning\(\{ slug: venues\.slug, isActive: venues\.isActive \}\)/);
  assert.match(aiBody, /if \(rewrittenVenue\?\.isActive\)[\s\S]*revalidateVendorCatalog\("venue", \{[\s\S]*profileSlugs: \[rewrittenVenue\.slug\]/);
  assert.ok(aiBody.indexOf(".returning(") < aiBody.indexOf('revalidateVendorCatalog("venue"'));
});

test("legacy profile creation links signed evidence inside the role transaction", () => {
  for (const [path, foreignKey] of [
    ["src/app/api/auth/register-artist/route.ts", "artistId"],
    ["src/app/api/auth/register-venue/route.ts", "venueId"],
  ] as const) {
    const route = readFileSync(path, "utf8");
    const claimStart = route.indexOf(
      foreignKey === "artistId"
        ? "claimArtistRegistrationInDatabase({"
        : "claimLegacyVenueRegistrationInDatabase({",
    );
    const claimEnd = route.indexOf("if (!claimed.ok)", claimStart);
    assert.ok(claimStart >= 0 && claimEnd > claimStart, path);
    const claim = route.slice(claimStart, claimEnd);
    assert.match(claim, /executor[\s\S]*update\(legalAcceptances\)/, path);
    assert.match(claim, new RegExp(`set\\(\\{ ${foreignKey}:`), path);
    assert.doesNotMatch(
      route.slice(claimEnd),
      /db[\s\S]{0,80}update\(legalAcceptances\)[\s\S]{0,80}set\(\{ (?:artistId|venueId):/,
      path,
    );
  }
});
