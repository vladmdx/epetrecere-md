"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Loader2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { OnboardingAgreement } from "@/components/legal/onboarding-agreement";
import { useOnboardingAgreement } from "@/hooks/use-onboarding-agreement";
import { onboardingSubmitDisabled } from "@/lib/legal/onboarding-submit";
import { localizePath } from "@/lib/i18n/routing";
import { useLocale } from "@/hooks/use-locale";
import { MOLDOVA_CITIES, DEFAULT_CITY } from "@/lib/moldova-cities";
import type { ESignatureValue } from "@/components/legal/e-signature";
import { TranslateMissingFields } from "@/components/vendor/translate-missing-fields";
import {
  clearPendingHallCreateRequest,
  clearPendingOrganizationCreateRequest,
  discardPendingOrganizationCreateRequest,
  discardPendingHallCreateRequest,
  hallCreateRequestPayload,
  hasPendingHallCreateRequestSlot,
  hasPendingOrganizationCreateRequestSlot,
  newPendingHallCreateRequest,
  newPendingOrganizationProfileCreateRequest,
  normalizeHallCreateRequestId,
  normalizeOrganizationCreateRequestId,
  normalizeVenueCreateRequestId,
  organizationCreateRequestPayload,
  persistPendingHallCreateRequest,
  persistPendingOrganizationCreateRequest,
  readPendingHallCreateRequest,
  readPendingOrganizationCreateRequest,
  type HallCreateRequestPayload,
  type PendingHallCreateRequest,
  venueOnboardingUrl,
} from "@/lib/partner/onboarding-create-request";
import {
  clearPendingVenueCreateRequest,
  discardPendingVenueCreateRequest,
  hasPendingVenueCreateRequestSlot,
  newPendingVenueCreateRequest,
  persistPendingVenueCreateRequest,
  readPendingVenueCreateRequest,
  venueCreateRequestPayload,
  type PendingVenueCreateRequest,
  type VenueCreateRequestPayload,
} from "@/lib/partner/venue-create-request";
import {
  resolveOnboardingFlow,
  type RecoverableOnboardingDraft,
  type RecoverableOnboardingVenue,
  type RecoverableOrganizationCreate,
} from "@/lib/partner/onboarding-flow";

const STEPS = ["Organizație", "Contract", "Local", "Sală", "Trimitere"];

type Missing = { step: string; field: string; message: string; path: string };
const READINESS_MESSAGES: Record<string, string> = {
  organization_required: "Selectează o organizație pentru acest local.",
  display_name_required: "Completează numele organizației (minimum 2 caractere).",
  legal_name_invalid: "Completează denumirea juridică (minimum 2 caractere).",
  moldovan_id_must_have_13_digits: "IDNP/IDNO trebuie să conțină exact 13 cifre.",
  legal_address_invalid: "Completează adresa juridică (minimum 5 caractere).",
  current_signed_contract_required: "Semnează contractul organizației înainte de trimitere.",
  venue_required: "Selectează un local.",
  venue_name_required: "Completează numele localului (minimum 2 caractere).",
  address_required: "Completează adresa localului (minimum 5 caractere).",
  city_required: "Alege orașul localului.",
  images_required: "Adaugă cel puțin o fotografie a localului.",
  at_least_one_hall: "Adaugă cel puțin o sală.",
  hall_selection_invalid: "Selectează o sală validă.",
  hall_name_required: "Completează numele sălii.",
  capacity_required: "Completează capacitatea sălii.",
  hall_images_required: "Adaugă cel puțin o fotografie a sălii.",
  hall_slug_required: "Verifică denumirea sălii.",
  at_least_one_submittable_hall: "Completează cel puțin o sală înainte de trimitere.",
};

function readinessMessage(issue: Missing): string {
  return READINESS_MESSAGES[issue.message] ?? "Verifică informațiile obligatorii din acest pas.";
}

type OnboardingScopeToken = Readonly<{
  actorId: string;
  identity: string;
  epoch: number;
}>;

const EMPTY_ORGANIZATION_FORM = {
  displayName: "",
  type: "company" as "individual" | "sole_trader" | "company",
  legalName: "",
  idNumber: "",
  legalAddress: "",
  billingEmail: "",
  billingPhone: "",
};
const EMPTY_VENUE_FORM = {
  name: "",
  phone: "",
  city: DEFAULT_CITY,
  address: "",
  descriptionRo: "",
  nameRu: "",
  nameEn: "",
  descriptionRu: "",
  descriptionEn: "",
  imageUrls: [] as string[],
};
const EMPTY_HALL_FORM = {
  nameRo: "Sala principală",
  nameRu: "",
  nameEn: "",
  capacityMin: "50",
  capacityMax: "200",
  pricingModel: "quote" as "per_person" | "minimum_order" | "fixed" | "quote",
};

function venueFormFrom(candidate: RecoverableOnboardingVenue) {
  return {
    name: candidate.nameRo ?? "",
    phone: candidate.phone ?? "",
    city: candidate.city ?? DEFAULT_CITY,
    address: candidate.address ?? "",
    descriptionRo: candidate.descriptionRo ?? "",
    nameRu: candidate.nameRu ?? "",
    nameEn: candidate.nameEn ?? "",
    descriptionRu: candidate.descriptionRu ?? "",
    descriptionEn: candidate.descriptionEn ?? "",
    imageUrls: Array.isArray(candidate.images)
      ? candidate.images
          .filter((image) => image.hallId == null && typeof image.url === "string")
          .map((image) => image.url as string)
      : [],
  };
}

function textValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function venueFormFromCreatePayload(payload: VenueCreateRequestPayload) {
  return {
    name: textValue(payload.name),
    phone: textValue(payload.phone),
    city: textValue(payload.city) || DEFAULT_CITY,
    address: textValue(payload.address),
    descriptionRo: textValue(payload.descriptionRo),
    nameRu: textValue(payload.nameRu),
    nameEn: textValue(payload.nameEn),
    descriptionRu: textValue(payload.descriptionRu),
    descriptionEn: textValue(payload.descriptionEn),
    imageUrls: Array.isArray(payload.imageUrls)
      ? payload.imageUrls.filter((value): value is string => typeof value === "string")
      : [],
  };
}

function venueCreatePayloadFromForm(
  form: typeof EMPTY_VENUE_FORM,
  includeImages = true,
) {
  return {
    name: form.name,
    phone: form.phone,
    city: form.city,
    address: form.address,
    descriptionRo: form.descriptionRo || null,
    nameRu: form.nameRu || null,
    nameEn: form.nameEn || null,
    descriptionRu: form.descriptionRu || null,
    descriptionEn: form.descriptionEn || null,
    ...(includeImages ? { imageUrls: [...form.imageUrls] } : {}),
  };
}

function hallFormFromCreatePayload(payload: HallCreateRequestPayload) {
  const pricingModel = ["per_person", "minimum_order", "fixed", "quote"].includes(
    String(payload.pricingModel),
  )
    ? payload.pricingModel as typeof EMPTY_HALL_FORM.pricingModel
    : "quote";
  return {
    nameRo: textValue(payload.nameRo) || "Sala principală",
    nameRu: textValue(payload.nameRu),
    nameEn: textValue(payload.nameEn),
    capacityMin: payload.capacityMin == null ? "" : String(payload.capacityMin),
    capacityMax: payload.capacityMax == null ? "" : String(payload.capacityMax),
    pricingModel,
  };
}

function hallCreatePayloadFromForm(form: typeof EMPTY_HALL_FORM) {
  return {
    nameRo: form.nameRo,
    nameRu: form.nameRu || null,
    nameEn: form.nameEn || null,
    capacityMin: form.capacityMin ? Number(form.capacityMin) : null,
    capacityMax: form.capacityMax ? Number(form.capacityMax) : null,
    pricingModel: form.pricingModel,
  };
}

