"use client";

// Partner onboarding — extended flow:
//   Step 0: Pick category
//   Step 1: Name + Photo
//   Step 2: Description (with AI-generate button — needs ≥ 40 chars input)
//   Step 3: Location + travel preferences
//   Step 4: Pricing (priceFrom + travel surcharge)
//   Step 5: Confirmation
//
// Phone is captured at registration. The submit endpoint
// (/api/auth/register-artist) creates the artist row in the DB and the
// follow-up PATCH (/api/artists/crud PUT) saves the extended fields.

import { useState, useEffect, useRef } from "react";
import {
  checkName,
  checkDescription,
  textIssueKey,
} from "@/lib/validation/text-quality";
import { eventTypeLabel, type EventTypeKey } from "@/lib/events/normalize";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { toast } from "sonner";
import Image from "next/image";
import { cn } from "@/lib/utils";
import {
  ArrowRight,
  ArrowLeft,
  CheckCircle,
  Sparkles,
  Upload,
  Loader2,
  Camera,
  Wand2,
  MapPin,
  Euro,
} from "lucide-react";
import {
  MOLDOVA_CITIES,
  TRAVEL_DISTANCE_OPTIONS,
} from "@/lib/moldova-cities";
import { getLocalized } from "@/i18n";
import { useLocale } from "@/hooks/use-locale";
import { ESignature, type ESignatureValue } from "@/components/legal/e-signature";
import { LEGAL_PACK_VERSION } from "@/lib/legal";

interface Category {
  id: number;
  nameRo: string;
  nameRu: string | null;
  nameEn: string | null;
  slug: string;
  type: string;
}

const STEP_KEYS = [
  "category",
  "personal",
  "description",
  "location",
  "price",
  "confirm",
] as const;

const MIN_AI_INPUT = 40;

const PRICING_EVENT_KEYS = [
  "wedding",
  "cununie",
  "baptism",
  "cumatrie",
  "birthday",
  "kids_birthday",
  "corporate",
  "concert",
  "proposal",
  "other",
] as const;

