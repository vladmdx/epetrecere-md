"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { ImagePlus, Loader2, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TranslateMissingFields } from "@/components/vendor/translate-missing-fields";
import { useLocale } from "@/hooks/use-locale";
import { localizePath } from "@/lib/i18n/routing";
import {
  clearPendingHallCreateRequest,
  discardPendingHallCreateRequest,
  hallCreateRequestPayload,
  hasPendingHallCreateRequestSlot,
  newPendingHallCreateRequest,
  normalizeHallCreateRequestId,
  persistPendingHallCreateRequest,
  readPendingHallCreateRequest,
  type HallCreateRequestPayload,
  type PendingHallCreateRequest,
} from "@/lib/partner/onboarding-create-request";

const HALL_PRICING_MODELS = ["per_person", "minimum_order", "fixed", "quote"] as const;
const HALL_DEPOSIT_TYPES = ["none", "percent", "fixed"] as const;
const HALL_SEATING_TYPES = ["banquet", "theatre", "classroom", "cocktail", "u_shape", "custom"] as const;
const HALL_WORKING_HOUR_DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const MAX_HALL_IMAGES = 20;
const MAX_HALL_IMAGE_BYTES = 10 * 1024 * 1024;

type HallPricingModel = (typeof HALL_PRICING_MODELS)[number];
type HallDepositType = (typeof HALL_DEPOSIT_TYPES)[number];
type HallSeatingType = (typeof HALL_SEATING_TYPES)[number];
type HallWorkingHourDay = (typeof HALL_WORKING_HOUR_DAYS)[number];
type HallWorkingHour = { open: string; close: string } | null;
type HallWorkingHours = Record<HallWorkingHourDay, HallWorkingHour>;

const SEATING_LABELS: Record<HallSeatingType, string> = {
  banquet: "Banchet",
  theatre: "Teatru",
  classroom: "Clasă",
  cocktail: "Cocktail",
  u_shape: "Formă U",
  custom: "Altă variantă",
};

const DAY_LABELS: Record<HallWorkingHourDay, string> = {
  mon: "Luni",
  tue: "Marți",
  wed: "Miercuri",
  thu: "Joi",
  fri: "Vineri",
  sat: "Sâmbătă",
  sun: "Duminică",
};

const CANONICAL_FACILITIES = [
  "Parcare",
  "Aer condiționat",
  "Sunet profesional",
  "Proiector",
  "Ring de dans",
  "Terasa",
  "Grădină",
  "Capelă / loc ceremonie",
  "Cameră miri",
  "Acces persoane cu dizabilități",
  "Wi-Fi gratuit",
  "Fumat permis",
] as const;

type HallSeatingForm = {
  key: string;
  type: HallSeatingType;
  labelRo: string;
  labelRu: string;
  labelEn: string;
  capacityMin: string;
  capacityMax: string;
  notesRo: string;
  notesRu: string;
  notesEn: string;
};

type VenueMenuSetOption = {
  id: number;
  nameRo: string;
  nameRu: string | null;
  nameEn: string | null;
  isDefault: boolean;
};

type HallForm = {
  nameRo: string;
  nameRu: string;
  nameEn: string;
  descriptionRo: string;
  descriptionRu: string;
  descriptionEn: string;
  capacityMin: string;
  capacityMax: string;
  pricingModel: HallPricingModel;
  basePrice: string;
  minimumOrder: string;
  currency: string;
  depositType: HallDepositType;
  depositValue: string;
  facilities: string[];
  inheritWorkingHours: boolean;
  workingHours: HallWorkingHours;
  bufferMinutes: string;
  bookingTermsRo: string;
  bookingTermsRu: string;
  bookingTermsEn: string;
  seating: HallSeatingForm[];
  imageUrls: string[];
  inheritMenu: boolean;
  menuSetIds: number[];
};

function emptyWorkingHours(): HallWorkingHours {
  return {
    mon: null,
    tue: null,
    wed: null,
    thu: null,
    fri: null,
    sat: null,
    sun: null,
  };
}

function emptyHallForm(): HallForm {
  return {
    nameRo: "",
    nameRu: "",
    nameEn: "",
    descriptionRo: "",
    descriptionRu: "",
    descriptionEn: "",
    capacityMin: "50",
    capacityMax: "200",
    pricingModel: "quote",
    basePrice: "",
    minimumOrder: "",
    currency: "EUR",
    depositType: "none",
    depositValue: "",
    facilities: [],
    inheritWorkingHours: true,
    workingHours: emptyWorkingHours(),
    bufferMinutes: "",
    bookingTermsRo: "",
    bookingTermsRu: "",
    bookingTermsEn: "",
    seating: [],
    imageUrls: [],
    inheritMenu: true,
    menuSetIds: [],
  };
}

function textValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function numberText(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "";
}

function optionalNumber(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function uniqueTextValues(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean))].slice(0, max);
}

function safeMenuSetIds(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .map(Number)
    .filter((id) => Number.isSafeInteger(id) && id > 0))].slice(0, 20);
}

function workingHoursFromUnknown(value: unknown): HallWorkingHours {
  const result = emptyWorkingHours();
  if (!value || typeof value !== "object" || Array.isArray(value)) return result;
  const source = value as Record<string, unknown>;
  for (const day of HALL_WORKING_HOUR_DAYS) {
    const interval = source[day];
    if (!interval || typeof interval !== "object" || Array.isArray(interval)) continue;
    const candidate = interval as Record<string, unknown>;
    if (typeof candidate.open === "string" && typeof candidate.close === "string") {
      result[day] = { open: candidate.open, close: candidate.close };
    }
  }
  return result;
}

function seatingFromUnknown(value: unknown): HallSeatingForm[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 12).map((entry, index) => {
    const row = entry && typeof entry === "object" && !Array.isArray(entry)
      ? entry as Record<string, unknown>
      : {};
    const type = HALL_SEATING_TYPES.includes(row.type as HallSeatingType)
      ? row.type as HallSeatingType
      : "banquet";
    return {
      key: `loaded-${index}`,
      type,
      labelRo: textValue(row.labelRo),
      labelRu: textValue(row.labelRu),
      labelEn: textValue(row.labelEn),
      capacityMin: numberText(row.capacityMin),
      capacityMax: numberText(row.capacityMax),
      notesRo: textValue(row.notesRo),
      notesRu: textValue(row.notesRu),
      notesEn: textValue(row.notesEn),
    };
  });
}

function menuSetsFromUnknown(value: unknown): VenueMenuSetOption[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const row = entry as Record<string, unknown>;
    const id = Number(row.id);
    if (!Number.isSafeInteger(id) || id <= 0 || typeof row.nameRo !== "string") return [];
    return [{
      id,
      nameRo: row.nameRo,
      nameRu: typeof row.nameRu === "string" ? row.nameRu : null,
      nameEn: typeof row.nameEn === "string" ? row.nameEn : null,
      isDefault: row.isDefault === true,
    }];
  });
}