export default function MultiHallVenueOnboarding() {
  const { locale } = useLocale();
  const router = useRouter();
  const search = useSearchParams();
  const { isLoaded: userLoaded, user } = useUser();
  const presetOrg = Number(search.get("organizationId") || "") || null;
  const presetVenue = Number(search.get("venueId") || "") || null;
  const createIntent = search.get("intent") === "create";
  const createOrganizationIntent = search.get("organizationIntent") === "create";
  const presetCreateRequestId = normalizeVenueCreateRequestId(search.get("createRequestId"));
  const presetOrganizationCreateRequestId = normalizeOrganizationCreateRequestId(
    search.get("organizationCreateRequestId"),
  );
  const presetHallCreateRequestId = normalizeHallCreateRequestId(
    search.get("hallCreateRequestId"),
  );
  const onboardingScopeIdentity = userLoaded && user?.id
    ? [
        user.id,
        presetOrg ?? "no-org",
        presetVenue ?? "no-venue",
        createIntent ? "create-venue" : "resume-venue",
        createOrganizationIntent ? "create-organization" : "resume-organization",
      ].join(":")
    : null;
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [uploadingVenueImages, setUploadingVenueImages] = useState(false);
  const [organizationId, setOrganizationId] = useState<number | null>(presetOrg);
  const [venueId, setVenueId] = useState<number | null>(null);
  const [createRequestId, setCreateRequestId] = useState<string | null>(
    createIntent && presetCreateRequestId ? presetCreateRequestId : null,
  );
  const [organizationCreateRequestId, setOrganizationCreateRequestId] = useState<string | null>(
    presetOrganizationCreateRequestId,
  );
  const [hallId, setHallId] = useState<number | null>(null);
  const [hallStatus, setHallStatus] = useState<string | null>(null);
  const [hallCreateRequestId, setHallCreateRequestId] = useState<string | null>(
    presetHallCreateRequestId,
  );
  const [hasContract, setHasContract] = useState(false);
  const [missing, setMissing] = useState<Missing[]>([]);
  const [signature, setSignature] = useState<ESignatureValue | null>(null);
  const [showAgreementValidation, setShowAgreementValidation] = useState(false);
  const [availableDrafts, setAvailableDrafts] = useState<RecoverableOnboardingDraft[]>([]);
  const [availableUnattachedVenues, setAvailableUnattachedVenues] = useState<RecoverableOnboardingVenue[]>([]);
  const [venueNeedsAttachment, setVenueNeedsAttachment] = useState(false);
  const [selectionIssue, setSelectionIssue] = useState<
    | "ORGANIZATION_SELECTION_REQUIRED"
    | "ORGANIZATION_CREATE_PENDING"
    | "VENUE_SELECTION_REQUIRED"
    | "UNATTACHED_VENUE_SELECTION_REQUIRED"
    | "INVALID_SELECTION"
    | null
  >(null);
  const [hasPendingOrganizationCreate, setHasPendingOrganizationCreate] = useState(false);
  const [organizationCreateRecoveryOnly, setOrganizationCreateRecoveryOnly] = useState(false);
  const [hasPendingVenueCreate, setHasPendingVenueCreate] = useState(false);
  const [venueCreateRecoveryOnly, setVenueCreateRecoveryOnly] = useState(false);
  const [resolvedVenueCreateIdentity, setResolvedVenueCreateIdentity] = useState<string | null>(null);
  const [hasPendingHallCreate, setHasPendingHallCreate] = useState(false);
  const [hallCreateRecoveryOnly, setHallCreateRecoveryOnly] = useState(false);
  const [resolvedHallCreateIdentity, setResolvedHallCreateIdentity] = useState<string | null>(null);
  const [onboardingLoaded, setOnboardingLoaded] = useState(false);
  const [onboardingLoadError, setOnboardingLoadError] = useState<string | null>(null);
  const [onboardingLoadAttempt, setOnboardingLoadAttempt] = useState(0);
  const [resolvedActorId, setResolvedActorId] = useState<string | null>(null);
  const [organizationCapabilities, setOrganizationCapabilities] = useState<
    RecoverableOrganizationCreate["capabilities"] | null
  >(null);
  const actorMatchesResolved = Boolean(user?.id && resolvedActorId === user.id);
  const agreement = useOnboardingAgreement(
    "venue",
    actorMatchesResolved ? user?.id : undefined,
    locale,
    actorMatchesResolved ? organizationId ?? undefined : undefined,
  );
  const [org, setOrg] = useState({ ...EMPTY_ORGANIZATION_FORM });
  const [venue, setVenue] = useState({ ...EMPTY_VENUE_FORM });
  const [venueImagesDirty, setVenueImagesDirty] = useState(false);
  const [hall, setHall] = useState({ ...EMPTY_HALL_FORM });
  const actorRef = useRef<string | null | undefined>(undefined);
  const activeOnboardingScopeRef = useRef<string | null>(onboardingScopeIdentity);
  const resetOnboardingScopeRef = useRef<string | null>(null);
  const organizationHistoryKeyRef = useRef<string | null>(presetOrganizationCreateRequestId);
  const pendingVenueCreateRef = useRef<PendingVenueCreateRequest | null>(null);
  const pendingHallCreateRef = useRef<PendingHallCreateRequest | null>(null);
  const onboardingRecoveryEpochRef = useRef(0);

  useLayoutEffect(() => {
    if (activeOnboardingScopeRef.current === onboardingScopeIdentity) return;
    activeOnboardingScopeRef.current = onboardingScopeIdentity;
    // Browser Back/Forward and same-account organization/venue changes must
    // invalidate in-flight saves just as an account switch does.
    onboardingRecoveryEpochRef.current += 1;
  }, [onboardingScopeIdentity]);

  useEffect(() => {
    const actorId = user?.id ?? null;
    if (actorRef.current === actorId) return;
    actorRef.current = actorId;
    onboardingRecoveryEpochRef.current += 1;
    // Clerk can switch accounts without remounting this component. Erase all
    // previous actor data before any URL identity is resolved for the new one.
    setOnboardingLoaded(false);
    setOnboardingLoadError(null);
    setBusy(false);
    setUploadingVenueImages(false);
    setStep(0);
    setOrganizationId(null);
    setVenueId(null);
    setHallId(null);
    setHallStatus(null);
    setCreateRequestId(null);
    setOrganizationCreateRequestId(null);
    setHallCreateRequestId(null);
    pendingVenueCreateRef.current = null;
    pendingHallCreateRef.current = null;
    setHasPendingVenueCreate(false);
    setVenueCreateRecoveryOnly(false);
    setResolvedVenueCreateIdentity(null);
    setHasPendingHallCreate(false);
    setHallCreateRecoveryOnly(false);
    setResolvedHallCreateIdentity(null);
    setSelectionIssue(null);
    setAvailableDrafts([]);
    setAvailableUnattachedVenues([]);
    setVenueNeedsAttachment(false);
    setHasContract(false);
    setOrganizationCapabilities(null);
    setMissing([]);
    setSignature(null);
    setShowAgreementValidation(false);
    setOrg({ ...EMPTY_ORGANIZATION_FORM });
    setVenue({ ...EMPTY_VENUE_FORM });
    setVenueImagesDirty(false);
    setHall({ ...EMPTY_HALL_FORM });
    setHasPendingOrganizationCreate(false);
    setOrganizationCreateRecoveryOnly(false);
    setResolvedActorId(actorId);
  }, [user?.id]);

  useEffect(() => {
    if (!onboardingScopeIdentity) return;
    if (resetOnboardingScopeRef.current === onboardingScopeIdentity) return;
    resetOnboardingScopeRef.current = onboardingScopeIdentity;

    // The App Router can reuse this component when only the query changes.
    // Clear all scope-bound form data before resolving the new URL so an
    // Edit -> Add or organization A -> B navigation cannot clone stale data.
    setOnboardingLoaded(false);
    setOnboardingLoadError(null);
    setBusy(false);
    setUploadingVenueImages(false);
    if (createIntent && presetVenue == null) setStep(0);
    setOrganizationId(presetOrg);
    setVenueId(null);
    setHallId(null);
    setHallStatus(null);
    setCreateRequestId(createIntent ? presetCreateRequestId : null);
    setOrganizationCreateRequestId(presetOrganizationCreateRequestId);
    setHallCreateRequestId(presetHallCreateRequestId);
    pendingVenueCreateRef.current = null;
    pendingHallCreateRef.current = null;
    setHasPendingOrganizationCreate(false);
    setOrganizationCreateRecoveryOnly(false);
    setHasPendingVenueCreate(false);
    setVenueCreateRecoveryOnly(false);
    setResolvedVenueCreateIdentity(null);
    setHasPendingHallCreate(false);
    setHallCreateRecoveryOnly(false);
    setResolvedHallCreateIdentity(null);
    setSelectionIssue(null);
    setAvailableDrafts([]);
    setAvailableUnattachedVenues([]);
    setVenueNeedsAttachment(false);
    setHasContract(false);
    setOrganizationCapabilities(null);
    setMissing([]);
    setSignature(null);
    setShowAgreementValidation(false);
    setOrg({ ...EMPTY_ORGANIZATION_FORM });
    setVenue({ ...EMPTY_VENUE_FORM });
    setVenueImagesDirty(false);
    setHall({ ...EMPTY_HALL_FORM });
  }, [
    createIntent,
    onboardingScopeIdentity,
    presetCreateRequestId,
    presetHallCreateRequestId,
    presetOrg,
    presetOrganizationCreateRequestId,
    presetVenue,
  ]);

  const actorReady = userLoaded && actorMatchesResolved;
  const venueCreateIdentity = actorReady && user?.id
    ? `${user.id}:${createIntent ? presetOrg ?? "no-org" : "update"}:${presetCreateRequestId ?? "no-key"}`
    : null;
  const hallCreateIdentity = actorReady && user?.id
    ? `${user.id}:${presetVenue ?? "no-venue"}:${presetHallCreateRequestId ?? "no-key"}`
    : null;

  function captureScopeToken(actorId: string): OnboardingScopeToken | null {
    const identity = activeOnboardingScopeRef.current;
    if (!identity || actorRef.current !== actorId) return null;
    return {
      actorId,
      identity,
      epoch: onboardingRecoveryEpochRef.current,
    };
  }

  function isScopeTokenCurrent(token: OnboardingScopeToken): boolean {
    return actorRef.current === token.actorId
      && activeOnboardingScopeRef.current === token.identity
      && onboardingRecoveryEpochRef.current === token.epoch;
  }

  useEffect(() => {
    // A signature is legal-scope data. Even the same Clerk actor must sign
    // afresh when the selected organization changes.
    setSignature(null);
    setShowAgreementValidation(false);
  }, [organizationId]);

  useEffect(() => {
    setHasPendingOrganizationCreate(false);
    setOrganizationCreateRecoveryOnly(false);
    if (!user?.id) {
      setOrganizationCreateRequestId(presetOrganizationCreateRequestId);
      return;
    }
    const pending = readPendingOrganizationCreateRequest(window.sessionStorage, user.id);
    const slotOccupied = hasPendingOrganizationCreateRequestSlot(
      window.sessionStorage,
      user.id,
    );
    const effectiveKey = pending?.requestId ?? presetOrganizationCreateRequestId;
    const organizationKeyChanged = organizationHistoryKeyRef.current !== effectiveKey;
    organizationHistoryKeyRef.current = effectiveKey;
    setOrganizationCreateRequestId(effectiveKey);
    if (!pending) {
      setOrganizationCreateRecoveryOnly(Boolean(effectiveKey || slotOccupied));
      if (organizationKeyChanged) setOrg({ ...EMPTY_ORGANIZATION_FORM });
      return;
    }
    if (pending.requestId !== presetOrganizationCreateRequestId) {
      const params = new URLSearchParams(search.toString());
      params.set("organizationCreateRequestId", pending.requestId);
      router.replace(venueOnboardingUrl(locale, params));
    }
    setHasPendingOrganizationCreate(true);
    setOrg({
      displayName: pending.displayName,
      type: pending.type,
      legalName: pending.legalName ?? "",
      idNumber: pending.idNumber ?? "",
      legalAddress: pending.legalAddress ?? "",
      billingEmail: pending.billingEmail ?? "",
      billingPhone: pending.billingPhone ?? "",
    });
  }, [
    locale,
    presetOrganizationCreateRequestId,
    router,
    search,
    user?.id,
  ]);

  useEffect(() => {
    if (!venueCreateIdentity || !user?.id) return;
    const actorId = user.id;
    pendingVenueCreateRef.current = null;
    setHasPendingVenueCreate(false);
    setVenueCreateRecoveryOnly(false);
    if (!createIntent || !presetOrg) {
      setCreateRequestId(createIntent ? presetCreateRequestId : null);
      setVenueCreateRecoveryOnly(Boolean(createIntent && presetCreateRequestId));
      setResolvedVenueCreateIdentity(venueCreateIdentity);
      return;
    }
    const pending = readPendingVenueCreateRequest(
      window.sessionStorage,
      actorId,
      presetOrg,
    );
    const slotOccupied = hasPendingVenueCreateRequestSlot(
      window.sessionStorage,
      actorId,
      presetOrg,
    );
    const effectiveRequestId = pending?.requestId ?? presetCreateRequestId;
    pendingVenueCreateRef.current = pending;
    setHasPendingVenueCreate(Boolean(pending));
    setVenueCreateRecoveryOnly(Boolean(!pending && (effectiveRequestId || slotOccupied)));
    setCreateRequestId(effectiveRequestId);
    if (pending) {
      setVenue(venueFormFromCreatePayload(pending.payload));
      setVenueImagesDirty(false);
      if (pending.requestId !== presetCreateRequestId) {
        const params = new URLSearchParams(search.toString());
        params.set("intent", "create");
        params.set("createRequestId", pending.requestId);
        window.history.replaceState(
          window.history.state,
          "",
          venueOnboardingUrl(locale, params),
        );
      }
    }
    setResolvedVenueCreateIdentity(venueCreateIdentity);
  }, [
    createIntent,
    locale,
    presetCreateRequestId,
    presetOrg,
    search,
    user?.id,
    venueCreateIdentity,
  ]);

  useEffect(() => {
    if (!hallCreateIdentity || !user?.id) return;
    const actorId = user.id;
    pendingHallCreateRef.current = null;
    setHasPendingHallCreate(false);
    setHallCreateRecoveryOnly(false);
    if (!presetVenue) {
      setHallCreateRequestId(presetHallCreateRequestId);
      setHallCreateRecoveryOnly(Boolean(presetHallCreateRequestId));
      setResolvedHallCreateIdentity(hallCreateIdentity);
      return;
    }
    const pending = readPendingHallCreateRequest(
      window.sessionStorage,
      actorId,
      presetVenue,
    );
    const slotOccupied = hasPendingHallCreateRequestSlot(
      window.sessionStorage,
      actorId,
      presetVenue,
    );
    const effectiveRequestId = pending?.requestId ?? presetHallCreateRequestId;
    pendingHallCreateRef.current = pending;
    setHasPendingHallCreate(Boolean(pending));
    setHallCreateRecoveryOnly(Boolean(!pending && (effectiveRequestId || slotOccupied)));
    setHallCreateRequestId(effectiveRequestId);
    if (pending) {
      setHall(hallFormFromCreatePayload(pending.payload));
      if (pending.requestId !== presetHallCreateRequestId) {
        const params = new URLSearchParams(search.toString());
        params.set("hallCreateRequestId", pending.requestId);
        window.history.replaceState(
          window.history.state,
          "",
          venueOnboardingUrl(locale, params),
        );
      }
    }
    setResolvedHallCreateIdentity(hallCreateIdentity);
  }, [
    hallCreateIdentity,
    locale,
    presetHallCreateRequestId,
    presetVenue,
    search,
    user?.id,
  ]);

  function chooseOrganization(nextOrganizationId: number) {
    onboardingRecoveryEpochRef.current += 1;
    const params = new URLSearchParams({
      organizationId: String(nextOrganizationId),
    });
    if (createIntent) {
      params.set("intent", "create");
      if (createRequestId) params.set("createRequestId", createRequestId);
    }
    if (venueNeedsAttachment && venueId) {
      params.set("venueId", String(venueId));
    }
    // Block Continue until the URL-bound selection is fetched and verified.
    // Otherwise a fast second click can observe organizationId=null and turn
    // a selection into an unintended POST/create.
    setOnboardingLoaded(false);
    setOrganizationId(nextOrganizationId);
    setSelectionIssue(null);
    setOrganizationCreateRequestId(null);
    router.replace(venueOnboardingUrl(locale, params));
  }

  function chooseNewOrganization() {
    onboardingRecoveryEpochRef.current += 1;
    const params = new URLSearchParams();
    params.set("organizationIntent", "create");
    if (createIntent) {
      params.set("intent", "create");
      if (createRequestId) params.set("createRequestId", createRequestId);
    }
    if (venueNeedsAttachment && venueId) {
      params.set("venueId", String(venueId));
    }
    setOnboardingLoaded(false);
    setOrganizationId(null);
    setOrganizationCapabilities(null);
    setHasContract(false);
    setSelectionIssue(null);
    setOrg({ ...EMPTY_ORGANIZATION_FORM });
    setStep(0);
    router.replace(venueOnboardingUrl(locale, params));
  }

  function chooseVenue(nextVenue: RecoverableOnboardingVenue) {
    if (!organizationId) return;
    onboardingRecoveryEpochRef.current += 1;
    setOnboardingLoaded(false);
    setVenueId(nextVenue.id);
    setSelectionIssue(null);
    setCreateRequestId(null);
    setHallCreateRequestId(null);
    setVenueNeedsAttachment(false);
    router.replace(venueOnboardingUrl(locale, new URLSearchParams({
      organizationId: String(organizationId),
      venueId: String(nextVenue.id),
    })));
  }

  function chooseUnattachedVenue(nextVenue: RecoverableOnboardingVenue) {
    onboardingRecoveryEpochRef.current += 1;
    setOnboardingLoaded(false);
    setVenueId(nextVenue.id);
    setVenueNeedsAttachment(true);
    setSelectionIssue(null);
    setCreateRequestId(null);
    setHallCreateRequestId(null);
    const params = new URLSearchParams();
    if (organizationId) params.set("organizationId", String(organizationId));
    params.set("venueId", String(nextVenue.id));
    router.replace(venueOnboardingUrl(locale, params));
  }

  useEffect(() => {
    // Let the preceding effect persist durable request identities first. A
    // stale fetch must never canonicalize the URL and accidentally erase one.
    if (!user?.id || resolvedActorId !== user.id) return;
    if (
      !venueCreateIdentity
      || resolvedVenueCreateIdentity !== venueCreateIdentity
      || !hallCreateIdentity
      || resolvedHallCreateIdentity !== hallCreateIdentity
    ) return;
    const actorId = user.id;
    const recoveryEpoch = onboardingRecoveryEpochRef.current;
    let cancelled = false;
    setOnboardingLoaded(false);
    setOnboardingLoadError(null);
    void fetch("/api/partner/onboarding")
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Onboarding load failed (${response.status})`);
        }
        const data = await response.json();
        if (
          !data
          || !Array.isArray(data.drafts)
          || !Array.isArray(data.unattachedVenues)
        ) {
          throw new Error("Onboarding response is malformed");
        }
        return data;
      })
      .then((data) => {
        if (
          cancelled
          || actorRef.current !== actorId
          || onboardingRecoveryEpochRef.current !== recoveryEpoch
        ) return;
        const drafts = (data.drafts as RecoverableOnboardingDraft[]).filter(
          (draft) => draft.organization.capabilities?.manageVenues === true,
        );
        const unattachedVenues = data.unattachedVenues as RecoverableOnboardingVenue[];
        setAvailableDrafts(drafts);
        setAvailableUnattachedVenues(unattachedVenues);
        const resolution = resolveOnboardingFlow({
          drafts,
          organizationId: presetOrg,
          venueId: presetVenue,
          createIntent,
          organizationCreateRequestId,
          venueCreateRequestId: createRequestId,
          unattachedVenues,
          createOrganizationIntent,
        });

        if (resolution.kind === "invalid") {
          setSelectionIssue("INVALID_SELECTION");
          setOrganizationId(null);
          setVenueId(null);
          setHallId(null);
          setHallStatus(null);
          setOrganizationCapabilities(null);
          setVenueNeedsAttachment(false);
          return;
        }
        if (resolution.kind === "organization_selection_required") {
          setSelectionIssue("ORGANIZATION_SELECTION_REQUIRED");
          setOrganizationId(null);
          setVenueId(resolution.venueToAttach?.id ?? null);
          setHallId(null);
          setHallStatus(null);
          setVenueNeedsAttachment(Boolean(resolution.venueToAttach));
          if (resolution.venueToAttach) {
            setVenue(venueFormFrom(resolution.venueToAttach));
            setVenueImagesDirty(false);
          }
          setOrganizationCapabilities(null);
          return;
        }
        if (resolution.kind === "organization_create_pending") {
          setSelectionIssue("ORGANIZATION_CREATE_PENDING");
          setOrganizationId(null);
          setVenueId(resolution.venueToAttach?.id ?? null);
          setHallId(null);
          setHallStatus(null);
          setVenueNeedsAttachment(Boolean(resolution.venueToAttach));
          if (resolution.venueToAttach) {
            setVenue(venueFormFrom(resolution.venueToAttach));
            setVenueImagesDirty(false);
          }
          setOrganizationCapabilities(null);
          return;
        }
        if (resolution.kind === "unattached_venue_selection_required") {
          setSelectionIssue("UNATTACHED_VENUE_SELECTION_REQUIRED");
          setVenueId(null);
          setHallId(null);
          setHallStatus(null);
          setVenueNeedsAttachment(false);
          return;
        }

        const orgDraft = resolution.draft;
        const organization = orgDraft?.organization ?? null;
        if (organization) {
          if (
            resolution.kind === "resolved"
            && resolution.recoveredOrganization
            && user?.id
            && organizationCreateRequestId
          ) {
            const slotOccupied = hasPendingOrganizationCreateRequestSlot(
              window.sessionStorage,
              user.id,
            );
            if (slotOccupied && !clearPendingOrganizationCreateRequest(
              window.sessionStorage,
              user.id,
              organizationCreateRequestId,
            )) {
              setOrganizationCreateRecoveryOnly(true);
              setSelectionIssue("ORGANIZATION_CREATE_PENDING");
              setOrganizationId(null);
              setOrganizationCapabilities(null);
              return;
            }
            setHasPendingOrganizationCreate(false);
            setOrganizationCreateRecoveryOnly(false);
          }
          setOrganizationId(organization.id);
          setOrganizationCapabilities(organization.capabilities ?? null);
          setHasContract(Boolean(orgDraft?.hasValidContract));
          setOrg((prev) => ({
            ...prev,
            displayName: organization.displayName ?? "",
            type: organization.type ?? "company",
            legalName: organization.legalName ?? "",
            idNumber: organization.idNumber ?? "",
            legalAddress: organization.legalAddress ?? "",
            billingEmail: organization.billingEmail ?? "",
            billingPhone: organization.billingPhone ?? "",
          }));
        } else {
          setOrganizationId(null);
          setOrganizationCapabilities(null);
          setHasContract(false);
        }

        if (resolution.kind === "venue_selection_required") {
          setSelectionIssue("VENUE_SELECTION_REQUIRED");
          setVenueId(null);
          setHallId(null);
          setHallStatus(null);
          setOrganizationCreateRequestId(null);
          const canonical = new URLSearchParams({
            organizationId: String(resolution.draft.organization.id),
          });
          if (canonical.toString() !== search.toString()) {
            router.replace(venueOnboardingUrl(locale, canonical));
          }
          return;
        }

        setSelectionIssue(null);
        const selectedVenue = resolution.venue;
        setVenueNeedsAttachment(resolution.venueNeedsAttachment);
        let selectedHall: Record<string, unknown> | null = null;
        if (selectedVenue) {
          if (resolution.recoveredVenue && organization && createRequestId) {
            const slotOccupied = hasPendingVenueCreateRequestSlot(
              window.sessionStorage,
              actorId,
              organization.id,
            );
            if (slotOccupied && !clearPendingVenueCreateRequest(
              window.sessionStorage,
              actorId,
              organization.id,
              createRequestId,
            )) {
              setVenueId(null);
              setVenueCreateRecoveryOnly(true);
              return;
            }
            pendingVenueCreateRef.current = null;
            setHasPendingVenueCreate(false);
            setVenueCreateRecoveryOnly(false);
          }
          setVenueId(selectedVenue.id);
          setVenue(venueFormFrom(selectedVenue));
          setVenueImagesDirty(false);
          const halls = selectedVenue.halls ?? [];
          // A create key may recover only its own Hall. Falling back to an
          // unrelated first Hall would turn a lost POST into an unsafe PATCH.
          const h = hallCreateRequestId
            ? halls.find((candidate) =>
                typeof candidate.creationRequestId === "string"
                && candidate.creationRequestId.toLowerCase() === hallCreateRequestId)
            : halls[0];
          setHallId(null);
          if (h) {
            selectedHall = h;
            setHallId(Number(h.id));
            setHallStatus(typeof h.status === "string" ? h.status : null);
            if (hallCreateRequestId) {
              const slotOccupied = hasPendingHallCreateRequestSlot(
                window.sessionStorage,
                actorId,
                selectedVenue.id,
              );
              if (slotOccupied && !clearPendingHallCreateRequest(
                window.sessionStorage,
                actorId,
                selectedVenue.id,
                hallCreateRequestId,
              )) {
                setHallId(null);
                setHallStatus(null);
                setHallCreateRecoveryOnly(true);
                return;
              }
              pendingHallCreateRef.current = null;
              setHasPendingHallCreate(false);
              setHallCreateRecoveryOnly(false);
            }
            setHallCreateRequestId(null);
            setHall({
              nameRo: typeof h.nameRo === "string" ? h.nameRo : "Sala principală",
              nameRu: typeof h.nameRu === "string" ? h.nameRu : "",
              nameEn: typeof h.nameEn === "string" ? h.nameEn : "",
              capacityMin: String(h.capacityMin ?? 50),
              capacityMax: String(h.capacityMax ?? 200),
              pricingModel: ["per_person", "minimum_order", "fixed", "quote"].includes(String(h.pricingModel))
                ? h.pricingModel as typeof EMPTY_HALL_FORM.pricingModel
                : "quote",
            });
          }
          if (Array.isArray(selectedVenue.missing)) {
            setMissing(selectedVenue.missing as Missing[]);
          }
        } else {
          setVenueId(null);
          setHallId(null);
          setHallStatus(null);
          setVenueNeedsAttachment(false);
        }

        const canonical = new URLSearchParams();
        if (organization) canonical.set("organizationId", String(organization.id));
        if (selectedVenue && organization) {
          canonical.set("venueId", String(selectedVenue.id));
          setCreateRequestId(null);
          setOrganizationCreateRequestId(null);
          if (!selectedHall && hallCreateRequestId) {
            canonical.set("hallCreateRequestId", hallCreateRequestId);
          }
        } else if (selectedVenue && resolution.venueNeedsAttachment) {
          canonical.set("venueId", String(selectedVenue.id));
          if (createOrganizationIntent) canonical.set("organizationIntent", "create");
          if (organizationCreateRequestId) {
            canonical.set("organizationCreateRequestId", organizationCreateRequestId);
          }
        } else if (createIntent) {
          canonical.set("intent", "create");
          if (createRequestId) canonical.set("createRequestId", createRequestId);
          if (createOrganizationIntent) canonical.set("organizationIntent", "create");
          if (!organization && organizationCreateRequestId) {
            canonical.set("organizationCreateRequestId", organizationCreateRequestId);
          } else if (organization) {
            setOrganizationCreateRequestId(null);
          }
        } else if (!organization && organizationCreateRequestId) {
          canonical.set("organizationCreateRequestId", organizationCreateRequestId);
        } else if (organization) {
          setOrganizationCreateRequestId(null);
        }
        if (canonical.toString() !== search.toString()) {
          router.replace(venueOnboardingUrl(locale, canonical));
        }
      })
      .then(() => {
        if (
          !cancelled
          && actorRef.current === actorId
          && onboardingRecoveryEpochRef.current === recoveryEpoch
        ) setOnboardingLoaded(true);
      })
      .catch(() => {
        if (
          cancelled
          || actorRef.current !== actorId
          || onboardingRecoveryEpochRef.current !== recoveryEpoch
        ) return;
        setOnboardingLoaded(false);
        setOnboardingLoadError(
          "Datele de onboarding nu au putut fi încărcate. Reîncearcă înainte de a salva.",
        );
        setAvailableDrafts([]);
        setAvailableUnattachedVenues([]);
        setSelectionIssue(null);
        setOrganizationId(null);
        setVenueId(null);
        setHallId(null);
        setOrganizationCapabilities(null);
        setVenueNeedsAttachment(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    presetOrg,
    presetVenue,
    createIntent,
    createOrganizationIntent,
    createRequestId,
    hallCreateIdentity,
    organizationCreateRequestId,
    hallCreateRequestId,
    locale,
    onboardingLoadAttempt,
    router,
    resolvedActorId,
    resolvedHallCreateIdentity,
    resolvedVenueCreateIdentity,
    search,
    user?.id,
    venueCreateIdentity,
  ]);

  function jumpToMissing(list: Missing[]) {
    setMissing(list);
    const first = list[0];
    if (!first) return;
    const map: Record<string, number> = { organization: 0, legal: 1, contract: 1, venue: 2, hall: 3, submit: 4 };
    setStep(map[first.step] ?? 0);
    toast.error(readinessMessage(first));
  }

  function discardPendingOrganizationCreate() {
    const actorId = user?.id;
    if (
      !actorReady
      || !actorId
      || (!organizationCreateRequestId
        && !hasPendingOrganizationCreate
        && !organizationCreateRecoveryOnly)
    ) return;
    if (!window.confirm(
      "Renunță la această cerere numai dacă ești sigur că organizația nu a fost creată. Continuarea poate crea o organizație nouă.",
    )) return;
    onboardingRecoveryEpochRef.current += 1;
    if (!discardPendingOrganizationCreateRequest(
      window.sessionStorage,
      actorId,
    )) {
      toast.error("Cererea organizației nu a putut fi eliminată din browser.");
      return;
    }
    setHasPendingOrganizationCreate(false);
    setOrganizationCreateRecoveryOnly(false);
    setOrganizationCreateRequestId(null);
    setSelectionIssue(null);
    const retryUrl = new URLSearchParams(search.toString());
    retryUrl.delete("organizationCreateRequestId");
    retryUrl.delete("organizationIntent");
    window.history.replaceState(
      window.history.state,
      "",
      venueOnboardingUrl(locale, retryUrl),
    );
    setOnboardingLoaded(false);
    setOnboardingLoadAttempt((attempt) => attempt + 1);
  }

  function discardPendingVenueCreate() {
    const actorId = user?.id;
    if (!actorReady || !actorId || !organizationId || busy) return;
    if (!window.confirm(
      "Renunță numai dacă ești sigur că localul nu a fost creat. O cerere nouă poate crea un local duplicat.",
    )) return;
    onboardingRecoveryEpochRef.current += 1;
    if (!discardPendingVenueCreateRequest(
      window.sessionStorage,
      actorId,
      organizationId,
    )) {
      toast.error("Cererea salvată nu a putut fi eliminată din browser.");
      return;
    }
    pendingVenueCreateRef.current = null;
    setHasPendingVenueCreate(false);
    setVenueCreateRecoveryOnly(false);
    setCreateRequestId(null);
    const params = new URLSearchParams(search.toString());
    params.set("intent", "create");
    params.delete("createRequestId");
    window.history.replaceState(
      window.history.state,
      "",
      venueOnboardingUrl(locale, params),
    );
  }

  function discardPendingHallCreate() {
    const actorId = user?.id;
    if (!actorReady || !actorId || !venueId || busy) return;
    if (!window.confirm(
      "Renunță numai dacă ești sigur că sala nu a fost creată. O cerere nouă poate crea o sală duplicată.",
    )) return;
    onboardingRecoveryEpochRef.current += 1;
    if (!discardPendingHallCreateRequest(
      window.sessionStorage,
      actorId,
      venueId,
    )) {
      toast.error("Cererea sălii nu a putut fi eliminată din browser.");
      return;
    }
    pendingHallCreateRef.current = null;
    setHasPendingHallCreate(false);
    setHallCreateRecoveryOnly(false);
    setHallCreateRequestId(null);
    const params = new URLSearchParams(search.toString());
    params.delete("hallCreateRequestId");
    window.history.replaceState(
      window.history.state,
      "",
      venueOnboardingUrl(locale, params),
    );
  }

  async function uploadVenueImages(files: FileList | null) {
    const actorId = user?.id;
    if (
      !actorReady
      || !actorId
      || !files?.length
      || hasPendingVenueCreate
      || venueCreateRecoveryOnly
    ) return;
    const scopeToken = captureScopeToken(actorId);
    if (!scopeToken) return;
    const selected = Array.from(files);
    if (venue.imageUrls.length + selected.length > 10) {
      toast.error("Poți încărca cel mult 10 fotografii pentru local.");
      return;
    }
    if (selected.some((file) => file.size > 10 * 1024 * 1024)) {
      toast.error("Fiecare fotografie trebuie să fie mai mică de 10 MB.");
      return;
    }
    setUploadingVenueImages(true);
    const uploaded: string[] = [];
    try {
      for (const file of selected) {
        if (!isScopeTokenCurrent(scopeToken)) return;
        const formData = new FormData();
        formData.append("file", file);
        formData.append("folder", "venues");
        const response = await fetch("/api/upload", { method: "POST", body: formData });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || typeof data.url !== "string") {
          throw new Error(data.error || "Upload failed");
        }
        if (!isScopeTokenCurrent(scopeToken)) return;
        uploaded.push(data.url);
      }
      if (!isScopeTokenCurrent(scopeToken)) return;
      setVenue((current) => ({
        ...current,
        imageUrls: [...current.imageUrls, ...uploaded].slice(0, 10),
      }));
      setVenueImagesDirty(true);
      toast.success(uploaded.length === 1 ? "Fotografia a fost încărcată." : "Fotografiile au fost încărcate.");
    } catch (error) {
      if (isScopeTokenCurrent(scopeToken)) {
        if (uploaded.length > 0) {
          // Keep successful uploads reachable from the draft when a later
          // file fails instead of silently orphaning them in storage.
          setVenue((current) => ({
            ...current,
            imageUrls: [...current.imageUrls, ...uploaded].slice(0, 10),
          }));
          setVenueImagesDirty(true);
          toast.error(`${uploaded.length} fotografii au fost păstrate; restul nu s-au încărcat.`);
        } else {
          toast.error(error instanceof Error ? error.message : "Fotografiile nu au putut fi încărcate.");
        }
      }
    } finally {
      if (isScopeTokenCurrent(scopeToken)) setUploadingVenueImages(false);
    }
  }

  async function saveOrg() {
    if (!actorReady || !onboardingLoaded || onboardingLoadError) {
      toast.error("Datele de onboarding încă se încarcă. Reîncearcă imediat.");
      return false;
    }
    if (
      selectionIssue === "ORGANIZATION_SELECTION_REQUIRED" ||
      selectionIssue === "UNATTACHED_VENUE_SELECTION_REQUIRED" ||
      selectionIssue === "INVALID_SELECTION"
    ) {
      toast.error("Alege o organizație validă pentru acest local.");
      return false;
    }
    if (organizationId && organizationCapabilities?.manageVenues !== true) {
      toast.error("Nu ai permisiunea de a adăuga localuri în această organizație.");
      return false;
    }
    if (!organizationId && organizationCreateRecoveryOnly) {
      toast.error("Payload-ul original al organizației lipsește. Verifică din nou sau renunță explicit.");
      return false;
    }
    const actorId = user?.id;
    if (!actorId) return false;
    const scopeToken = captureScopeToken(actorId);
    if (!scopeToken) return false;
    setBusy(true);
    try {
      const method = organizationId ? "PATCH" : "POST";
      const url = organizationId ? `/api/organizations/${organizationId}` : "/api/organizations";
      let requestId = organizationCreateRequestId;
      const storedRequest = !organizationId && actorId
        ? readPendingOrganizationCreateRequest(window.sessionStorage, actorId)
        : null;
      const slotOccupied = !organizationId
        ? hasPendingOrganizationCreateRequestSlot(window.sessionStorage, actorId)
        : false;
      if (!organizationId && !storedRequest && slotOccupied) {
        setOrganizationCreateRecoveryOnly(true);
        toast.error("Slotul de recuperare al organizației este ocupat. Renunță explicit înainte de o cerere nouă.");
        return false;
      }
      // A still-ambiguous operation always wins over a bare/new URL. Never
      // overwrite the actor's sole recovery slot with a different key.
      if (!organizationId && storedRequest) {
        requestId = storedRequest.requestId;
        setOrganizationCreateRequestId(storedRequest.requestId);
      }
      let generatedRequestId = false;
      if (!organizationId && !requestId) {
        requestId = crypto.randomUUID();
        generatedRequestId = true;
        setOrganizationCreateRequestId(requestId);
      }
      if (!organizationId && !storedRequest && requestId && !generatedRequestId) {
        setOrganizationCreateRecoveryOnly(true);
        toast.error("Cheia organizației nu are payload-ul original. Verifică sau renunță explicit.");
        return false;
      }
      const request = !organizationId && actorId && requestId
        ? storedRequest ?? newPendingOrganizationProfileCreateRequest(org, requestId, actorId)
        : null;
      if (!organizationId && !request) {
        toast.error("Datele organizației nu pot fi salvate pentru reluare sigură.");
        return false;
      }
      if (!organizationId && requestId) {
        if (!persistPendingOrganizationCreateRequest(window.sessionStorage, request!)) {
          toast.error("Browserul nu poate salva cererea. Activează stocarea și reîncearcă.");
          return false;
        }
        setHasPendingOrganizationCreate(true);
        const params = new URLSearchParams(search.toString());
        params.set("organizationCreateRequestId", requestId);
        // Put the durable identity in history only after the exact request
        // body is safely frozen in actor-scoped sessionStorage.
        window.history.replaceState(
          window.history.state,
          "",
          venueOnboardingUrl(locale, params),
        );
      }
      const organizationPatch = organizationCapabilities?.manageLegal
        ? {
            ...org,
            legalName: org.legalName.trim() || null,
            idNumber: org.idNumber.trim() || null,
            legalAddress: org.legalAddress.trim() || null,
            billingEmail: org.billingEmail.trim() || null,
            billingPhone: org.billingPhone.trim() || null,
          }
        : organizationCapabilities?.manageBilling
          ? {
              displayName: org.displayName,
              billingEmail: org.billingEmail.trim() || null,
              billingPhone: org.billingPhone.trim() || null,
            }
          : { displayName: org.displayName };
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          organizationId
            ? organizationPatch
            : organizationCreateRequestPayload(request!),
        ),
      });
      const data = await res.json().catch(() => ({}));
      if (!isScopeTokenCurrent(scopeToken)) return false;
      if (!res.ok) {
        // Even a validation response cannot prove that an earlier request
        // with this key did not commit before its response was lost.
        toast.error(data.error || "Organizația nu a putut fi salvată");
        return false;
      }
      const savedOrganizationId = Number(data?.organization?.id);
      if (!Number.isSafeInteger(savedOrganizationId) || savedOrganizationId <= 0) {
        throw new Error("Organization create response is missing its id");
      }
      if (!organizationId && actorId && request) {
        if (!clearPendingOrganizationCreateRequest(
          window.sessionStorage,
          actorId,
          request.requestId,
        )) {
          setOrganizationCreateRecoveryOnly(true);
          toast.error("Organizația există, dar cererea salvată nu a putut fi curățată. Verifică din nou înainte de a continua.");
          return false;
        }
        setHasPendingOrganizationCreate(false);
        setOrganizationCreateRecoveryOnly(false);
      }
      setOrganizationId(savedOrganizationId);
      if (!organizationId) {
        setOrganizationCapabilities({
          manageVenues: true,
          manageBilling: true,
          manageLegal: true,
          manageMembers: true,
        });
      }
      setOrganizationCreateRequestId(null);
      const canonical = new URLSearchParams({
        organizationId: String(savedOrganizationId),
      });
      if (venueNeedsAttachment && venueId) {
        canonical.set("venueId", String(venueId));
      }
      if (createIntent) {
        canonical.set("intent", "create");
        if (createRequestId) canonical.set("createRequestId", createRequestId);
      }
      router.replace(venueOnboardingUrl(locale, canonical));
      return true;
    } catch {
      if (isScopeTokenCurrent(scopeToken)) {
        toast.error("Conexiunea s-a întrerupt. Reîncearcă: aceeași cerere va fi reluată sigur.");
      }
      return false;
    } finally {
      if (isScopeTokenCurrent(scopeToken)) setBusy(false);
    }
  }

  async function saveVenue() {
    const actorId = user?.id;
    if (!actorReady || !actorId || !onboardingLoaded || onboardingLoadError) return false;
    if (!organizationId) return false;
    if (uploadingVenueImages) {
      toast.error("Așteaptă finalizarea încărcării fotografiilor.");
      return false;
    }
    if (selectionIssue === "VENUE_SELECTION_REQUIRED" && !createIntent) {
      toast.error("Alege localul pe care vrei să-l continui.");
      return false;
    }
    if (!venueId && venueCreateRecoveryOnly) {
      toast.error("Payload-ul original lipsește. Verifică din nou sau renunță explicit la cerere.");
      return false;
    }
    const scopeToken = captureScopeToken(actorId);
    if (!scopeToken) return false;
    setBusy(true);
    try {
      let createRequest: PendingVenueCreateRequest | null = null;
      let requestBody: Record<string, unknown>;
      if (!venueId) {
        createRequest = pendingVenueCreateRef.current
          ?? readPendingVenueCreateRequest(
            window.sessionStorage,
            actorId,
            organizationId,
          );
        const slotOccupied = hasPendingVenueCreateRequestSlot(
          window.sessionStorage,
          actorId,
          organizationId,
        );
        if (!createRequest && slotOccupied) {
          setVenueCreateRecoveryOnly(true);
          toast.error("Slotul de recuperare al localului este ocupat. Renunță explicit înainte de o cerere nouă.");
          return false;
        }
        if (!createRequest) {
          createRequest = newPendingVenueCreateRequest(
            actorId,
            organizationId,
            createRequestId ?? crypto.randomUUID(),
            venueCreatePayloadFromForm(venue),
          );
        }
        if (
          !createRequest
          || !persistPendingVenueCreateRequest(window.sessionStorage, createRequest)
        ) {
          toast.error("Browserul nu poate salva exact cererea. Activează stocarea și reîncearcă.");
          return false;
        }
        pendingVenueCreateRef.current = createRequest;
        setHasPendingVenueCreate(true);
        setVenueCreateRecoveryOnly(false);
        setCreateRequestId(createRequest.requestId);
        const params = new URLSearchParams(search.toString());
        params.set("organizationId", String(organizationId));
        params.set("intent", "create");
        params.set("createRequestId", createRequest.requestId);
        // The exact body is durable before its key enters history, and the
        // key enters history before POST can leave this page.
        window.history.replaceState(
          window.history.state,
          "",
          venueOnboardingUrl(locale, params),
        );
        requestBody = venueCreateRequestPayload(createRequest);
      } else {
        requestBody = {
          ...venueCreatePayloadFromForm(venue, venueImagesDirty),
          organizationId,
          ...(venueId ? { venueId } : {}),
        };
      }
      const res = await fetch(`/api/organizations/${organizationId}/venues`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      const data = await res.json().catch(() => ({}));
      if (!isScopeTokenCurrent(scopeToken)) return false;
      if (!res.ok) {
        toast.error(data.error || "Localul nu a putut fi salvat");
        return false;
      }
      const savedVenueId = Number(data?.venue?.id);
      if (!Number.isSafeInteger(savedVenueId) || savedVenueId <= 0) {
        throw new Error("Venue create response is missing its id");
      }
      if (createRequest) {
        if (!clearPendingVenueCreateRequest(
          window.sessionStorage,
          actorId,
          organizationId,
          createRequest.requestId,
        )) {
          setVenueCreateRecoveryOnly(true);
          toast.error("Localul există, dar cererea salvată nu a putut fi curățată. Verifică din nou înainte de a continua.");
          return false;
        }
        pendingVenueCreateRef.current = null;
        setHasPendingVenueCreate(false);
        setVenueCreateRecoveryOnly(false);
        setCreateRequestId(null);
      }
      setVenueId(savedVenueId);
      setVenueImagesDirty(false);
      setVenueNeedsAttachment(false);
      if (hallId) {
        const authoritativeHall = Array.isArray(data.halls)
          ? data.halls.find((candidate: Record<string, unknown>) =>
              Number(candidate.id) === hallId)
          : null;
        if (!authoritativeHall || typeof authoritativeHall.status !== "string") {
          toast.error("Starea sălii nu a putut fi confirmată. Reîncarcă înainte de a continua.");
          setOnboardingLoaded(false);
          setOnboardingLoadAttempt((attempt) => attempt + 1);
          return false;
        }
        setHallStatus(authoritativeHall.status);
      }
      router.replace(venueOnboardingUrl(locale, new URLSearchParams({
        organizationId: String(organizationId),
        venueId: String(savedVenueId),
      })));
      return true;
    } catch {
      if (isScopeTokenCurrent(scopeToken)) {
        toast.error("Conexiunea s-a întrerupt. Reîncearcă salvarea localului.");
      }
      return false;
    } finally {
      if (isScopeTokenCurrent(scopeToken)) setBusy(false);
    }
  }

  async function saveHall() {
    const actorId = user?.id;
    if (!actorReady || !actorId || !onboardingLoaded || onboardingLoadError) return false;
    if (!venueId) return false;
    if (hallId && (hallStatus === "pending" || hallStatus === "active")) {
      return true;
    }
    if (!hallId && hallCreateRecoveryOnly) {
      toast.error("Payload-ul original al sălii lipsește. Verifică din nou sau renunță explicit.");
      return false;
    }
    const scopeToken = captureScopeToken(actorId);
    if (!scopeToken) return false;
    setBusy(true);
    try {
      let createRequest: PendingHallCreateRequest | null = null;
      let requestBody: Record<string, unknown>;
      if (!hallId) {
        createRequest = pendingHallCreateRef.current
          ?? readPendingHallCreateRequest(window.sessionStorage, actorId, venueId);
        const slotOccupied = hasPendingHallCreateRequestSlot(
          window.sessionStorage,
          actorId,
          venueId,
        );
        if (!createRequest && slotOccupied) {
          setHallCreateRecoveryOnly(true);
          toast.error("Slotul de recuperare al sălii este ocupat. Renunță explicit înainte de o cerere nouă.");
          return false;
        }
        if (!createRequest) {
          createRequest = newPendingHallCreateRequest(
            actorId,
            venueId,
            hallCreateRequestId ?? crypto.randomUUID(),
            hallCreatePayloadFromForm(hall),
          );
        }
        if (
          !createRequest
          || !persistPendingHallCreateRequest(window.sessionStorage, createRequest)
        ) {
          toast.error("Browserul nu poate salva exact cererea sălii. Activează stocarea și reîncearcă.");
          return false;
        }
        pendingHallCreateRef.current = createRequest;
        setHasPendingHallCreate(true);
        setHallCreateRecoveryOnly(false);
        setHallCreateRequestId(createRequest.requestId);
        const params = new URLSearchParams(search.toString());
        params.set("hallCreateRequestId", createRequest.requestId);
        window.history.replaceState(
          window.history.state,
          "",
          venueOnboardingUrl(locale, params),
        );
        requestBody = hallCreateRequestPayload(createRequest);
      } else {
        requestBody = hallCreatePayloadFromForm(hall);
      }
      const res = await fetch(
        hallId
          ? `/api/venues/${venueId}/halls/${hallId}`
          : `/api/venues/${venueId}/halls`,
        {
          method: hallId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!isScopeTokenCurrent(scopeToken)) return false;
      if (!res.ok) {
        toast.error(data.error || "Sala nu a putut fi salvată");
        return false;
      }
      const savedHallId = Number(data?.hall?.id);
      if (!Number.isSafeInteger(savedHallId) || savedHallId <= 0) {
        throw new Error("Hall create response is missing its id");
      }
      if (createRequest) {
        if (!clearPendingHallCreateRequest(
          window.sessionStorage,
          actorId,
          venueId,
          createRequest.requestId,
        )) {
          setHallCreateRecoveryOnly(true);
          toast.error("Sala există, dar cererea salvată nu a putut fi curățată. Verifică din nou înainte de a continua.");
          return false;
        }
        pendingHallCreateRef.current = null;
        setHasPendingHallCreate(false);
        setHallCreateRecoveryOnly(false);
      }
      setHallId(savedHallId);
      setHallStatus(typeof data.hall.status === "string" ? data.hall.status : "draft");
      setHallCreateRequestId(null);
      if (organizationId) {
        router.replace(venueOnboardingUrl(locale, new URLSearchParams({
          organizationId: String(organizationId),
          venueId: String(venueId),
        })));
      }
      return true;
    } catch {
      if (isScopeTokenCurrent(scopeToken)) {
        toast.error("Conexiunea s-a întrerupt. Reîncearcă: aceeași cerere va fi reluată sigur.");
      }
      return false;
    } finally {
      if (isScopeTokenCurrent(scopeToken)) setBusy(false);
    }
  }

  async function next() {
    if (!actorReady || !onboardingLoaded || onboardingLoadError) {
      toast.error("Datele de onboarding nu sunt pregătite. Reîncearcă încărcarea.");
      return;
    }
    const actorId = user?.id;
    if (!actorId) return;
    const scopeToken = captureScopeToken(actorId);
    if (!scopeToken) return;
    if (step === 0 && !(await saveOrg())) return;
    if (!isScopeTokenCurrent(scopeToken)) return;
    if (step === 1 && !hasContract) {
      try {
        await agreement.prepare(signature);
        if (!isScopeTokenCurrent(scopeToken)) return;
        setHasContract(true);
      } catch (error) {
        if (!isScopeTokenCurrent(scopeToken)) return;
        setShowAgreementValidation(true);
        toast.error(error instanceof Error ? error.message : "Semnează contractul");
        return;
      }
    }
    if (step === 2 && !(await saveVenue())) return;
    if (!isScopeTokenCurrent(scopeToken)) return;
    if (step === 3 && !(await saveHall())) return;
    if (!isScopeTokenCurrent(scopeToken)) return;
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  async function submit() {
    if (!actorReady || !onboardingLoaded || onboardingLoadError) {
      toast.error("Datele de onboarding nu sunt pregătite. Reîncearcă încărcarea.");
      return;
    }
    const actorId = user?.id;
    if (!actorId) return;
    const scopeToken = captureScopeToken(actorId);
    if (!scopeToken) return;
    if (!venueId) {
      toast.error("Salvează localul mai întâi");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/venues/${venueId}/submit-approval`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!isScopeTokenCurrent(scopeToken)) return;
      if (!res.ok) {
        jumpToMissing(data.missing ?? []);
        return;
      }
      if (data.submitted) {
        toast.success(data.skippedHallIds?.length
          ? `Sălile pregătite au fost trimise; ${data.skippedHallIds.length} săli incomplete rămân draft.`
          : "Trimis la aprobare");
      } else {
        toast.info(data.skippedHallIds?.length
          ? "Nu a fost trimisă o sală nouă; sălile incomplete rămân editabile."
          : "Cererea este deja trimisă sau aprobată.");
      }
      router.push(localizePath("/dashboard/locatii", locale));
    } catch {
      if (isScopeTokenCurrent(scopeToken)) {
        toast.error("Conexiunea s-a întrerupt. Reîncearcă trimiterea; operația este reluată sigur.");
      }
    } finally {
      if (isScopeTokenCurrent(scopeToken)) setBusy(false);
    }
  }

  if (!actorReady) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-gold" />
      </div>
    );
  }

  if (onboardingLoadError) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 py-12 text-center">
        <p className="text-sm text-red-400">{onboardingLoadError}</p>
        <Button
          type="button"
          variant="outline"
          onClick={() => setOnboardingLoadAttempt((attempt) => attempt + 1)}
        >
          Reîncearcă încărcarea
        </Button>
      </div>
    );
  }

  if (!onboardingLoaded) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-gold" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-6">
      <h1 className="font-heading text-2xl font-bold">Înregistrare local</h1>
      <div className="flex gap-2 text-xs">
        {STEPS.map((label, i) => (
          <span key={label} className={i === step ? "text-gold font-medium" : "text-muted-foreground"}>{i + 1}. {label}</span>
        ))}
      </div>
      {(selectionIssue === "ORGANIZATION_SELECTION_REQUIRED" ||
        selectionIssue === "INVALID_SELECTION") && (
        <div className="space-y-3 rounded-lg border border-amber-500/40 bg-amber-500/5 p-4">
          <p className="text-sm font-medium">
            {selectionIssue === "INVALID_SELECTION"
              ? "Organizația și localul din adresă nu corespund. Alege organizația corectă."
              : "Alege explicit organizația în care adaugi sau continui localul."}
          </p>
          <div className="flex flex-wrap gap-2">
            {availableDrafts.map((draft) => (
              <Button
                key={draft.organization.id}
                type="button"
                variant="outline"
                onClick={() => chooseOrganization(draft.organization.id)}
              >
                {draft.organization.displayName || `Organizație #${draft.organization.id}`}
              </Button>
            ))}
            <Button type="button" variant="outline" onClick={chooseNewOrganization}>
              Creează organizație nouă
            </Button>
          </div>
        </div>
      )}
      {(selectionIssue === "ORGANIZATION_CREATE_PENDING"
        || hasPendingOrganizationCreate
        || organizationCreateRecoveryOnly) && (
        <div className="space-y-3 rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 text-sm">
          <p>{hasPendingOrganizationCreate
            ? "Cererea de creare este în curs. Apasă Continuă pentru a relua exact aceeași cerere, fără a dubla organizația."
            : "Cheia cererii există, dar payload-ul original lipsește ori nu poate fi citit. Verifică serverul sau renunță explicit."}</p>
          <div className="flex flex-wrap gap-2">
            {organizationCreateRecoveryOnly && (
              <Button type="button" variant="outline" size="sm" onClick={() => setOnboardingLoadAttempt((attempt) => attempt + 1)}>
                Verifică din nou
              </Button>
            )}
            <Button type="button" variant="outline" size="sm" onClick={discardPendingOrganizationCreate}>
              Renunță și alege din nou
            </Button>
          </div>
        </div>
      )}
      {selectionIssue === "VENUE_SELECTION_REQUIRED" && (
        <div className="space-y-3 rounded-lg border border-amber-500/40 bg-amber-500/5 p-4">
          <p className="text-sm font-medium">Alege localul pe care vrei să-l continui.</p>
          <div className="flex flex-wrap gap-2">
            {(availableDrafts.find((draft) => draft.organization.id === organizationId)?.venues ?? [])
              .map((candidate) => (
                <Button
                  key={candidate.id}
                  type="button"
                  variant="outline"
                  onClick={() => chooseVenue(candidate)}
                >
                  {candidate.nameRo || `Local #${candidate.id}`}
                </Button>
              ))}
          </div>
        </div>
      )}
      {selectionIssue === "UNATTACHED_VENUE_SELECTION_REQUIRED" && (
        <div className="space-y-3 rounded-lg border border-amber-500/40 bg-amber-500/5 p-4">
          <p className="text-sm font-medium">Alege localul vechi pe care vrei să-l atașezi.</p>
          <div className="flex flex-wrap gap-2">
            {availableUnattachedVenues.map((candidate) => (
              <Button
                key={candidate.id}
                type="button"
                variant="outline"
                onClick={() => chooseUnattachedVenue(candidate)}
              >
                {candidate.nameRo || `Local #${candidate.id}`}
              </Button>
            ))}
          </div>
        </div>
      )}
      {missing[0] && <p role="alert" className="text-sm text-red-400">{readinessMessage(missing[0])}</p>}

      {step === 0 && (
        <fieldset disabled={hasPendingOrganizationCreate || organizationCreateRecoveryOnly} className="space-y-3 disabled:opacity-70">
          {organizationId && organizationCapabilities?.manageLegal !== true && (
            <p className="text-sm text-muted-foreground">
              Datele juridice sunt administrate de proprietarul organizației.
            </p>
          )}
          <Label>Nume organizație</Label>
          <Input
            value={org.displayName}
            disabled={Boolean(organizationId && organizationCapabilities?.manageVenues !== true)}
            onChange={(e) => setOrg({ ...org, displayName: e.target.value })}
          />
          <Label>Tip</Label>
          <select
            className="h-9 w-full rounded-md border bg-background px-3 text-sm"
            value={org.type}
            disabled={Boolean(organizationId && organizationCapabilities?.manageLegal !== true)}
            onChange={(e) => setOrg({ ...org, type: e.target.value as typeof org.type })}
          >
            <option value="company">company</option>
            <option value="sole_trader">sole_trader</option>
            <option value="individual">individual</option>
          </select>
          <Label>Denumire juridică</Label>
          <Input value={org.legalName} disabled={Boolean(organizationId && organizationCapabilities?.manageLegal !== true)} onChange={(e) => setOrg({ ...org, legalName: e.target.value })} />
          <Label>IDNP/IDNO</Label>
          <Input value={org.idNumber} disabled={Boolean(organizationId && organizationCapabilities?.manageLegal !== true)} onChange={(e) => setOrg({ ...org, idNumber: e.target.value })} />
          <Label>Adresă juridică</Label>
          <Input value={org.legalAddress} disabled={Boolean(organizationId && organizationCapabilities?.manageLegal !== true)} onChange={(e) => setOrg({ ...org, legalAddress: e.target.value })} />
          <Label>Email billing</Label>
          <Input value={org.billingEmail} disabled={Boolean(organizationId && organizationCapabilities?.manageBilling !== true)} onChange={(e) => setOrg({ ...org, billingEmail: e.target.value })} />
          <Label>Telefon billing</Label>
          <Input value={org.billingPhone} disabled={Boolean(organizationId && organizationCapabilities?.manageBilling !== true)} onChange={(e) => setOrg({ ...org, billingPhone: e.target.value })} />
        </fieldset>
      )}

      {step === 1 && (
        hasContract ? (
          <p className="text-sm text-emerald-400">Contractul organizației este valabil. Un local nou nu cere re-semnare.</p>
        ) : (
          <OnboardingAgreement
            key={`${resolvedActorId ?? "no-actor"}:${organizationId ?? "no-organization"}`}
            subjectType="venue"
            agreement={agreement}
            onChange={setSignature}
            initialIdentity={{
              partnerType: org.type,
              legalName: org.legalName.trim(),
              idNumber: org.idNumber.trim() || null,
              legalAddress: org.legalAddress.trim() || null,
              representativeName: null,
            }}
            showValidation={showAgreementValidation}
          />
        )
      )}

      {step === 2 && (
        <div className="space-y-3">
          {!venueId && (hasPendingVenueCreate || venueCreateRecoveryOnly) && (
            <div className="space-y-3 rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 text-sm">
              <p>{hasPendingVenueCreate
                ? "Cererea localului este înghețată. Apasă Continuă pentru a retrimite exact aceleași date."
                : "Cheia cererii există, dar payload-ul original lipsește. Verifică serverul sau renunță explicit."}</p>
              <div className="flex flex-wrap gap-2">
                {venueCreateRecoveryOnly && (
                  <Button type="button" variant="outline" size="sm" onClick={() => setOnboardingLoadAttempt((attempt) => attempt + 1)}>
                    Verifică din nou
                  </Button>
                )}
                <Button type="button" variant="outline" size="sm" onClick={discardPendingVenueCreate}>
                  Renunță și corectează
                </Button>
              </div>
            </div>
          )}
          <fieldset
            disabled={busy || uploadingVenueImages || hasPendingVenueCreate || venueCreateRecoveryOnly}
            className="space-y-3 disabled:opacity-70"
          >
            <Label>Nume local</Label>
            <Input value={venue.name} onChange={(e) => setVenue({ ...venue, name: e.target.value })} />
            <Label>Telefon</Label>
            <Input value={venue.phone} onChange={(e) => setVenue({ ...venue, phone: e.target.value })} />
            <Label>Oraș</Label>
            <select className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={venue.city} onChange={(e) => setVenue({ ...venue, city: e.target.value })}>
              {MOLDOVA_CITIES.map((city) => <option key={city} value={city}>{city}</option>)}
            </select>
            <Label>Adresă</Label>
            <Input value={venue.address} onChange={(e) => setVenue({ ...venue, address: e.target.value })} />
            <Textarea placeholder="Descriere RO" value={venue.descriptionRo} onChange={(e) => setVenue({ ...venue, descriptionRo: e.target.value })} />
            <div className="space-y-2">
              <Label>Fotografii local (minimum una, maximum 10)</Label>
              {venue.imageUrls.map((url, index) => (
                <div key={`${url}-${index}`} className="flex items-center gap-2 rounded-md border px-3 py-2 text-xs">
                  <span className="min-w-0 flex-1 truncate">{index + 1}. {url}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Șterge fotografia ${index + 1}`}
                    onClick={() => {
                      setVenue((current) => ({
                        ...current,
                        imageUrls: current.imageUrls.filter((_, itemIndex) => itemIndex !== index),
                      }));
                      setVenueImagesDirty(true);
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <label className="inline-flex h-9 cursor-pointer items-center rounded-md border px-3 text-sm font-medium">
                {uploadingVenueImages
                  ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  : <Upload className="mr-2 h-4 w-4" />}
                Încarcă fotografii
                <input
                  className="sr-only"
                  type="file"
                  accept="image/*"
                  multiple
                  disabled={uploadingVenueImages || venue.imageUrls.length >= 10}
                  onChange={(event) => {
                    const input = event.currentTarget;
                    void uploadVenueImages(input.files).finally(() => { input.value = ""; });
                  }}
                />
              </label>
            </div>
            {venueId && (
              <TranslateMissingFields
                key={`${resolvedActorId}:${venueId}`}
                venueId={venueId}
                fields={{ name: { ro: venue.name, ru: venue.nameRu, en: venue.nameEn }, description: { ro: venue.descriptionRo, ru: venue.descriptionRu, en: venue.descriptionEn } }}
                onTranslated={(next) => {
                  if (
                    !onboardingScopeIdentity
                    || activeOnboardingScopeRef.current !== onboardingScopeIdentity
                    || actorRef.current !== user?.id
                  ) return;
                  setVenue((prev) => ({ ...prev, nameRu: next.name?.ru ?? prev.nameRu, nameEn: next.name?.en ?? prev.nameEn, descriptionRu: next.description?.ru ?? prev.descriptionRu, descriptionEn: next.description?.en ?? prev.descriptionEn }));
                }}
              />
            )}
          </fieldset>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-3">
          {!hallId && (hasPendingHallCreate || hallCreateRecoveryOnly) && (
            <div className="space-y-3 rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 text-sm">
              <p>{hasPendingHallCreate
                ? "Cererea sălii este înghețată. Apasă Continuă pentru a retrimite exact aceleași date."
                : "Cheia sălii există, dar payload-ul original lipsește. Verifică serverul sau renunță explicit."}</p>
              <div className="flex flex-wrap gap-2">
                {hallCreateRecoveryOnly && (
                  <Button type="button" variant="outline" size="sm" onClick={() => setOnboardingLoadAttempt((attempt) => attempt + 1)}>
                    Verifică din nou
                  </Button>
                )}
                <Button type="button" variant="outline" size="sm" onClick={discardPendingHallCreate}>
                  Renunță și corectează
                </Button>
              </div>
            </div>
          )}
          <fieldset
            disabled={hallStatus === "pending" || hallStatus === "active" || hasPendingHallCreate || hallCreateRecoveryOnly}
            className="space-y-3 disabled:opacity-70"
          >
            {(hallStatus === "pending" || hallStatus === "active") && (
              <p className="text-sm text-muted-foreground">
                Sala este deja {hallStatus === "pending" ? "trimisă la aprobare" : "activă"}; datele ei rămân nemodificate.
              </p>
            )}
            <Label>Nume sală RO</Label>
            <Input value={hall.nameRo} onChange={(e) => setHall({ ...hall, nameRo: e.target.value })} />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Min invitați</Label>
                <Input type="number" value={hall.capacityMin} onChange={(e) => setHall({ ...hall, capacityMin: e.target.value })} />
              </div>
              <div>
                <Label>Max invitați</Label>
                <Input type="number" value={hall.capacityMax} onChange={(e) => setHall({ ...hall, capacityMax: e.target.value })} />
              </div>
            </div>
          </fieldset>
        </div>
      )}

      {step === 4 && (
        <div className="space-y-3 text-sm">
          <p>Organizație #{organizationId} · Local #{venueId} · Sală #{hallId}</p>
          <p>Butonul rămâne activ. Serverul întoarce câmpurile lipsă; formularul rămâne editabil.</p>
        </div>
      )}

      <div className="flex justify-between">
        <Button type="button" variant="outline" disabled={step === 0 || busy} onClick={() => setStep((s) => s - 1)}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Înapoi
        </Button>
        {step < 4 ? (
          <Button type="button" className="bg-gold text-[#0D0D0D]" disabled={busy || uploadingVenueImages} onClick={() => void next()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Continuă <ArrowRight className="ml-1 h-4 w-4" /></>}
          </Button>
        ) : (
          <Button
            type="button"
            className="bg-gold text-[#0D0D0D]"
            disabled={onboardingSubmitDisabled({ busy, agreementLoading: agreement.loading, agreementStatus: hasContract ? "resumable" : agreement.value?.status })}
            onClick={() => void submit()}
          >
            Trimite la aprobare
          </Button>
        )}
      </div>
    </div>
  );
}