export default function OnboardingPage() {
  const router = useRouter();
  const { user } = useUser();
  const { locale, t } = useLocale();
  const STEP_LABELS = STEP_KEYS.map((k) => t(`vendor.onboarding.step.${k}`));
  const [step, setStep] = useState(0);
  // Vendors must sign the Legal Pack before their profile is submitted.
  const [signature, setSignature] = useState<ESignatureValue | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [data, setData] = useState({
    name: "",
    location: "Chișinău",
    categoryId: 0,
    imageUrl: "",
    description: "",
    baseCity: "Chișinău",
    travelDistanceKm: 30,
    travelSurchargeEnabled: false,
    travelSurchargeAmount: 0,
    /** Legacy single "preț de start" — kept around for back-compat
     *  when the user can't / won't define duration tiers. The
     *  packages array below is the canonical source. */
    priceFrom: 0,
    priceHidden: false,
    /** Multiple duration → price tiers. Same shape as
     *  artist_packages rows; persisted as such on submit. Starts
     *  empty — the partner adds their own values without preset
     *  hints to anchor on. */
    pricePackages: [] as Array<{
      hours: number;
      minutes: number;
      price: number;
      nameRo: string;
      /** per_hour — a duration tier. per_event — one figure for the whole
       *  event, which is how photographers and videographers actually
       *  quote: one price for a wedding, another for a christening. */
      pricingMode: "per_hour" | "per_event";
      /** Which event the per_event price covers; "" means any. */
      eventType: string;
    }>,
  });
  const [submitting, setSubmitting] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [generatingAi, setGeneratingAi] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/categories")
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((cats) =>
        setCategories(
          cats.filter(
            (category: Category) =>
              category.type === "artist" || category.type === "service",
          ),
        ),
      )
      .catch(() => toast.error(t("vendor.onboarding.errCategories")));

    if (user) {
      // Only seed Clerk values when the local fields are still empty.
      // Without this guard, useUser re-emits (focus, tab switch, HMR)
      // would clobber any photo the partner just uploaded.
      setData((d) => ({
        ...d,
        name: d.name || user.fullName || "",
        imageUrl: d.imageUrl || user.imageUrl || "",
      }));
    }
  }, [user]);

  function update(partial: Partial<typeof data>) {
    setData((prev) => ({ ...prev, ...partial }));
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error(t("vendor.onboarding.errImageType"));
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error(t("vendor.onboarding.errImageSize"));
      return;
    }
    setUploadingPhoto(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("folder", "avatars");
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Upload failed (${res.status})`);
      }
      const { url } = await res.json();
      update({ imageUrl: url });
      toast.success(t("vendor.onboarding.photoUploaded"));
    } catch (err) {
      const msg =
        err instanceof Error && err.message
          ? err.message
          : t("vendor.onboarding.errUpload");
      toast.error(msg);
    } finally {
      setUploadingPhoto(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  // Generate description via AI. Requires ≥ 40 chars of input from the user
  // first — used as the seed for Claude. Without that, the AI can't produce
  // anything specific, so we gate the button.
  async function handleGenerateAi() {
    if (data.description.trim().length < MIN_AI_INPUT) {
      toast.error(t("vendor.onboarding.errAiTooShort", { n: MIN_AI_INPUT }));
      return;
    }
    const category = categories.find((c) => c.id === data.categoryId);
    if (!category) {
      toast.error(t("vendor.onboarding.errNoCategory"));
      return;
    }
    setGeneratingAi(true);
    try {
      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "description",
          name: data.name || "Artistul",
          category: category.nameRo,
          location: data.baseCity,
          // The /api/ai/generate schema reads `description`, not `existing`.
          // It feeds Claude as the seed text for the rewrite pass.
          description: data.description,
          language: "ro",
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || t("vendor.onboarding.errGenerate"));
      }
      // The endpoint returns { result: "..." }, not { description: "..." }.
      const { result } = await res.json();
      if (typeof result === "string" && result.trim().length > 0) {
        update({ description: result });
        toast.success(t("vendor.onboarding.aiDone"));
      } else {
        toast.error(t("vendor.onboarding.errAiInvalid"));
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("vendor.onboarding.errAi"),
      );
    } finally {
      setGeneratingAi(false);
    }
  }

  async function handleSubmit() {
    setSubmitting(true);
    try {
      // Drop empty / zero-priced tiers before submit. Server validates
      // again but trimming here keeps the payload clean.
      // An event tier has no duration by design, so requiring one here would
      // throw away exactly the prices the partner came to set.
      const cleanPackages = (data.pricePackages || [])
        .filter(
          (p) =>
            p.price > 0 &&
            (p.pricingMode === "per_event" || p.hours > 0 || p.minutes > 0),
        )
        .map((p) => ({
          ...p,
          eventType:
            p.pricingMode === "per_event" && p.eventType ? p.eventType : null,
        }));

      // 1. Create the artist row (same endpoint as before).
      // Record the electronic acceptance first: if the profile were created
      // and this failed, we'd have a live vendor with no signed contract.
      if (!signature?.accepted) throw new Error(t("legal.signIntro"));
      {
        const acceptance = await fetch("/api/legal/accept", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subjectType: "artist",
            accepted: true,
            packVersion: LEGAL_PACK_VERSION,
            signatureName: signature.signatureName,
            signatureImage: signature.signatureImage,
            documents: signature.documents,
            identity: signature.identity,
            locale: document.documentElement.lang || "ro",
          }),
        });
        if (!acceptance.ok) {
          const error = await acceptance.json().catch(() => ({}));
          throw new Error(error.error || t("legal.signIntro"));
        }
      }

      const res = await fetch("/api/auth/register-artist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.name,
          phone: "",
          categoryId: data.categoryId,
          location: data.location,
          imageUrl: data.imageUrl,
          description: data.description || undefined,
          priceFrom: data.priceFrom > 0 ? data.priceFrom : undefined,
          packages: cleanPackages.length > 0 ? cleanPackages : undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const { artistId } = await res.json();

      // 2. PATCH the extended fields (travel + base city) via the artist
      // crud endpoint. Fire-and-forget so a transient failure here doesn't
      // block the success toast — admins can fix from /admin/artisti later.
      if (artistId) {
        try {
          await fetch("/api/artists/crud", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id: artistId,
              baseCity: data.baseCity,
              travelDistanceKm: data.travelDistanceKm,
              travelSurchargeEnabled: data.travelSurchargeEnabled,
              travelSurchargeAmount: data.travelSurchargeEnabled
                ? data.travelSurchargeAmount
                : null,
              priceHidden: data.priceHidden,
            }),
          });
        } catch {
          /* ignore — non-critical */
        }
      }

      toast.success(t("vendor.onboarding.submitted"));
      router.push("/dashboard");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("vendor.onboarding.errSubmit"),
      );
    } finally {
      setSubmitting(false);
    }
  }

  function canContinue(): boolean {
    switch (step) {
      case 0:
        return !!data.categoryId;
      case 1:
        // Presence was the only rule, so "kk" walked straight through.
        return checkName(data.name).ok;
      case 2:
        // Still optional — but if something was typed, it has to say
        // something. "000" used to reach an admin for approval.
        return checkDescription(data.description).ok;
      case 3:
        return !!data.baseCity;
      case 4:
        return true; // price is optional
      default:
        return false;
    }
  }

  return (
    <div className="mx-auto max-w-2xl py-12 px-4">
      <div className="mb-8 text-center">
        <Sparkles className="mx-auto mb-3 h-10 w-10 text-gold" />
        <h1 className="font-heading text-2xl font-bold">
          {t("vendor.onboarding.title")}
        </h1>
        <p className="mt-1 text-muted-foreground">
          {t("vendor.pending.hint")}
        </p>
      </div>

      {/* Progress */}
      <div className="mb-10 flex flex-wrap justify-center gap-2 sm:gap-3">
        {STEP_LABELS.map((label, i) => (
          <div key={i} className="flex items-center gap-2">
            <div
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold",
                i < step
                  ? "bg-gold text-[#0D0D0D]"
                  : i === step
                    ? "bg-gold text-[#0D0D0D] ring-4 ring-gold/20"
                    : "bg-muted text-muted-foreground",
              )}
            >
              {i < step ? <CheckCircle className="h-4 w-4" /> : i + 1}
            </div>
            <span className="hidden text-xs sm:inline">{label}</span>
            {i < STEP_LABELS.length - 1 && (
              <div className={cn("h-0.5 w-6 sm:w-8", i < step ? "bg-gold" : "bg-muted")} />
            )}
          </div>
        ))}
      </div>

      {/* Step 0: Category */}
      {step === 0 && (
        <div className="space-y-4 rounded-xl border border-border/40 bg-card p-6">
          <h2 className="font-heading text-lg font-bold">
            {t("vendor.onboarding.pickCategory")}
          </h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => update({ categoryId: cat.id })}
                className={cn(
                  "rounded-lg border p-3 text-left text-sm transition-all",
                  data.categoryId === cat.id
                    ? "border-gold bg-gold/10 text-gold font-medium"
                    : "border-border/40 hover:border-gold/30",
                )}
              >
                {getLocalized(cat, "name", locale)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step 1: Name + Photo */}
      {step === 1 && (
        <div className="space-y-5 rounded-xl border border-border/40 bg-card p-6">
          <h2 className="font-heading text-lg font-bold">
            {t("vendor.onboarding.yourData")}
          </h2>

          <div>
            <Label>{t("vendor.onboarding.profilePhoto")}</Label>
            <div className="mt-2 flex items-center gap-4">
              <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl border border-border/40 bg-muted">
                {data.imageUrl ? (
                  <Image
                    src={data.imageUrl}
                    alt={t("vendor.profile")}
                    fill
                    sizes="96px"
                    className="object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-muted-foreground/40">
                    <Camera className="h-8 w-8" />
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handlePhotoUpload}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingPhoto}
                >
                  {uploadingPhoto ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  {data.imageUrl
                    ? t("vendor.onboarding.changePhoto")
                    : t("vendor.onboarding.uploadPhoto")}
                </Button>
                {data.imageUrl && (
                  <button
                    type="button"
                    className="text-xs text-destructive hover:underline"
                    onClick={() => update({ imageUrl: "" })}
                  >
                    {t("vendor.onboarding.deletePhoto")}
                  </button>
                )}
              </div>
            </div>
          </div>

          <div>
            <Label className="mb-1.5 block">
              {t("vendor.onboarding.stageName")}
            </Label>
            <Input
              value={data.name}
              onChange={(e) => update({ name: e.target.value })}
              placeholder={t("vendor.onboarding.stageNamePlaceholder")}
            />
            {/* Say why Continue is disabled. A dead button with no reason is
                worse than one that lets junk through. */}
            {data.name.trim().length > 0 && !checkName(data.name).ok && (
              <p className="mt-1.5 text-xs text-amber-500">
                {t(textIssueKey("name", checkName(data.name).issue!))}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Step 2: Description (with AI) */}
      {step === 2 && (
        <div className="space-y-4 rounded-xl border border-border/40 bg-card p-6">
          <div>
            <h2 className="font-heading text-lg font-bold">
              {t("vendor.onboarding.step.description")}
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              {t("vendor.onboarding.descHintBefore", { n: MIN_AI_INPUT })}{" "}
              <strong>{t("vendor.onboarding.generateAi")}</strong>{" "}
              {t("vendor.onboarding.descHintAfter")}
            </p>
          </div>
          <textarea
            value={data.description}
            onChange={(e) => update({ description: e.target.value })}
            placeholder={t("vendor.onboarding.descPlaceholder")}
            rows={8}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              {t("vendor.onboarding.charCount", {
                n: data.description.length,
              })}
              {data.description.trim().length < MIN_AI_INPUT && (
                <span className="text-amber-500 ml-1">
                  {t("vendor.onboarding.minForAi", { n: MIN_AI_INPUT })}
                </span>
              )}
            </p>
            {data.description.trim().length > 0 &&
              !checkDescription(data.description).ok && (
                <p className="mt-1.5 text-xs text-amber-500">
                  {t(
                    textIssueKey(
                      "description",
                      checkDescription(data.description).issue!,
                    ),
                  )}
                </p>
              )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleGenerateAi}
              disabled={generatingAi || data.description.trim().length < MIN_AI_INPUT}
              className="gap-1.5 border-gold/40 text-gold hover:bg-gold/10"
            >
              {generatingAi ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Wand2 className="h-3.5 w-3.5" />
              )}
              {t("vendor.onboarding.generateAi")}
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Location & travel */}
      {step === 3 && (
        <div className="space-y-5 rounded-xl border border-border/40 bg-card p-6">
          <div>
            <h2 className="font-heading text-lg font-bold flex items-center gap-2">
              <MapPin className="h-5 w-5 text-gold" />
              {t("vendor.settings.travelTitle")}
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              {t("vendor.onboarding.locationHint")}
            </p>
          </div>

          <div>
            <Label>{t("vendor.onboarding.baseCityRequired")}</Label>
            <select
              value={data.baseCity}
              onChange={(e) => update({ baseCity: e.target.value, location: e.target.value })}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm"
            >
              {MOLDOVA_CITIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("vendor.settings.baseCityHint")}
            </p>
          </div>

          <div>
            <Label>{t("vendor.settings.maxDistance")}</Label>
            <select
              value={data.travelDistanceKm}
              onChange={(e) => update({ travelDistanceKm: Number(e.target.value) })}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm"
            >
              {TRAVEL_DISTANCE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("vendor.settings.maxDistanceHint")}
            </p>
          </div>

          <div className="rounded-lg border border-border/40 bg-background/50 p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <Label>{t("vendor.settings.travelFee")}</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t("vendor.onboarding.travelFeeHint")}
                </p>
              </div>
              <input
                type="checkbox"
                checked={data.travelSurchargeEnabled}
                onChange={(e) => update({ travelSurchargeEnabled: e.target.checked })}
                className="mt-1.5 h-4 w-4 rounded border-input"
              />
            </div>
            {data.travelSurchargeEnabled && (
              <div className="flex items-center gap-3">
                <Label className="flex-1">
                  {t("vendor.onboarding.amountEur")}
                </Label>
                <Input
                  type="number"
                  min={0}
                  value={data.travelSurchargeAmount || ""}
                  onChange={(e) => update({ travelSurchargeAmount: Number(e.target.value) })}
                  className="w-32"
                  placeholder={t("vendor.settings.travelAmountPlaceholder")}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Step 4: Pricing */}
      {step === 4 && (
        <div className="space-y-4 rounded-xl border border-border/40 bg-card p-6">
          <div>
            <h2 className="font-heading text-lg font-bold flex items-center gap-2">
              <Euro className="h-5 w-5 text-gold" />
              {t("dashboard.rates")}
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              {t("vendor.onboarding.ratesHint")}{" "}
              <strong>/dashboard/tarife</strong>.
            </p>
          </div>
          {!data.priceHidden && (
            <div className="space-y-3">
              {data.pricePackages.map((tier, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-border/40 bg-background/50 p-3"
                >
                  {/* How this tier prices the work. A photographer quotes by
                      the wedding, a DJ by the hour — both have to fit. */}
                  <div className="mb-3 flex gap-1.5">
                    {(["per_hour", "per_event"] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => {
                          const next = [...data.pricePackages];
                          next[i] = { ...tier, pricingMode: mode };
                          update({ pricePackages: next });
                        }}
                        className={`rounded-md px-2.5 py-1 text-[11px] transition-colors ${
                          tier.pricingMode === mode
                            ? "bg-gold/15 text-gold ring-1 ring-gold/40"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {mode === "per_hour"
                          ? t("vendor.onboarding.pricingByDuration")
                          : t("vendor.onboarding.pricingByEvent")}
                      </button>
                    ))}
                  </div>

                  {tier.pricingMode === "per_event" ? (
                    <div className="grid grid-cols-12 items-end gap-2">
                      <div className="col-span-6">
                        <Label className="mb-1.5 block text-[11px]">
                          {t("vendor.onboarding.eventTypeLabel")}
                        </Label>
                        <select
                          value={tier.eventType}
                          onChange={(e) => {
                            const next = [...data.pricePackages];
                            next[i] = { ...tier, eventType: e.target.value };
                            update({ pricePackages: next });
                          }}
                          className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                        >
                          <option value="">
                            {t("vendor.onboarding.eventTypeAny")}
                          </option>
                          {PRICING_EVENT_KEYS.map((k) => (
                            <option key={k} value={k}>
                              {eventTypeLabel(k as EventTypeKey, locale)}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="col-span-4">
                        <Label className="mb-1.5 block text-[11px]">
                          {t("vendor.calPage.priceLabel")}
                        </Label>
                        <Input
                          type="number"
                          min={0}
                          value={tier.price || ""}
                          onChange={(e) => {
                            const next = [...data.pricePackages];
                            next[i] = {
                              ...tier,
                              price: Number(e.target.value) || 0,
                            };
                            update({ pricePackages: next });
                          }}
                        />
                      </div>
                      <div className="col-span-2 flex justify-end">
                        <button
                          type="button"
                          onClick={() => {
                            const next = data.pricePackages.filter(
                              (_, j) => j !== i,
                            );
                            update({ pricePackages: next });
                          }}
                          className="rounded-md border border-destructive/40 px-2 py-1.5 text-xs text-destructive hover:bg-destructive/10"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  ) : (
                  <div className="grid grid-cols-12 items-end gap-2">
                    <div className="col-span-3">
                      <Label className="mb-1.5 block text-[11px]">
                        {t("vendor.onboarding.hours")}
                      </Label>
                      <Input
                        type="number"
                        min={0}
                        max={24}
                        value={tier.hours || ""}
                        onChange={(e) => {
                          const next = [...data.pricePackages];
                          next[i] = {
                            ...tier,
                            hours: Number(e.target.value) || 0,
                          };
                          update({ pricePackages: next });
                        }}
                      />
                    </div>
                    <div className="col-span-3">
                      <Label className="mb-1.5 block text-[11px]">
                        {t("vendor.onboarding.minutes")}
                      </Label>
                      <Input
                        type="number"
                        min={0}
                        max={59}
                        step={15}
                        value={tier.minutes || ""}
                        onChange={(e) => {
                          const next = [...data.pricePackages];
                          next[i] = {
                            ...tier,
                            minutes: Number(e.target.value) || 0,
                          };
                          update({ pricePackages: next });
                        }}
                      />
                    </div>
                    <div className="col-span-4">
                      <Label className="mb-1.5 block text-[11px]">
                        {t("vendor.calPage.priceLabel")}
                      </Label>
                      <Input
                        type="number"
                        min={0}
                        value={tier.price || ""}
                        onChange={(e) => {
                          const next = [...data.pricePackages];
                          next[i] = {
                            ...tier,
                            price: Number(e.target.value) || 0,
                          };
                          update({ pricePackages: next });
                        }}
                      />
                    </div>
                    <div className="col-span-2 flex justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          const next = data.pricePackages.filter(
                            (_, j) => j !== i,
                          );
                          update({ pricePackages: next });
                        }}
                        className="rounded-md border border-destructive/40 px-2 py-1.5 text-xs text-destructive hover:bg-destructive/10"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={() =>
                  update({
                    pricePackages: [
                      ...data.pricePackages,
                      {
                        hours: 0,
                        minutes: 0,
                        price: 0,
                        nameRo: "",
                        pricingMode: "per_hour" as const,
                        eventType: "",
                      },
                    ],
                  })
                }
                className="w-full rounded-lg border border-dashed border-border/40 px-3 py-2 text-xs text-muted-foreground hover:border-gold/40 hover:text-gold"
              >
                {t("vendor.onboarding.addRate")}
              </button>
            </div>
          )}
          {/* Toggle "ascunde prețul" — for artists with negotiated pricing.
              When enabled, clients see "Preț la cerere" + a "request quote"
              form instead of "Solicită rezervare". */}
          <div className="rounded-lg border border-border/40 bg-background/50 p-4">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={data.priceHidden}
                onChange={(e) => update({ priceHidden: e.target.checked, priceFrom: e.target.checked ? 0 : data.priceFrom })}
                className="mt-1 h-4 w-4 rounded border-input"
              />
              <div className="flex-1">
                <p className="text-sm font-medium">
                  {t("vendor.settings.hidePrice")}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t("vendor.onboarding.hidePriceHint")}
                </p>
              </div>
            </label>
          </div>
        </div>
      )}

      {/* Step 5: Confirm */}
      {step === 5 && (
        <div className="space-y-4 rounded-xl border border-border/40 bg-card p-6">
          <h2 className="font-heading text-lg font-bold">
            {t("vendor.onboarding.confirmData")}
          </h2>
          {data.imageUrl && (
            <div className="flex justify-center">
              <div className="relative h-28 w-28 overflow-hidden rounded-xl border border-gold/30">
                <Image
                  src={data.imageUrl}
                  alt={t("vendor.profile")}
                  fill
                  sizes="112px"
                  className="object-cover"
                />
              </div>
            </div>
          )}
          <div className="space-y-2 text-sm">
            <SummaryRow
              label={t("vendor.onboarding.step.category")}
              value={
                (() => {
                  const category = categories.find((c) => c.id === data.categoryId);
                  return category ? getLocalized(category, "name", locale) : "—";
                })()
              }
            />
            <SummaryRow
              label={t("vendor.onboarding.sumName")}
              value={data.name}
            />
            <SummaryRow
              label={t("vendor.settings.baseCity")}
              value={data.baseCity}
            />
            <SummaryRow
              label={t("vendor.onboarding.sumTravel")}
              value={TRAVEL_DISTANCE_OPTIONS.find((o) => o.value === data.travelDistanceKm)?.label ?? "—"}
            />
            {data.travelSurchargeEnabled && (
              <SummaryRow
                label={t("vendor.onboarding.sumTravelFee")}
                value={`${data.travelSurchargeAmount}€`}
              />
            )}
            {data.priceFrom > 0 && (
              <SummaryRow
                label={t("vendor.onboarding.sumStartPrice")}
                value={`${data.priceFrom}€`}
              />
            )}
            {(() => {
              const tiers = data.pricePackages.filter(
                (p) => p.price > 0 && (p.hours > 0 || p.minutes > 0),
              );
              if (tiers.length === 0) return null;
              return (
                <SummaryRow
                  label={t("dashboard.rates")}
                  value={tiers
                    .map((p) => {
                      const dur =
                        p.hours > 0
                          ? `${p.hours}h${p.minutes ? ` ${p.minutes}m` : ""}`
                          : `${p.minutes} min`;
                      return `${dur} = ${p.price}€`;
                    })
                    .join(" · ")}
                />
              );
            })()}
            {data.description && (
              <div className="rounded-lg bg-muted/40 p-3 mt-3">
                <p className="text-xs font-medium text-muted-foreground mb-1">
                  {t("vendor.onboarding.step.description")}
                </p>
                <p className="text-sm whitespace-pre-wrap">{data.description}</p>
              </div>
            )}
          </div>
          <div className="rounded-lg bg-warning/10 border border-warning/30 p-4 text-sm text-warning">
            {t("vendor.onboarding.approvalNote")}
          </div>
        </div>
      )}

      {/* The signature sits ABOVE the navigation row, on its own full-width
          line. It used to be a third flex child of that row, between the two
          buttons — `justify-between` then pushed Back to the far left and
          Submit to the far right and squeezed the signature card into the
          middle, which is why this step looked broken while every other one
          looked fine. */}
      {step === STEP_LABELS.length - 1 && (
        <div className="mt-8">
          <ESignature subjectType="artist" onChange={setSignature} />
        </div>
      )}

      {/* Navigation */}
      <div className="mt-8 flex items-center justify-between">
        <Button
          variant="outline"
          disabled={step === 0}
          onClick={() => setStep(step - 1)}
          className="gap-2"
        >
          <ArrowLeft className="h-4 w-4" /> {t("common.back")}
        </Button>
        {step < STEP_LABELS.length - 1 ? (
          <Button
            onClick={() => setStep(step + 1)}
            disabled={!canContinue()}
            className="bg-gold text-[#0D0D0D] hover:bg-gold-dark gap-2"
          >
            {t("common.next")} <ArrowRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            onClick={handleSubmit}
            disabled={submitting || !signature?.accepted}
            className="bg-gold text-[#0D0D0D] hover:bg-gold-dark gap-2"
          >
            {submitting ? (
              t("vendor.onboarding.sending")
            ) : (
              <>
                <CheckCircle className="h-4 w-4" />{" "}
                {t("vendor.onboarding.submitForApproval")}
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}:</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  );
}
