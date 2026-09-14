import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { test } from "node:test";
import { PDFDocument } from "pdf-lib";

import {
  bookingContractBasis,
  bookingContractClientMatches,
  bookingContractCommitDecision,
  bookingContractVendorIdentity,
} from "../src/lib/booking/contract-data";
import {
  contractVendorPartyRows,
  generateContractPdf,
} from "../src/lib/contract/generate-pdf";
import {
  bookingContractCopy,
  bookingContractSignatureIsValid,
} from "../src/lib/contract/copy";

const venueBooking = {
  id: 501,
  artistId: null,
  artistNameSnapshot: null,
  venueId: 40,
  commercialSnapshot: {
    venueName: "Restaurant Imperial",
    hallName: "Grand",
  },
  clientUserId: "11111111-1111-4111-8111-111111111111",
  clientName: "Client Test",
  clientPhone: "+37360000000",
  clientEmail: "client@example.invalid",
  eventDate: "2026-09-20",
  eventType: "wedding",
  startTime: "16:00",
  endTime: "23:00",
  guestCount: 150,
  agreedPrice: 900,
  message: "Test",
};

const contacts = {
  vendorEmail: "venue@example.invalid",
  vendorPhone: "+37361111111",
};

const artistBooking = {
  ...venueBooking,
  id: 502,
  artistId: 77,
  artistNameSnapshot: "Formația Orizont",
  venueId: null,
  commercialSnapshot: null,
};

test("booking contract venue identity uses the confirmed local + hall snapshot", () => {
  assert.deepEqual(bookingContractVendorIdentity(venueBooking), {
    vendorKind: "sala",
    vendorName: "Restaurant Imperial · Grand",
    venueName: "Restaurant Imperial",
    hallName: "Grand",
  });
  assert.deepEqual(
    contractVendorPartyRows({
      ...bookingContractVendorIdentity(venueBooking),
      ...contacts,
    }).slice(0, 2),
    [
      ["Local (Prestator):", "Restaurant Imperial"],
      ["  Sala:", "Grand"],
    ],
  );
});

test("artist snapshot keeps the historical vendor kind after FK SET NULL", () => {
  const afterArtistDelete = { ...artistBooking, artistId: null };
  assert.deepEqual(bookingContractVendorIdentity(afterArtistDelete), {
    vendorKind: "artist",
    vendorName: "Formația Orizont",
    venueName: null,
    hallName: null,
  });
  assert.deepEqual(
    contractVendorPartyRows({
      ...bookingContractVendorIdentity(afterArtistDelete),
      ...contacts,
    })[0],
    ["Artist (Prestator):", "Formația Orizont"],
  );

  const prepared = bookingContractBasis(artistBooking, contacts);
  const currentAfterDelete = bookingContractBasis(afterArtistDelete, contacts);
  assert.equal(currentAfterDelete.vendorKind, "artist");
  assert.equal(
    bookingContractCommitDecision({
      prepared,
      current: currentAfterDelete,
      authenticatedClient: true,
      currentStatus: "confirmed_by_client",
      currentSignedAt: null,
    }),
    "booking_changed",
    "an FK SET NULL racing the render must not publish bytes for the former live vendor",
  );
});

test("a live venue FK wins over an inconsistent legacy artist snapshot", () => {
  assert.equal(
    bookingContractVendorIdentity({
      ...venueBooking,
      artistNameSnapshot: "stale legacy value",
    }).vendorKind,
    "sala",
  );
});

test("contract basis revalidates every rendered vendor contact", () => {
  const prepared = bookingContractBasis(venueBooking, contacts);
  const renamedContacts = bookingContractBasis(venueBooking, {
    vendorEmail: "changed@example.invalid",
    vendorPhone: "+37362222222",
  });
  assert.equal(
    bookingContractCommitDecision({
      prepared,
      current: renamedContacts,
      authenticatedClient: true,
      currentStatus: "confirmed_by_client",
      currentSignedAt: null,
    }),
    "booking_changed",
  );
});

test("contract PDF metadata uses the explicit deterministic generation instant", async () => {
  const generationDate = new Date("2032-06-12T13:14:15.000Z");
  const bytes = await generateContractPdf({
    ...bookingContractBasis(venueBooking, contacts),
    clientSignature: "Client Test",
    clientSignedAt: generationDate,
    generationDate,
  });
  const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
  assert.equal(pdf.getCreationDate()?.toISOString(), generationDate.toISOString());
  assert.equal(pdf.getModificationDate()?.toISOString(), generationDate.toISOString());
});