function hallFormFromCreatePayload(payload: HallCreateRequestPayload): HallForm {
  const pricingModel = HALL_PRICING_MODELS.includes(payload.pricingModel as HallPricingModel)
    ? payload.pricingModel as HallPricingModel
    : "quote";
  const depositType = HALL_DEPOSIT_TYPES.includes(payload.depositType as HallDepositType)
    ? payload.depositType as HallDepositType
    : "none";
  const hasCustomWorkingHours = payload.workingHours != null
    && typeof payload.workingHours === "object"
    && !Array.isArray(payload.workingHours);
  return {
    ...emptyHallForm(),
    nameRo: textValue(payload.nameRo),
    nameRu: textValue(payload.nameRu),
    nameEn: textValue(payload.nameEn),
    descriptionRo: textValue(payload.descriptionRo),
    descriptionRu: textValue(payload.descriptionRu),
    descriptionEn: textValue(payload.descriptionEn),
    capacityMin: numberText(payload.capacityMin),
    capacityMax: numberText(payload.capacityMax),
    pricingModel,
    basePrice: numberText(payload.basePrice),
    minimumOrder: numberText(payload.minimumOrder),
    currency: textValue(payload.currency, "EUR"),
    depositType,
    depositValue: numberText(payload.depositValue),
    facilities: uniqueTextValues(payload.facilities, 40),
    inheritWorkingHours: !hasCustomWorkingHours,
    workingHours: workingHoursFromUnknown(payload.workingHours),
    bufferMinutes: numberText(payload.bufferMinutes),
    bookingTermsRo: textValue(payload.bookingTermsRo),
    bookingTermsRu: textValue(payload.bookingTermsRu),
    bookingTermsEn: textValue(payload.bookingTermsEn),
    seating: seatingFromUnknown(payload.seating),
    imageUrls: uniqueTextValues(payload.imageUrls, MAX_HALL_IMAGES),
    inheritMenu: payload.inheritMenu !== false,
    menuSetIds: safeMenuSetIds(payload.menuSetIds),
  };
}

function hallFormFromApi(data: Record<string, unknown>): HallForm {
  const hall = data.hall && typeof data.hall === "object" && !Array.isArray(data.hall)
    ? data.hall as Record<string, unknown>
    : {};
  const pricingModel = HALL_PRICING_MODELS.includes(hall.pricingModel as HallPricingModel)
    ? hall.pricingModel as HallPricingModel
    : "quote";
  const depositType = HALL_DEPOSIT_TYPES.includes(hall.depositType as HallDepositType)
    ? hall.depositType as HallDepositType
    : "none";
  const hasCustomWorkingHours = hall.workingHours != null
    && typeof hall.workingHours === "object"
    && !Array.isArray(hall.workingHours);
  const images = Array.isArray(data.images)
    ? data.images.flatMap((entry) => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
        const url = (entry as Record<string, unknown>).url;
        return typeof url === "string" ? [url] : [];
      })
    : [];
  return {
    ...emptyHallForm(),
    nameRo: textValue(hall.nameRo),
    nameRu: textValue(hall.nameRu),
    nameEn: textValue(hall.nameEn),
    descriptionRo: textValue(hall.descriptionRo),
    descriptionRu: textValue(hall.descriptionRu),
    descriptionEn: textValue(hall.descriptionEn),
    capacityMin: numberText(hall.capacityMin),
    capacityMax: numberText(hall.capacityMax),
    pricingModel,
    basePrice: numberText(hall.basePrice),
    minimumOrder: numberText(hall.minimumOrder),
    currency: textValue(hall.currency, "EUR"),
    depositType,
    depositValue: numberText(hall.depositValue),
    facilities: uniqueTextValues(hall.facilities, 40),
    inheritWorkingHours: !hasCustomWorkingHours,
    workingHours: workingHoursFromUnknown(hall.workingHours),
    bufferMinutes: numberText(hall.bufferMinutes),
    bookingTermsRo: textValue(hall.bookingTermsRo),
    bookingTermsRu: textValue(hall.bookingTermsRu),
    bookingTermsEn: textValue(hall.bookingTermsEn),
    seating: seatingFromUnknown(data.seating),
    imageUrls: uniqueTextValues(images, MAX_HALL_IMAGES),
    inheritMenu: data.inheritMenu !== false,
    menuSetIds: safeMenuSetIds(data.menuSetIds),
  };
}

function seatingPayload(rows: HallSeatingForm[]) {
  return rows.map((row) => ({
    type: row.type,
    labelRo: row.labelRo.trim() || null,
    labelRu: row.labelRu.trim() || null,
    labelEn: row.labelEn.trim() || null,
    capacityMin: optionalNumber(row.capacityMin),
    capacityMax: optionalNumber(row.capacityMax),
    notesRo: row.notesRo.trim() || null,
    notesRu: row.notesRu.trim() || null,
    notesEn: row.notesEn.trim() || null,
  }));
}

function hallCreatePayloadFromForm(form: HallForm): Record<string, unknown> {
  return {
    nameRo: form.nameRo,
    nameRu: form.nameRu.trim() || null,
    nameEn: form.nameEn.trim() || null,
    descriptionRo: form.descriptionRo.trim() || null,
    descriptionRu: form.descriptionRu.trim() || null,
    descriptionEn: form.descriptionEn.trim() || null,
    capacityMin: optionalNumber(form.capacityMin),
    capacityMax: optionalNumber(form.capacityMax),
    pricingModel: form.pricingModel,
    basePrice: optionalNumber(form.basePrice),
    minimumOrder: optionalNumber(form.minimumOrder),
    currency: form.currency.trim().toUpperCase(),
    depositType: form.depositType,
    depositValue: form.depositType === "none" ? null : optionalNumber(form.depositValue),
    facilities: [...form.facilities],
    workingHours: form.inheritWorkingHours ? null : form.workingHours,
    bufferMinutes: optionalNumber(form.bufferMinutes),
    bookingTermsRo: form.bookingTermsRo.trim() || null,
    bookingTermsRu: form.bookingTermsRu.trim() || null,
    bookingTermsEn: form.bookingTermsEn.trim() || null,
    seating: seatingPayload(form.seating),
    imageUrls: [...form.imageUrls],
    inheritMenu: form.inheritMenu,
    menuSetIds: form.inheritMenu ? [] : [...form.menuSetIds],
  };
}

function newSeatingRow(index: number): HallSeatingForm {
  return {
    key: `new-${index}-${Date.now()}`,
    type: "banquet",
    labelRo: "",
    labelRu: "",
    labelEn: "",
    capacityMin: "",
    capacityMax: "",
    notesRo: "",
    notesRu: "",
    notesEn: "",
  };
}

