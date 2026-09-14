import type { RecoverableVenueCreate } from "./onboarding-create-request";
import { findVenueCreateRetry } from "./onboarding-create-request";
import type { OrganizationCapabilities } from "./organization-dto";

export type RecoverableOrganizationCreate = {
  id: number;
  displayName?: string | null;
  type?: "individual" | "sole_trader" | "company" | null;
  legalName?: string | null;
  idNumber?: string | null;
  legalAddress?: string | null;
  billingEmail?: string | null;
  billingPhone?: string | null;
  /** Private onboarding DTO only; never an authorization credential. */
  creationRequestId?: string | null;
  capabilities?: OrganizationCapabilities;
};

export type RecoverableOnboardingVenue = RecoverableVenueCreate & {
  images?: Array<{
    id?: number;
    url?: string | null;
    hallId?: number | null;
  }>;
  halls?: Array<Record<string, unknown>>;
  missing?: Array<Record<string, unknown>>;
};

export type RecoverableOnboardingDraft = {
  organization: RecoverableOrganizationCreate;
  hasValidContract?: boolean;
  venues?: RecoverableOnboardingVenue[];
};

export type OnboardingFlowResolution =
  | {
      kind: "resolved";
      draft: RecoverableOnboardingDraft | null;
      venue: RecoverableOnboardingVenue | null;
      recoveredOrganization: boolean;
      recoveredVenue: boolean;
      venueNeedsAttachment: boolean;
    }
  | {
      kind: "organization_selection_required";
      drafts: RecoverableOnboardingDraft[];
      venueToAttach?: RecoverableOnboardingVenue | null;
    }
  | {
      kind: "organization_create_pending";
      requestId: string;
      venueToAttach?: RecoverableOnboardingVenue | null;
    }
  | {
      kind: "unattached_venue_selection_required";
      venues: RecoverableOnboardingVenue[];
    }
  | {
      kind: "venue_selection_required";
      draft: RecoverableOnboardingDraft;
      venues: RecoverableOnboardingVenue[];
    }
  | {
      kind: "invalid";
      code:
        | "ORGANIZATION_NOT_FOUND"
        | "VENUE_NOT_FOUND"
        | "VENUE_ORGANIZATION_MISMATCH"
        | "CREATE_INTENT_WITH_EXISTING_VENUE"
        | "ORGANIZATION_CREATE_INTENT_WITH_EXISTING_ORG"
        | "ORGANIZATION_CREATE_REQUEST_MISMATCH";
    };

function venuesOf(draft: RecoverableOnboardingDraft): RecoverableOnboardingVenue[] {
  return Array.isArray(draft.venues) ? draft.venues : [];
}

function resolveWithinOrganization(input: {
  draft: RecoverableOnboardingDraft;
  venueId: number | null;
  createIntent: boolean;
  venueCreateRequestId: string | null;
  recoveredOrganization: boolean;
}): OnboardingFlowResolution {
  const organizationVenues = venuesOf(input.draft);
  if (input.venueId != null) {
    const venue = organizationVenues.find((candidate) => candidate.id === input.venueId);
    if (!venue) {
      return { kind: "invalid", code: "VENUE_ORGANIZATION_MISMATCH" };
    }
    return {
      kind: "resolved",
      draft: input.draft,
      venue,
      recoveredOrganization: input.recoveredOrganization,
      recoveredVenue: false,
      venueNeedsAttachment: false,
    };
  }

  if (input.createIntent) {
    const recovered = findVenueCreateRetry(
      organizationVenues,
      input.venueCreateRequestId,
    );
    return {
      kind: "resolved",
      draft: input.draft,
      venue: recovered,
      recoveredOrganization: input.recoveredOrganization,
      recoveredVenue: Boolean(recovered),
      venueNeedsAttachment: false,
    };
  }

  if (organizationVenues.length === 1) {
    return {
      kind: "resolved",
      draft: input.draft,
      venue: organizationVenues[0]!,
      recoveredOrganization: input.recoveredOrganization,
      recoveredVenue: false,
      venueNeedsAttachment: false,
    };
  }
  if (organizationVenues.length > 1) {
    return {
      kind: "venue_selection_required",
      draft: input.draft,
      venues: organizationVenues,
    };
  }
  return {
    kind: "resolved",
    draft: input.draft,
    venue: null,
    recoveredOrganization: input.recoveredOrganization,
    recoveredVenue: false,
    venueNeedsAttachment: false,
  };
}

function resolveUnattachedVenue(
  draft: RecoverableOnboardingDraft | null,
  venue: RecoverableOnboardingVenue,
  recoveredOrganization: boolean,
): OnboardingFlowResolution {
  return {
    kind: "resolved",
    draft,
    venue,
    recoveredOrganization,
    recoveredVenue: false,
    venueNeedsAttachment: true,
  };
}

/**
 * Resolves URL identity without fallback-to-first behaviour. Explicit
 * organization/venue pairs must match; a URL-less flow resumes only when the
 * organization (and, where needed, venue) candidate is unique.
 */