test("booking contract renders Romanian and Cyrillic text across multiple A4 pages", async () => {
  const generationDate = new Date("2032-06-12T13:14:15.000Z");
  const longMessage = Array.from({ length: 40 }, (_, index) =>
    `${index + 1}. Confirmăm sărbătoarea în Chișinău pentru Ири́на și Ștefan.`
  ).join("\n").slice(0, 2_000);
  const bytes = await generateContractPdf({
    ...bookingContractBasis(
      {
        ...venueBooking,
        clientName: "Ири́на Ștefan Țurcanu",
        eventType: "Nuntă / Свадьба",
        message: longMessage,
        commercialSnapshot: {
          venueName: "S.R.L. «Локация Sărbătoare»",
          hallName: "Sala Mărțișor / Зал Большой",
        },
      },
      contacts,
    ),
    clientSignature: "Ири́на Ștefan Țurcanu",
    clientSignedAt: generationDate,
    generationDate,
    locale: "ru",
  });
  if (process.env.BOOKING_CONTRACT_PDF_OUTPUT) {
    await writeFile(process.env.BOOKING_CONTRACT_PDF_OUTPUT, bytes);
  }

  assert.equal(Buffer.from(bytes.subarray(0, 5)).toString("ascii"), "%PDF-");
  const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
  assert.ok(pdf.getPageCount() >= 2, "real maximum booking details must continue on later pages");
  for (const page of pdf.getPages()) {
    const { width, height } = page.getSize();
    assert.ok(Math.abs(width - 595.28) < 0.1);
    assert.ok(Math.abs(height - 841.89) < 0.1);
  }
  assert.equal(pdf.getCreationDate()?.toISOString(), generationDate.toISOString());
  assert.equal(pdf.getModificationDate()?.toISOString(), generationDate.toISOString());
});