export function HallEditor({ venueId, hallId }: { venueId: number; hallId?: number }) {
  const { locale } = useLocale();
  const router = useRouter();
  const search = useSearchParams();
  const { isLoaded: userLoaded, user } = useUser();
  const [form, setForm] = useState<HallForm>(() => emptyHallForm());
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [loaded, setLoaded] = useState(hallId == null);
  const [hallStatus, setHallStatus] = useState<string | null>(null);
  const [reviewReason, setReviewReason] = useState<string | null>(null);
  const [seatingDirty, setSeatingDirty] = useState(false);
  const [imagesDirty, setImagesDirty] = useState(false);
  const [menuDirty, setMenuDirty] = useState(false);
  const [availableMenuSets, setAvailableMenuSets] = useState<VenueMenuSetOption[]>([]);
  const [menuSetsLoading, setMenuSetsLoading] = useState(hallId == null);
  const [menuSetsLoadFailed, setMenuSetsLoadFailed] = useState(false);
  const [menuSetsLoadAttempt, setMenuSetsLoadAttempt] = useState(0);
  const [customFacility, setCustomFacility] = useState("");
  const [editLoadFailed, setEditLoadFailed] = useState(false);
  const [editLoadAttempt, setEditLoadAttempt] = useState(0);
  const presetCreateRequestId = normalizeHallCreateRequestId(search.get("hallCreateRequestId"));
  const [hallCreateRequestId, setHallCreateRequestId] = useState<string | null>(hallId == null ? presetCreateRequestId : null);
  const [checkingReplay, setCheckingReplay] = useState(hallId == null && presetCreateRequestId != null);
  const [hasPendingCreate, setHasPendingCreate] = useState(false);
  const [recoveryOnly, setRecoveryOnly] = useState(hallId == null && presetCreateRequestId != null);
  const [recoveryAttempt, setRecoveryAttempt] = useState(0);
  const [resolvedIdentity, setResolvedIdentity] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const actorRef = useRef<string | null>(null);
  const activeIdentityRef = useRef<string | null>(null);
  const editorIdentityRef = useRef<string | null>(null);
  const pendingCreateRef = useRef<PendingHallCreateRequest | null>(null);
  const recoveryEpochRef = useRef(0);
  const saveInFlightRef = useRef<object | null>(null);
  const uploadInFlightRef = useRef<object | null>(null);
  const currentIdentity = userLoaded && user?.id ? `${user.id}:${venueId}:${hallId ?? "new"}` : null;
  const actorReady = Boolean(currentIdentity && resolvedIdentity === currentIdentity);

  useLayoutEffect(() => {
    actorRef.current = userLoaded ? user?.id ?? null : null;
    activeIdentityRef.current = currentIdentity;
    recoveryEpochRef.current += 1;
  }, [currentIdentity, presetCreateRequestId, user?.id, userLoaded]);

  useEffect(() => {
    if (!userLoaded) return;
    const actorId = user?.id ?? null;
    const identity = actorId ? `${actorId}:${venueId}:${hallId ?? "new"}` : null;
    if (editorIdentityRef.current === identity) return;
    editorIdentityRef.current = identity;
    actorRef.current = actorId;
    pendingCreateRef.current = null;
    saveInFlightRef.current = null;
    uploadInFlightRef.current = null;
    setResolvedIdentity(identity);
    setBusy(false);
    setUploading(false);
    setForm(emptyHallForm());
    setLoaded(hallId == null);
    setHallStatus(null);
    setReviewReason(null);
    setSeatingDirty(false);
    setImagesDirty(false);
    setMenuDirty(false);
    setAvailableMenuSets([]);
    setMenuSetsLoading(hallId == null);
    setMenuSetsLoadFailed(false);
    setCustomFacility("");
    setEditLoadFailed(false);
    setHallCreateRequestId(hallId == null ? presetCreateRequestId : null);
    setCheckingReplay(hallId == null && presetCreateRequestId != null);
    setHasPendingCreate(false);
    setRecoveryOnly(hallId == null && presetCreateRequestId != null);
    setFieldError(null);
  }, [hallId, presetCreateRequestId, user?.id, userLoaded, venueId]);

  useEffect(() => {
    if (!actorReady || !user?.id || hallId != null) return;
    const actorId = user.id;
    const identity = currentIdentity;
    if (!identity) return;
    let cancelled = false;
    setMenuSetsLoading(true);
    setMenuSetsLoadFailed(false);
    void fetch(`/api/venues/${venueId}/halls`)
      .then(async (response) => {
        if (!response.ok) throw new Error(`Menu-set load failed (${response.status})`);
        return response.json();
      })
      .then((data) => {
        if (cancelled || actorRef.current !== actorId || activeIdentityRef.current !== identity) return;
        setAvailableMenuSets(menuSetsFromUnknown(data?.menuSets));
      })
      .catch(() => {
        if (!cancelled && actorRef.current === actorId && activeIdentityRef.current === identity) setMenuSetsLoadFailed(true);
      })
      .finally(() => {
        if (!cancelled && actorRef.current === actorId && activeIdentityRef.current === identity) setMenuSetsLoading(false);
      });
    return () => { cancelled = true; };
  }, [actorReady, currentIdentity, hallId, menuSetsLoadAttempt, user?.id, venueId]);

  useEffect(() => {
    if (!actorReady || !user?.id || hallId != null) {
      setCheckingReplay(false);
      return;
    }
    const actorId = user.id;
    const identity = currentIdentity;
    if (!identity) return;
    const recoveryEpoch = ++recoveryEpochRef.current;
    const pending = readPendingHallCreateRequest(window.sessionStorage, actorId, venueId);
    const slotOccupied = hasPendingHallCreateRequestSlot(window.sessionStorage, actorId, venueId);
    const effectiveRequestId = pending?.requestId ?? presetCreateRequestId;
    pendingCreateRef.current = pending;
    setHasPendingCreate(Boolean(pending));
    setRecoveryOnly(!pending && (slotOccupied || effectiveRequestId != null));
    setHallCreateRequestId(effectiveRequestId);
    if (pending) {
      setForm(hallFormFromCreatePayload(pending.payload));
      if (pending.requestId !== presetCreateRequestId) {
        const params = new URLSearchParams(search.toString());
        params.set("hallCreateRequestId", pending.requestId);
        window.history.replaceState(window.history.state, "", `${localizePath(`/dashboard/locatii/${venueId}/sali/nou`, locale)}?${params.toString()}`);
      }
    }
    if (!effectiveRequestId) {
      setCheckingReplay(false);
      return;
    }
    let cancelled = false;
    setCheckingReplay(true);
    void fetch(`/api/venues/${venueId}/halls`)
      .then(async (response) => {
        if (!response.ok) throw new Error(`Hall recovery failed (${response.status})`);
        return response.json();
      })
      .then((data) => {
        if (cancelled || actorRef.current !== actorId || activeIdentityRef.current !== identity || recoveryEpochRef.current !== recoveryEpoch || !Array.isArray(data?.halls)) return;
        const recovered = data.halls.find((candidate: Record<string, unknown>) => typeof candidate.creationRequestId === "string" && candidate.creationRequestId.toLowerCase() === effectiveRequestId);
        const recoveredId = Number(recovered?.id);
        if (!Number.isSafeInteger(recoveredId) || recoveredId <= 0) return;
        if (slotOccupied && (!pending || !clearPendingHallCreateRequest(window.sessionStorage, actorId, venueId, effectiveRequestId))) {
          toast.error("Sala există, dar cererea salvată nu a putut fi curățată. Reîncearcă înainte de a continua.");
          return;
        }
        pendingCreateRef.current = null;
        setHasPendingCreate(false);
        setRecoveryOnly(false);
        setHallCreateRequestId(null);
        setLoaded(false);
        router.replace(localizePath(`/dashboard/locatii/${venueId}/sali/${recoveredId}`, locale));
      })
      .catch(() => {
        // Stored payloads can be replayed exactly; URL-only identities remain
        // recovery-only until the user explicitly discards them.
      })
      .finally(() => {
        if (!cancelled && actorRef.current === actorId && activeIdentityRef.current === identity && recoveryEpochRef.current === recoveryEpoch) setCheckingReplay(false);
      });
    return () => { cancelled = true; };
  }, [actorReady, currentIdentity, hallId, locale, presetCreateRequestId, recoveryAttempt, router, search, user?.id, venueId]);

  useEffect(() => {
    if (!actorReady || !user?.id || !hallId) return;
    const actorId = user.id;
    const identity = currentIdentity;
    if (!identity) return;
    let cancelled = false;
    setLoaded(false);
    setEditLoadFailed(false);
    void fetch(`/api/venues/${venueId}/halls/${hallId}`)
      .then(async (response) => {
        if (!response.ok) throw new Error(`Hall load failed (${response.status})`);
        const data = await response.json();
        if (!data?.hall) throw new Error("Hall load response is malformed");
        return data as Record<string, unknown>;
      })
      .then((data) => {
        if (cancelled || actorRef.current !== actorId || activeIdentityRef.current !== identity) return;
        const hall = data.hall as Record<string, unknown>;
        setHallStatus(typeof hall.status === "string" ? hall.status : null);
        setReviewReason(typeof hall.reviewReason === "string" ? hall.reviewReason : null);
        setForm(hallFormFromApi(data));
        setAvailableMenuSets(menuSetsFromUnknown(data.menuSets));
        setMenuSetsLoading(false);
        setMenuSetsLoadFailed(false);
        setSeatingDirty(false);
        setImagesDirty(false);
        setMenuDirty(false);
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled && actorRef.current === actorId && activeIdentityRef.current === identity) {
          setEditLoadFailed(true);
          toast.error("Sala nu a putut fi încărcată");
        }
      });
    return () => { cancelled = true; };
  }, [actorReady, currentIdentity, editLoadAttempt, hallId, user?.id, venueId]);

  function set<K extends keyof HallForm>(key: K, value: HallForm[K]) {
    setForm((previous) => ({ ...previous, [key]: value }));
    setFieldError(null);
  }

  function toggleFacility(name: string) {
    setForm((previous) => ({
      ...previous,
      facilities: previous.facilities.includes(name)
        ? previous.facilities.filter((facility) => facility !== name)
        : previous.facilities.length < 40 ? [...previous.facilities, name] : previous.facilities,
    }));
    setFieldError(null);
  }

  function addCustomFacility() {
    const value = customFacility.trim();
    if (!value) return;
    if (value.length > 80) {
      toast.error("Facilitatea poate avea cel mult 80 de caractere.");
      return;
    }
    if (form.facilities.length >= 40 && !form.facilities.includes(value)) {
      toast.error("Poți adăuga cel mult 40 de facilități.");
      return;
    }
    if (!form.facilities.includes(value)) set("facilities", [...form.facilities, value]);
    setCustomFacility("");
  }

  function updateSeating(index: number, patch: Partial<HallSeatingForm>) {
    setForm((previous) => ({
      ...previous,
      seating: previous.seating.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row),
    }));
    setSeatingDirty(true);
    setFieldError(null);
  }

  function addSeating() {
    if (form.seating.length >= 12) {
      toast.error("Poți adăuga cel mult 12 variante de aranjare.");
      return;
    }
    set("seating", [...form.seating, newSeatingRow(form.seating.length)]);
    setSeatingDirty(true);
  }

  function removeSeating(index: number) {
    set("seating", form.seating.filter((_, rowIndex) => rowIndex !== index));
    setSeatingDirty(true);
  }

  function toggleWorkingDay(day: HallWorkingHourDay) {
    set("workingHours", {
      ...form.workingHours,
      [day]: form.workingHours[day] == null ? { open: "10:00", close: "22:00" } : null,
    });
  }

  function updateWorkingDay(day: HallWorkingHourDay, field: "open" | "close", value: string) {
    const interval = form.workingHours[day];
    if (!interval) return;
    set("workingHours", { ...form.workingHours, [day]: { ...interval, [field]: value } });
  }

  function toggleMenuSet(menuSetId: number) {
    setForm((previous) => ({
      ...previous,
      menuSetIds: previous.menuSetIds.includes(menuSetId)
        ? previous.menuSetIds.filter((id) => id !== menuSetId)
        : [...previous.menuSetIds, menuSetId],
    }));
    setMenuDirty(true);
    setFieldError(null);
  }

  async function uploadHallImages(files: FileList | null) {
    const actorId = user?.id;
    const identity = currentIdentity;
    const uploadToken = {};
    if (!files?.length || !actorReady || !actorId || !identity || busy || saveInFlightRef.current || uploadInFlightRef.current) return;
    const createLocked = hallId == null && (hasPendingCreate || recoveryOnly);
    const readOnly = hallId != null
      && hallStatus != null
      && !["draft", "rejected", "active"].includes(hallStatus);
    if (createLocked || readOnly) return;
    const slots = MAX_HALL_IMAGES - form.imageUrls.length;
    if (slots <= 0) {
      toast.error(`Poți adăuga cel mult ${MAX_HALL_IMAGES} de imagini.`);
      return;
    }
    const selected = Array.from(files);
    let failed = 0;
    let uploaded = 0;
    let nextUrls = [...form.imageUrls];
    uploadInFlightRef.current = uploadToken;
    setUploading(true);
    try {
      for (const file of selected) {
        if (nextUrls.length >= MAX_HALL_IMAGES) {
          failed += 1;
          continue;
        }
        if (!file.type.startsWith("image/")) {
          failed += 1;
          toast.error(`${file.name}: selectează un fișier imagine.`);
          continue;
        }
        if (file.size > MAX_HALL_IMAGE_BYTES) {
          failed += 1;
          toast.error(`${file.name}: imaginea depășește 10 MB.`);
          continue;
        }
        try {
          const formData = new FormData();
          formData.append("file", file);
          formData.append("folder", "venues");
          const response = await fetch("/api/upload", { method: "POST", body: formData });
          const data = await response.json().catch(() => ({}));
          if (!response.ok || typeof data?.url !== "string") throw new Error(typeof data?.error === "string" ? data.error : "Upload failed");
          if (actorRef.current !== actorId || activeIdentityRef.current !== identity || uploadInFlightRef.current !== uploadToken) return;
          if (!nextUrls.includes(data.url) && nextUrls.length < MAX_HALL_IMAGES) {
            nextUrls = [...nextUrls, data.url];
            uploaded += 1;
            setForm((previous) => ({ ...previous, imageUrls: [...nextUrls] }));
            setImagesDirty(true);
          }
        } catch (error) {
          failed += 1;
          toast.error(`${file.name}: ${error instanceof Error ? error.message : "încărcarea a eșuat"}`);
        }
      }
    } finally {
      if (uploadInFlightRef.current === uploadToken) uploadInFlightRef.current = null;
      if (actorRef.current === actorId && activeIdentityRef.current === identity) {
        setUploading(false);
        if (uploaded > 0) toast.success(`${uploaded} ${uploaded === 1 ? "imagine încărcată" : "imagini încărcate"}.`);
        if (failed > 0) toast.error(`${failed} ${failed === 1 ? "fișier nu a fost încărcat" : "fișiere nu au fost încărcate"}; imaginile reușite au fost păstrate.`);
      }
    }
  }

  function removeImage(index: number) {
    set("imageUrls", form.imageUrls.filter((_, imageIndex) => imageIndex !== index));
    setImagesDirty(true);
  }

  function discardPendingCreate() {
    const actorId = user?.id;
    if (!actorReady || !actorId || hallId != null || busy || uploading) return;
    if (!window.confirm("Renunță numai dacă ești sigur că sala nu a fost creată. O cerere nouă poate crea o sală duplicată.")) return;
    recoveryEpochRef.current += 1;
    if (!discardPendingHallCreateRequest(window.sessionStorage, actorId, venueId)) {
      toast.error("Cererea salvată nu a putut fi eliminată din browser.");
      return;
    }
    pendingCreateRef.current = null;
    setHasPendingCreate(false);
    setRecoveryOnly(false);
    setHallCreateRequestId(null);
    setFieldError(null);
    const params = new URLSearchParams(search.toString());
    params.delete("hallCreateRequestId");
    const query = params.toString();
    const path = localizePath(`/dashboard/locatii/${venueId}/sali/nou`, locale);
    window.history.replaceState(window.history.state, "", query ? `${path}?${query}` : path);
  }

  async function save(submit = false) {
    const actorId = user?.id;
    const identity = currentIdentity;
    if (!actorReady || !actorId || !identity) {
      toast.error("Sesiunea utilizatorului nu este încă disponibilă.");
      return;
    }
    if (saveInFlightRef.current) return;
    if (uploading || uploadInFlightRef.current) {
      toast.error("Așteaptă finalizarea încărcării imaginilor.");
      return;
    }
    if ((hallId != null && !loaded) || checkingReplay) {
      toast.error("Datele sălii încă se încarcă");
      return;
    }
    if (
      hallId != null
      && hallStatus != null
      && !["draft", "rejected", "active"].includes(hallStatus)
    ) {
      toast.error("Sala nu poate fi modificată în starea curentă.");
      return;
    }
    if (hallId == null && recoveryOnly) {
      toast.error("Payload-ul original lipsește. Verifică din nou sau renunță explicit la cerere.");
      return;
    }

    let createRequest: PendingHallCreateRequest | null = null;
    let payload: Record<string, unknown>;
    if (hallId == null) {
      createRequest = pendingCreateRef.current ?? readPendingHallCreateRequest(window.sessionStorage, actorId, venueId);
      const slotOccupied = hasPendingHallCreateRequestSlot(window.sessionStorage, actorId, venueId);
      if (!createRequest && (slotOccupied || hallCreateRequestId != null)) {
        setRecoveryOnly(true);
        toast.error("Payload-ul original lipsește. Verifică din nou sau renunță explicit la cerere.");
        return;
      }
      if (!createRequest) createRequest = newPendingHallCreateRequest(actorId, venueId, crypto.randomUUID(), hallCreatePayloadFromForm(form));
      if (!createRequest || !persistPendingHallCreateRequest(window.sessionStorage, createRequest)) {
        toast.error("Browserul nu poate salva exact cererea. Activează stocarea și reîncearcă.");
        return;
      }
      pendingCreateRef.current = createRequest;
      setHasPendingCreate(true);
      setRecoveryOnly(false);
      setHallCreateRequestId(createRequest.requestId);
      const params = new URLSearchParams(search.toString());
      params.set("hallCreateRequestId", createRequest.requestId);
      // The exact payload is durable before its identity enters history, and
      // history is durable before POST can leave this page.
      window.history.replaceState(window.history.state, "", `${localizePath(`/dashboard/locatii/${venueId}/sali/nou`, locale)}?${params.toString()}`);
      payload = hallCreateRequestPayload(createRequest);
    } else {
      const createPayload = hallCreatePayloadFromForm(form);
      const { seating, imageUrls, inheritMenu, menuSetIds, ...scalarPayload } = createPayload;
      payload = scalarPayload;
      // Child collections are omitted until their respective controls become
      // dirty, preserving every row loaded from the server on scalar edits.
      if (seatingDirty) payload.seating = seating;
      if (imagesDirty) payload.imageUrls = imageUrls;
      if (menuDirty) {
        payload.inheritMenu = inheritMenu;
        payload.menuSetIds = menuSetIds;
      }
    }

    const saveToken = {};
    saveInFlightRef.current = saveToken;
    setBusy(true);
    try {
      const response = await fetch(hallId ? `/api/venues/${venueId}/halls/${hallId}` : `/api/venues/${venueId}/halls`, {
        method: hallId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (actorRef.current !== actorId || activeIdentityRef.current !== identity) return;
      if (!response.ok) {
        setFieldError(data.details?.[0]?.path?.join(".") || data.field || "form");
        toast.error(data.error || "Validare eșuată — cererea rămâne înghețată pentru reluare");
        return;
      }
      const id = hallId ?? Number(data?.hall?.id);
      if (!Number.isSafeInteger(id) || id <= 0) throw new Error("Hall create response is missing its id");
      if (createRequest) {
        if (!clearPendingHallCreateRequest(window.sessionStorage, actorId, venueId, createRequest.requestId)) {
          toast.error("Draftul a fost salvat, dar cererea din browser nu a putut fi curățată. Reîncearcă aceeași cerere.");
          return;
        }
        pendingCreateRef.current = null;
        setHasPendingCreate(false);
        setRecoveryOnly(false);
        setHallCreateRequestId(null);
        setLoaded(false);
      } else {
        setSeatingDirty(false);
        setImagesDirty(false);
        setMenuDirty(false);
      }
      if (typeof data?.hall?.status === "string") setHallStatus(data.hall.status);
      toast.success("Draft salvat");
      const editPath = localizePath(`/dashboard/locatii/${venueId}/sali/${id}`, locale);
      if (submit) {
        try {
          const send = await fetch(`/api/venues/${venueId}/submit-approval`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ hallIds: [id] }),
          });
          const sendData = await send.json().catch(() => ({}));
          if (actorRef.current !== actorId || activeIdentityRef.current !== identity) return;
          if (!send.ok) {
            const first = sendData.missing?.[0];
            setFieldError(first?.path || "submit");
            const message = first?.message === "hall_images_required" ? "Adaugă cel puțin o fotografie proprie a sălii."
              : first?.message === "capacity_required" ? "Completează capacitatea minimă și maximă a sălii."
              : first?.message === "hall_name_required" ? "Completează numele sălii."
              : first?.message || "Draftul a fost salvat, dar lipsesc câmpuri pentru aprobare";
            toast.error(message);
            router.replace(editPath);
            return;
          }
        } catch {
          if (actorRef.current === actorId && activeIdentityRef.current === identity) {
            toast.error("Draftul a fost salvat, dar trimiterea la aprobare a eșuat.");
            router.replace(editPath);
          }
          return;
        }
      }
      router.replace(editPath);
    } catch {
      if (actorRef.current === actorId && activeIdentityRef.current === identity) toast.error("Conexiunea s-a întrerupt. Reîncearcă: aceeași cerere va fi reluată sigur.");
    } finally {
      if (saveInFlightRef.current === saveToken) saveInFlightRef.current = null;
      if (actorRef.current === actorId && activeIdentityRef.current === identity) setBusy(false);
    }
  }

  if (!actorReady) {
    return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-gold" /></div>;
  }

  const createFormLocked = hallId == null && (hasPendingCreate || recoveryOnly);
  const hallReadOnly = hallId != null
    && hallStatus != null
    && !["draft", "rejected", "active"].includes(hallStatus);
  const editorDisabled = busy || uploading || !loaded || createFormLocked || hallReadOnly;

  return (
    <Card>
      <CardContent className="space-y-6 p-5">
        <h1 className="font-heading text-2xl font-bold">{hallId ? "Editează sala" : "Adaugă sală"}</h1>
        {hallStatus === "rejected" && reviewReason ? (
          <p className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-300">
            Motivul refuzului: {reviewReason}
          </p>
        ) : null}
        {fieldError && <p className="text-sm text-red-400">Câmp: {fieldError}</p>}
        {hallId != null && editLoadFailed && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-red-500/40 bg-red-500/5 p-4 text-sm">
            <p>Sala nu a putut fi încărcată. Editarea rămâne blocată pentru a proteja datele existente.</p>
            <Button type="button" variant="outline" size="sm" onClick={() => setEditLoadAttempt((attempt) => attempt + 1)}>Reîncearcă</Button>
          </div>
        )}
        {hallId == null && (hasPendingCreate || recoveryOnly) && (
          <div className="space-y-3 rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 text-sm">
            <p>{hasPendingCreate ? "Cererea este înghețată. Reîncearcă pentru a trimite exact aceleași date." : "Cererea poate fi deja în curs, dar payload-ul original lipsește. Verifică din nou sau renunță explicit."}</p>
            <div className="flex flex-wrap gap-2">
              {recoveryOnly && (
                <Button type="button" variant="outline" size="sm" disabled={busy || checkingReplay} onClick={() => { recoveryEpochRef.current += 1; setRecoveryAttempt((attempt) => attempt + 1); }}>
                  {checkingReplay ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verifică din nou"}
                </Button>
              )}
              <Button type="button" variant="outline" size="sm" disabled={busy} onClick={discardPendingCreate}>Renunță și corectează</Button>
            </div>
          </div>
        )}
        {hallStatus === "active" && (
          <p className="rounded-lg border border-gold/30 bg-gold/5 p-3 text-sm text-muted-foreground">
            Sala este activă. O modificare a datelor publice o va muta în draft pentru o nouă aprobare.
          </p>
        )}
        {hallReadOnly && (
          <p className="rounded-lg border border-border/50 bg-muted/30 p-3 text-sm text-muted-foreground">
            Sala nu poate fi modificată cât timp are starea „{hallStatus}”.
          </p>
        )}

        <fieldset disabled={editorDisabled} className="space-y-6 disabled:opacity-70">
          <section className="space-y-4 rounded-xl border border-border/50 p-4">
            <h2 className="font-heading text-lg font-semibold">Denumire și descriere</h2>
            <div className="grid gap-3 md:grid-cols-3">
              <div><Label>Nume RO</Label><Input value={form.nameRo} onChange={(event) => set("nameRo", event.target.value)} /></div>
              <div><Label>Nume RU</Label><Input value={form.nameRu} onChange={(event) => set("nameRu", event.target.value)} /></div>
              <div><Label>Nume EN</Label><Input value={form.nameEn} onChange={(event) => set("nameEn", event.target.value)} /></div>
            </div>
            <TranslateMissingFields
              venueId={venueId}
              hallId={hallId}
              fields={{
                name: { ro: form.nameRo, ru: form.nameRu, en: form.nameEn },
                description: { ro: form.descriptionRo, ru: form.descriptionRu, en: form.descriptionEn },
                bookingTerms: { ro: form.bookingTermsRo, ru: form.bookingTermsRu, en: form.bookingTermsEn },
              }}
              onTranslated={(next) => {
                if (!currentIdentity || activeIdentityRef.current !== currentIdentity || pendingCreateRef.current != null || saveInFlightRef.current != null || (hallId == null && recoveryOnly) || hallReadOnly) return;
                setForm((previous) => ({
                  ...previous,
                  nameRu: next.name?.ru ?? previous.nameRu,
                  nameEn: next.name?.en ?? previous.nameEn,
                  descriptionRu: next.description?.ru ?? previous.descriptionRu,
                  descriptionEn: next.description?.en ?? previous.descriptionEn,
                  bookingTermsRu: next.bookingTerms?.ru ?? previous.bookingTermsRu,
                  bookingTermsEn: next.bookingTerms?.en ?? previous.bookingTermsEn,
                }));
              }}
            />
            <div className="grid gap-3 lg:grid-cols-3">
              <div><Label>Descriere RO</Label><Textarea value={form.descriptionRo} onChange={(event) => set("descriptionRo", event.target.value)} /></div>
              <div><Label>Descriere RU</Label><Textarea value={form.descriptionRu} onChange={(event) => set("descriptionRu", event.target.value)} /></div>
              <div><Label>Descriere EN</Label><Textarea value={form.descriptionEn} onChange={(event) => set("descriptionEn", event.target.value)} /></div>
            </div>
          </section>

          <section className="space-y-4 rounded-xl border border-border/50 p-4">
            <h2 className="font-heading text-lg font-semibold">Capacitate și aranjarea sălii</h2>
            <div className="grid gap-3 md:grid-cols-2">
              <div><Label>Capacitate minimă</Label><Input type="number" min="1" value={form.capacityMin} onChange={(event) => set("capacityMin", event.target.value)} /></div>
              <div><Label>Capacitate maximă</Label><Input type="number" min="1" value={form.capacityMax} onChange={(event) => set("capacityMax", event.target.value)} /></div>
            </div>
            <div className="space-y-3">
              {form.seating.map((row, index) => (
                <div key={row.key} className="space-y-3 rounded-lg border border-border/40 bg-muted/10 p-3">
                  <div className="flex items-center justify-between gap-3"><strong className="text-sm">Varianta {index + 1}</strong><Button type="button" variant="ghost" size="sm" onClick={() => removeSeating(index)} aria-label={`Șterge varianta ${index + 1}`}><Trash2 className="h-4 w-4" /></Button></div>
                  <div className="grid gap-3 md:grid-cols-3">
                    <div><Label>Tip aranjare</Label><select className="h-9 w-full rounded-md border border-border/50 bg-background px-3 text-sm" value={row.type} onChange={(event) => updateSeating(index, { type: event.target.value as HallSeatingType })}>{HALL_SEATING_TYPES.map((type) => <option key={type} value={type}>{SEATING_LABELS[type]}</option>)}</select></div>
                    <div><Label>Capacitate minimă</Label><Input type="number" min="0" value={row.capacityMin} onChange={(event) => updateSeating(index, { capacityMin: event.target.value })} /></div>
                    <div><Label>Capacitate maximă</Label><Input type="number" min="0" value={row.capacityMax} onChange={(event) => updateSeating(index, { capacityMax: event.target.value })} /></div>
                  </div>
                  <div className="grid gap-3 md:grid-cols-3">
                    <div><Label>Etichetă RO</Label><Input value={row.labelRo} onChange={(event) => updateSeating(index, { labelRo: event.target.value })} /></div>
                    <div><Label>Etichetă RU</Label><Input value={row.labelRu} onChange={(event) => updateSeating(index, { labelRu: event.target.value })} /></div>
                    <div><Label>Etichetă EN</Label><Input value={row.labelEn} onChange={(event) => updateSeating(index, { labelEn: event.target.value })} /></div>
                  </div>
                  <div className="grid gap-3 md:grid-cols-3">
                    <div><Label>Note RO</Label><Textarea value={row.notesRo} onChange={(event) => updateSeating(index, { notesRo: event.target.value })} /></div>
                    <div><Label>Note RU</Label><Textarea value={row.notesRu} onChange={(event) => updateSeating(index, { notesRu: event.target.value })} /></div>
                    <div><Label>Note EN</Label><Textarea value={row.notesEn} onChange={(event) => updateSeating(index, { notesEn: event.target.value })} /></div>
                  </div>
                </div>
              ))}
              <Button type="button" variant="outline" onClick={addSeating} disabled={form.seating.length >= 12}><Plus className="mr-2 h-4 w-4" /> Adaugă variantă de aranjare</Button>
            </div>
          </section>

          <section className="space-y-4 rounded-xl border border-border/50 p-4">
            <h2 className="font-heading text-lg font-semibold">Preț și avans</h2>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              <div><Label>Model de preț</Label><select className="h-9 w-full rounded-md border border-border/50 bg-background px-3 text-sm" value={form.pricingModel} onChange={(event) => set("pricingModel", event.target.value as HallPricingModel)}><option value="per_person">Per persoană</option><option value="minimum_order">Comandă minimă</option><option value="fixed">Preț fix</option><option value="quote">La cerere</option></select></div>
              <div><Label>Preț de bază</Label><Input type="number" min="0" step="0.01" value={form.basePrice} onChange={(event) => set("basePrice", event.target.value)} /></div>
              <div><Label>Comandă minimă</Label><Input type="number" min="0" step="0.01" value={form.minimumOrder} onChange={(event) => set("minimumOrder", event.target.value)} /></div>
              <div><Label>Monedă</Label><Input maxLength={3} value={form.currency} onChange={(event) => set("currency", event.target.value.toUpperCase())} placeholder="EUR" /></div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div><Label>Tip avans</Label><select className="h-9 w-full rounded-md border border-border/50 bg-background px-3 text-sm" value={form.depositType} onChange={(event) => { const depositType = event.target.value as HallDepositType; setForm((previous) => ({ ...previous, depositType, depositValue: depositType === "none" ? "" : previous.depositValue })); setFieldError(null); }}><option value="none">Fără avans</option><option value="percent">Procent</option><option value="fixed">Sumă fixă</option></select></div>
              <div><Label>{form.depositType === "percent" ? "Avans (%)" : "Valoarea avansului"}</Label><Input type="number" min="0" max={form.depositType === "percent" ? 100 : undefined} step="0.01" disabled={form.depositType === "none"} value={form.depositValue} onChange={(event) => set("depositValue", event.target.value)} /></div>
            </div>
          </section>

          <section className="space-y-4 rounded-xl border border-border/50 p-4">
            <h2 className="font-heading text-lg font-semibold">Condiții de rezervare</h2>
            <div className="grid gap-3 lg:grid-cols-3">
              <div><Label>Condiții RO</Label><Textarea value={form.bookingTermsRo} onChange={(event) => set("bookingTermsRo", event.target.value)} /></div>
              <div><Label>Condiții RU</Label><Textarea value={form.bookingTermsRu} onChange={(event) => set("bookingTermsRu", event.target.value)} /></div>
              <div><Label>Condiții EN</Label><Textarea value={form.bookingTermsEn} onChange={(event) => set("bookingTermsEn", event.target.value)} /></div>
            </div>
          </section>

          <section className="space-y-4 rounded-xl border border-border/50 p-4">
            <h2 className="font-heading text-lg font-semibold">Facilități</h2>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {CANONICAL_FACILITIES.map((facility) => <label key={facility} className="flex cursor-pointer items-center gap-2 rounded-lg border border-border/40 px-3 py-2 text-sm"><input type="checkbox" checked={form.facilities.includes(facility)} onChange={() => toggleFacility(facility)} className="h-4 w-4 accent-gold" />{facility}</label>)}
            </div>
            <div className="flex flex-wrap gap-2">
              {form.facilities.filter((facility) => !CANONICAL_FACILITIES.includes(facility as typeof CANONICAL_FACILITIES[number])).map((facility) => <span key={facility} className="inline-flex items-center gap-1 rounded-full border border-gold/30 bg-gold/10 px-3 py-1 text-xs text-gold">{facility}<button type="button" onClick={() => toggleFacility(facility)} aria-label={`Șterge ${facility}`}><X className="h-3 w-3" /></button></span>)}
            </div>
            <div className="flex gap-2"><Input value={customFacility} maxLength={80} onChange={(event) => setCustomFacility(event.target.value)} placeholder="Altă facilitate" onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addCustomFacility(); } }} /><Button type="button" variant="outline" onClick={addCustomFacility}><Plus className="mr-2 h-4 w-4" /> Adaugă</Button></div>
          </section>

          <section className="space-y-4 rounded-xl border border-border/50 p-4">
            <h2 className="font-heading text-lg font-semibold">Program și pauză între evenimente</h2>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.inheritWorkingHours} onChange={(event) => set("inheritWorkingHours", event.target.checked)} className="h-4 w-4 accent-gold" />Folosește programul localului</label>
            {!form.inheritWorkingHours && (
              <div className="space-y-2 rounded-lg border border-border/40 p-3">
                {HALL_WORKING_HOUR_DAYS.map((day) => {
                  const interval = form.workingHours[day];
                  return <div key={day} className="grid items-center gap-2 sm:grid-cols-[7rem_5rem_1fr_1fr]"><span className="text-sm font-medium">{DAY_LABELS[day]}</span><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={interval != null} onChange={() => toggleWorkingDay(day)} className="h-4 w-4 accent-gold" />{interval ? "Deschis" : "Închis"}</label><Input type="time" disabled={!interval} value={interval?.open ?? "10:00"} onChange={(event) => updateWorkingDay(day, "open", event.target.value)} aria-label={`Deschidere ${DAY_LABELS[day]}`} /><Input type="time" disabled={!interval} value={interval?.close ?? "22:00"} onChange={(event) => updateWorkingDay(day, "close", event.target.value)} aria-label={`Închidere ${DAY_LABELS[day]}`} /></div>;
                })}
              </div>
            )}
            <div className="max-w-sm"><Label>Pauză între evenimente (minute)</Label><Input type="number" min="0" max={24 * 60} value={form.bufferMinutes} onChange={(event) => set("bufferMinutes", event.target.value)} placeholder="Moștenită de la local" /><p className="mt-1 text-xs text-muted-foreground">Lasă gol pentru a folosi pauza setată la nivelul localului.</p></div>
          </section>

          <section className="space-y-4 rounded-xl border border-border/50 p-4">
            <div className="flex items-center justify-between gap-3"><h2 className="font-heading text-lg font-semibold">Meniu și pachete</h2>{menuSetsLoadFailed && <Button type="button" variant="outline" size="sm" onClick={() => setMenuSetsLoadAttempt((attempt) => attempt + 1)}>Reîncarcă meniurile</Button>}</div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.inheritMenu} onChange={(event) => { setForm((previous) => ({ ...previous, inheritMenu: event.target.checked })); setMenuDirty(true); setFieldError(null); }} className="h-4 w-4 accent-gold" />Moștenește toate meniurile localului</label>
            {!form.inheritMenu && (
              <div className="space-y-2">
                {menuSetsLoading && <p className="text-sm text-muted-foreground">Se încarcă meniurile…</p>}
                {!menuSetsLoading && availableMenuSets.length === 0 && <p className="text-sm text-amber-500">Localul nu are încă seturi de meniu disponibile.</p>}
                {availableMenuSets.map((menuSet) => <label key={menuSet.id} className="flex items-center gap-2 rounded-lg border border-border/40 px-3 py-2 text-sm"><input type="checkbox" checked={form.menuSetIds.includes(menuSet.id)} onChange={() => toggleMenuSet(menuSet.id)} className="h-4 w-4 accent-gold" /><span>{menuSet.nameRo}</span>{menuSet.isDefault && <span className="text-xs text-muted-foreground">(implicit)</span>}</label>)}
                {form.menuSetIds.filter((id) => !availableMenuSets.some((menuSet) => menuSet.id === id)).map((id) => <p key={id} className="text-xs text-amber-500">Setul #{id} nu mai este disponibil. Cererea existentă rămâne neschimbată până la reluare sau corectare.</p>)}
              </div>
            )}
          </section>

          <section className="space-y-4 rounded-xl border border-border/50 p-4">
            <div><h2 className="font-heading text-lg font-semibold">Fotografii</h2><p className="text-xs text-muted-foreground">Maximum {MAX_HALL_IMAGES} imagini, câte 10 MB fiecare. Fișierele încărcate cu succes sunt păstrate chiar dacă alt fișier eșuează.</p></div>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border/50 px-3 py-2 text-sm hover:border-gold/50">{uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}{uploading ? "Se încarcă…" : "Încarcă imagini"}<input type="file" accept="image/*" multiple className="sr-only" onChange={(event) => { void uploadHallImages(event.target.files); event.currentTarget.value = ""; }} /></label>
            <div className="space-y-2">
              {form.imageUrls.map((url, index) => <div key={`${url}-${index}`} className="flex items-center justify-between gap-3 rounded-lg border border-border/40 px-3 py-2 text-sm"><span className="min-w-0 truncate" title={url}>{index + 1}. {url}</span><Button type="button" variant="ghost" size="sm" onClick={() => removeImage(index)} aria-label={`Șterge imaginea ${index + 1}`}><Trash2 className="h-4 w-4" /></Button></div>)}
              {form.imageUrls.length === 0 && <p className="text-sm text-muted-foreground">Nu ai încărcat încă fotografii pentru această sală.</p>}
            </div>
          </section>
        </fieldset>

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" disabled={busy || uploading || !loaded || checkingReplay || recoveryOnly || hallReadOnly} onClick={() => void save(false)}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : hasPendingCreate ? "Reîncearcă salvarea" : "Salvează draft"}</Button>
          <Button type="button" className="bg-gold text-[#0D0D0D] hover:bg-gold-dark" disabled={busy || uploading || !loaded || checkingReplay || recoveryOnly || hallReadOnly} onClick={() => void save(true)}>{hasPendingCreate ? "Reîncearcă și trimite" : "Trimite la aprobare"}</Button>
        </div>
      </CardContent>
    </Card>
  );
}