export function resolveOnboardingFlow(input: {
  drafts: RecoverableOnboardingDraft[];
  organizationId: number | null;
  venueId: number | null;
  createIntent: boolean;
  organizationCreateRequestId: string | null;
  venueCreateRequestId: string | null;
  unattachedVenues?: RecoverableOnboardingVenue[];
  createOrganizationIntent?: boolean;
}): OnboardingFlowResolution {
  const drafts = input.drafts.filter((draft) => Number.isSafeInteger(draft.organization?.id));
  const unattachedVenues = (input.unattachedVenues ?? []).filter((venue) =>
    Number.isSafeInteger(venue.id));

  // `intent=create` is an operation identity, not a presentation hint. A
  // stale or forged venueId must never turn an explicit create flow into an
  // update of an existing venue. Lost-response recovery still works through
  // the durable venueCreateRequestId branch below.
  if (input.createIntent && input.venueId != null) {
    return { kind: "invalid", code: "CREATE_INTENT_WITH_EXISTING_VENUE" };
  }
  if (input.createOrganizationIntent && input.organizationId != null) {
    return {
      kind: "invalid",
      code: "ORGANIZATION_CREATE_INTENT_WITH_EXISTING_ORG",
    };
  }

  const explicitUnattachedVenue = input.venueId == null
    ? null
    : unattachedVenues.find((venue) => venue.id === input.venueId) ?? null;
  if (!input.createIntent && input.venueId == null && unattachedVenues.length > 1) {
    return { kind: "unattached_venue_selection_required", venues: unattachedVenues };
  }
  const venueToAttach = explicitUnattachedVenue
    ?? (!input.createIntent && input.venueId == null && unattachedVenues.length === 1
      ? unattachedVenues[0]!
      : null);

  // Creating a new legal holder is an explicit choice. Do not auto-bind an
  // organization-null legacy venue (or a new venue) to an existing company
  // merely because the actor currently has only one manageable membership.
  if (input.createOrganizationIntent && !input.organizationCreateRequestId) {
    return venueToAttach
      ? resolveUnattachedVenue(null, venueToAttach, false)
      : {
          kind: "resolved",
          draft: null,
          venue: null,
          recoveredOrganization: false,
          recoveredVenue: false,
          venueNeedsAttachment: false,
        };
  }

  // A durable organization-create key which already resolves is part of the
  // URL identity. Do not let a simultaneously supplied organization/venue id
  // silently redirect recovery to another accessible organization.
  if (input.organizationCreateRequestId) {
    const recovered = drafts.filter((draft) =>
      draft.organization.creationRequestId?.toLowerCase() ===
      input.organizationCreateRequestId?.toLowerCase());
    if (recovered.length > 1) {
      return {
        kind: "organization_selection_required",
        drafts: recovered,
        ...(venueToAttach ? { venueToAttach } : {}),
      };
    }
    if (recovered.length === 1) {
      const recoveredDraft = recovered[0]!;
      if (
        input.organizationId != null
        && input.organizationId !== recoveredDraft.organization.id
      ) {
        return { kind: "invalid", code: "ORGANIZATION_CREATE_REQUEST_MISMATCH" };
      }
      if (venueToAttach) {
        return resolveUnattachedVenue(recoveredDraft, venueToAttach, true);
      }
      return resolveWithinOrganization({
        draft: recoveredDraft,
        venueId: input.venueId,
        createIntent: input.createIntent,
        venueCreateRequestId: input.venueCreateRequestId,
        recoveredOrganization: true,
      });
    }

    // A supplied durable key is authoritative even before its row becomes
    // visible. Falling through to the single accessible draft here can bind a
    // lost create response to an unrelated organization and later duplicate
    // it. Keep the operation pending so the client can replay its frozen body.
    if (input.organizationId != null) {
      return { kind: "invalid", code: "ORGANIZATION_CREATE_REQUEST_MISMATCH" };
    }
    return {
      kind: "organization_create_pending",
      requestId: input.organizationCreateRequestId,
      ...(venueToAttach ? { venueToAttach } : {}),
    };
  }

  if (input.organizationId != null) {
    const draft = drafts.find((candidate) =>
      candidate.organization.id === input.organizationId);
    if (!draft) {
      if (venueToAttach) {
        return drafts.length === 0
          ? resolveUnattachedVenue(null, venueToAttach, false)
          : {
              kind: "organization_selection_required",
              drafts,
              venueToAttach,
            };
      }
      return { kind: "invalid", code: "ORGANIZATION_NOT_FOUND" };
    }
    if (venueToAttach) {
      return resolveUnattachedVenue(draft, venueToAttach, false);
    }
    return resolveWithinOrganization({
      draft,
      venueId: input.venueId,
      createIntent: input.createIntent,
      venueCreateRequestId: input.venueCreateRequestId,
      recoveredOrganization: false,
    });
  }

  if (input.venueId != null) {
    if (explicitUnattachedVenue) {
      if (drafts.length === 0) {
        return resolveUnattachedVenue(null, explicitUnattachedVenue, false);
      }
      return {
        kind: "organization_selection_required",
        drafts,
        venueToAttach: explicitUnattachedVenue,
      };
    }
    const matches = drafts.filter((draft) =>
      venuesOf(draft).some((venue) => venue.id === input.venueId));
    if (matches.length === 0) return { kind: "invalid", code: "VENUE_NOT_FOUND" };
    if (matches.length > 1) return { kind: "organization_selection_required", drafts: matches };
    return resolveWithinOrganization({
      draft: matches[0]!,
      venueId: input.venueId,
      createIntent: false,
      venueCreateRequestId: null,
      recoveredOrganization: false,
    });
  }


  if (venueToAttach) {
    if (drafts.length === 0) {
      return resolveUnattachedVenue(null, venueToAttach, false);
    }
    return {
      kind: "organization_selection_required",
      drafts,
      venueToAttach,
    };
  }

  if (drafts.length === 0) {
    return {
      kind: "resolved",
      draft: null,
      venue: null,
      recoveredOrganization: false,
      recoveredVenue: false,
      venueNeedsAttachment: false,
    };
  }
  if (drafts.length > 1) {
    return { kind: "organization_selection_required", drafts };
  }

  return resolveWithinOrganization({
    draft: drafts[0]!,
    venueId: null,
    createIntent: input.createIntent,
    venueCreateRequestId: input.venueCreateRequestId,
    recoveredOrganization: false,
  });
}