test("booking contract never truncates the accepted 100-character signature", async () => {
  const generationDate = new Date("2032-06-12T13:14:15.000Z");
  const bytes = await generateContractPdf({
    ...bookingContractBasis(venueBooking, contacts),
    clientSignature: "W".repeat(100),
    clientSignedAt: generationDate,
    generationDate,
    locale: "en",
  });
  assert.equal(Buffer.from(bytes.subarray(0, 5)).toString("ascii"), "%PDF-");
  const generator = readFileSync("src/lib/contract/generate-pdf.ts", "utf8");
  assert.doesNotMatch(generator, /signatureLines[^\n]*\.slice\(/);
  assert.match(generator, /while \(signatureLines\.length > 3 && signatureSize > 6\)/);
});

test("the dialog and PDF use the same locale-specific booking terms", () => {
  assert.equal(bookingContractCopy("ro").terms.length, 4);
  assert.equal(bookingContractCopy("ru").terms.length, 4);
  assert.equal(bookingContractCopy("en").terms.length, 4);
  const dialog = readFileSync("src/components/client/sign-contract-dialog.tsx", "utf8");
  assert.match(dialog, /contractCopy\.terms\.map/);
  assert.match(dialog, /JSON\.stringify\(\{ signature: signature\.trim\(\), locale \}\)/);
  const generator = readFileSync("src/lib/contract/generate-pdf.ts", "utf8");
  assert.match(generator, /for \(let index = 0; index < copy\.terms\.length/);
});

test("a booking contract signature must contain at least two Unicode letters", () => {
  assert.equal(bookingContractSignatureIsValid("💍"), false);
  assert.equal(bookingContractSignatureIsValid("\u0000\t"), false);
  assert.equal(bookingContractSignatureIsValid("A"), false);
  assert.equal(bookingContractSignatureIsValid("Șt"), true);
  assert.equal(bookingContractSignatureIsValid("Ир"), true);
});

test("account erasure and cancellation both win over an in-flight sign render", () => {
  const prepared = bookingContractBasis(venueBooking, contacts);
  const erased = bookingContractBasis({
    ...venueBooking,
    clientUserId: null,
    clientName: "(cont șters)",
    clientPhone: "",
    clientEmail: null,
    message: null,
  }, contacts);
  assert.equal(
    bookingContractCommitDecision({
      prepared,
      current: erased,
      authenticatedClient: false,
      currentStatus: "confirmed_by_client",
      currentSignedAt: null,
    }),
    "unauthorized",
  );
  assert.equal(
    bookingContractCommitDecision({
      prepared,
      current: prepared,
      authenticatedClient: true,
      currentStatus: "cancelled",
      currentSignedAt: null,
    }),
    "booking_changed",
  );
});

test("legacy email ownership is case-insensitive and only applies without clientUserId", () => {
  const user = {
    id: "22222222-2222-4222-8222-222222222222",
    email: "CLIENT@EXAMPLE.INVALID",
  };
  assert.equal(
    bookingContractClientMatches({ clientUserId: null, clientEmail: "client@example.invalid" }, user),
    true,
  );
  assert.equal(
    bookingContractClientMatches({
      clientUserId: "33333333-3333-4333-8333-333333333333",
      clientEmail: "client@example.invalid",
    }, user),
    false,
  );
  assert.equal(
    bookingContractClientMatches({ clientUserId: null, clientEmail: null }, {
      ...user,
      email: null,
    }),
    false,
  );
});

test("contract signing uses canonical user -> vendor -> booking order and cleans loser blobs", () => {
  const route = readFileSync(
    "src/app/api/booking-requests/[id]/contract/route.ts",
    "utf8",
  );
  const commit = route.indexOf("commit = await db.transaction");
  const userLock = route.indexOf('.for("share")', commit);
  const vendorLock = route.indexOf("lockPreparedBookingVendor(b, executor)", userLock);
  const bookingLock = route.indexOf("lockBookingForContractCommit(bookingId, executor)", vendorLock);
  const decision = route.indexOf("bookingContractCommitDecision", bookingLock);
  const cas = route.indexOf("isNull(bookingRequests.clientSignedAt)", decision);
  const retain = route.indexOf("retainRegisteredBlobAsset", cas);
  const loserCleanup = route.indexOf('if (commit !== "signed")', retain);
  assert.ok(commit >= 0 && commit < userLock);
  assert.ok(userLock < vendorLock && vendorLock < bookingLock);
  assert.ok(bookingLock < decision);
  assert.ok(decision < cas && cas < retain && retain < loserCleanup);
  assert.match(route, /inArray\(bookingRequests\.status, \["confirmed_by_client", "completed"\]\)/);
  assert.match(route, /bookingContractClientMatches\(currentBooking, currentUser\)/);
  assert.match(
    route,
    /isNull\(bookingRequests\.clientUserId\)[\s\S]*lower\(btrim\(\$\{bookingRequests\.clientEmail\}\)\) = lower\(btrim\(\$\{currentUser\.email\}\)\)/,
  );
  assert.doesNotMatch(
    route,
    /eq\(bookingRequests\.clientEmail, currentUser\.email\)/,
  );
  assert.match(route, /if \(!legalBlobToken\) return contractTemporarilyUnavailable\(\)/);
  assert.match(route, /provenance: "legal_contract_pending"/);
  assert.match(route, /\.refine\(bookingContractSignatureIsValid/);
  assert.match(route, /\[contract\] unsigned PDF render failed/);
  assert.match(route, /"Cache-Control": "private, no-store"/);
  assert.match(route, /await retainRegisteredBlobAsset\(/);
  assert.match(route, /if \(!b\.contractPdfUrl\) return contractTemporarilyUnavailable\(\)/);
  assert.match(route, /if \(!storedPdf\) return contractTemporarilyUnavailable\(\)/);
  assert.doesNotMatch(route, /storedPdf \?\?/);
  assert.equal(
    route.match(/!Number\.isSafeInteger\(bookingId\) \|\| bookingId <= 0/g)?.length,
    2,
  );
  assert.match(
    route,
    /if \(!b\.clientSignedAt && !\["confirmed_by_client", "completed"\]\.includes\(b\.status\)\)/,
  );

  const preview = readFileSync(
    "src/app/api/booking-requests/[id]/contract-preview/route.ts",
    "utf8",
  );
  assert.match(preview, /bookingContractVendorIdentity\(b\)/);
  assert.match(preview, /venueName: vendor\.venueName/);
  assert.match(preview, /hallName: vendor\.hallName/);
  assert.doesNotMatch(preview, /venues\.nameRo|artists\.nameRo/);

  const nextConfig = readFileSync("next.config.ts", "utf8");
  assert.ok(
    nextConfig.includes('"/api/booking-requests/\\\\[id\\\\]/contract"'),
  );
  for (const subset of ["latin", "latin-ext", "cyrillic"]) {
    for (const weight of [400, 700]) {
      assert.ok(
        nextConfig.includes(`noto-sans-${subset}-${weight}-normal.woff`),
      );
    }
  }

  const artistDeleteRoute = readFileSync(
    "src/app/api/artists/crud/route.ts",
    "utf8",
  );
  const artistDelete = artistDeleteRoute.indexOf("export async function DELETE");
  const artistLegalLock = artistDeleteRoute.indexOf("acquireLegalScopeLocks", artistDelete);
  const artistAdminRecheck = artistDeleteRoute.indexOf("getLockedAppUserById", artistLegalLock);
  const artistParent = artistDeleteRoute.indexOf(".from(artists)", artistAdminRecheck);
  const artistParentLock = artistDeleteRoute.indexOf('.for("update")', artistParent);
  const artistBookingSnapshot = artistDeleteRoute.indexOf(".update(bookingRequests)", artistParentLock);
  const artistDeleteStatement = artistDeleteRoute.indexOf(".delete(artists)", artistBookingSnapshot);
  assert.ok(artistDelete < artistLegalLock && artistLegalLock < artistAdminRecheck);
  assert.ok(artistAdminRecheck < artistParent && artistParent < artistParentLock);
  assert.ok(artistParentLock < artistBookingSnapshot);
  assert.ok(artistBookingSnapshot < artistDeleteStatement);

  const venueDeleteRoute = readFileSync(
    "src/app/api/venues/[id]/route.ts",
    "utf8",
  );
  const venueDelete = venueDeleteRoute.indexOf("export async function DELETE");
  const venueLegalLock = venueDeleteRoute.indexOf("acquireLegalScopeLocks", venueDelete);
  const venueAdminRecheck = venueDeleteRoute.indexOf("getLockedAppUserById", venueLegalLock);
  const venueParent = venueDeleteRoute.indexOf(".from(venues)", venueAdminRecheck);
  const venueParentLock = venueDeleteRoute.indexOf('.for("update")', venueParent);
  const venueDeleteStatement = venueDeleteRoute.indexOf(".delete(venues)", venueParentLock);
  assert.ok(venueDelete < venueLegalLock && venueLegalLock < venueAdminRecheck);
  assert.ok(venueAdminRecheck < venueParent && venueParent < venueParentLock);
  assert.ok(venueParentLock < venueDeleteStatement);

  const registrationDecision = readFileSync(
    "src/lib/partner/registration-decision.ts",
    "utf8",
  );
  const decisionStart = registrationDecision.indexOf("async function decidePartnerArtist");
  const decisionUsers = registrationDecision.indexOf(
    "const lockedParticipants",
    decisionStart,
  );
  const decisionUsersOrder = registrationDecision.indexOf(
    ".orderBy(asc(users.id))",
    decisionUsers,
  );
  const decisionUsersLock = registrationDecision.indexOf(
    '.for("update")',
    decisionUsersOrder,
  );
  const decisionArtist = registrationDecision.indexOf(
    ".from(artists)",
    decisionUsersLock,
  );
  const decisionParentLock = registrationDecision.indexOf(
    '.for("update")',
    decisionArtist,
  );
  const decisionBookingSnapshot = registrationDecision.indexOf(
    ".update(bookingRequests)",
    decisionParentLock,
  );
  const decisionDelete = registrationDecision.indexOf(
    ".delete(artists)",
    decisionBookingSnapshot,
  );
  assert.ok(decisionStart < decisionUsers);
  assert.ok(decisionUsers < decisionUsersOrder && decisionUsersOrder < decisionUsersLock);
  assert.ok(decisionUsersLock < decisionArtist && decisionArtist < decisionParentLock);
  assert.ok(decisionParentLock < decisionBookingSnapshot);
  assert.ok(decisionBookingSnapshot < decisionDelete);
  assert.match(
    registrationDecision,
    /const lockedAdmin = lockedParticipants\.find[\s\S]*lockedAdmin\.role !== "admin"[\s\S]*lockedAdmin\.role !== "super_admin"/,
  );

  const bulkRoute = readFileSync("src/app/api/admin/bulk/route.ts", "utf8");
  assert.match(
    bulkRoute,
    /if \(action === "activate"\)[\s\S]*code: "APPROVAL_FLOW_REQUIRED"[\s\S]*status: 409/,
  );
  assert.doesNotMatch(bulkRoute, /patch\.isActive = true/);
  const bulkMutation = bulkRoute.indexOf("const mutation = await db.transaction");
  const bulkLegalLock = bulkRoute.indexOf("acquireLegalScopeLocks", bulkMutation);
  const bulkAdminRecheck = bulkRoute.indexOf("getLockedAppUserById", bulkLegalLock);
  const bulkDelete = bulkRoute.indexOf('if (action === "delete")');
  assert.ok(bulkMutation < bulkLegalLock && bulkLegalLock < bulkAdminRecheck);
  assert.ok(bulkAdminRecheck < bulkDelete);
  const bulkArtistOrder = bulkRoute.indexOf(".orderBy(asc(artists.id))", bulkDelete);
  const bulkArtistLock = bulkRoute.indexOf('.for("update")', bulkArtistOrder);
  const bulkArtistSnapshot = bulkRoute.indexOf(
    ".update(bookingRequests)",
    bulkArtistLock,
  );
  const bulkArtistDelete = bulkRoute.indexOf(
    ".delete(artists)",
    bulkArtistSnapshot,
  );
  const bulkVenueOrder = bulkRoute.indexOf(".orderBy(asc(venues.id))", bulkArtistDelete);
  const bulkVenueLock = bulkRoute.indexOf('.for("update")', bulkVenueOrder);
  const bulkVenueDelete = bulkRoute.indexOf(".delete(venues)", bulkVenueLock);
  const bulkRevalidate = bulkRoute.indexOf("revalidateVendorCatalog", bulkVenueDelete);
  assert.ok(bulkDelete < bulkArtistOrder && bulkArtistOrder < bulkArtistLock);
  assert.ok(bulkArtistLock < bulkArtistSnapshot && bulkArtistSnapshot < bulkArtistDelete);
  assert.ok(bulkArtistDelete < bulkVenueOrder && bulkVenueOrder < bulkVenueLock);
  assert.ok(bulkVenueLock < bulkVenueDelete && bulkVenueDelete < bulkRevalidate);

  const bulkNonDelete = bulkRoute.indexOf("const patch:", bulkVenueDelete);
  const bulkUpdateArtistOrder = bulkRoute.indexOf(
    ".orderBy(asc(artists.id))",
    bulkNonDelete,
  );
  const bulkUpdateArtistLock = bulkRoute.indexOf(
    '.for("update")',
    bulkUpdateArtistOrder,
  );
  const bulkUpdateArtist = bulkRoute.indexOf(
    ".update(artists)",
    bulkUpdateArtistLock,
  );
  const bulkUpdateVenueOrder = bulkRoute.indexOf(
    ".orderBy(asc(venues.id))",
    bulkUpdateArtist,
  );
  const bulkUpdateVenueLock = bulkRoute.indexOf(
    '.for("update")',
    bulkUpdateVenueOrder,
  );
  const bulkUpdateVenue = bulkRoute.indexOf(
    ".update(venues)",
    bulkUpdateVenueLock,
  );
  assert.ok(bulkVenueDelete < bulkNonDelete);
  assert.ok(
    bulkNonDelete < bulkUpdateArtistOrder
      && bulkUpdateArtistOrder < bulkUpdateArtistLock
      && bulkUpdateArtistLock < bulkUpdateArtist,
  );
  assert.ok(
    bulkUpdateArtist < bulkUpdateVenueOrder
      && bulkUpdateVenueOrder < bulkUpdateVenueLock
      && bulkUpdateVenueLock < bulkUpdateVenue,
  );

  const bulkActions = readFileSync(
    "src/components/admin/bulk-actions-bar.tsx",
    "utf8",
  );
  assert.doesNotMatch(bulkActions, /run\("activate"\)/);
});
