"use client";

// Venue owner registration wizard — extended flow:
//   Step 0: Date de bază (name, phone, address — required)
//   Step 1: Capacitate
//   Step 2: Foto galerie (≥ 1 photo required, up to 10)
//   Step 3: Extras (menu PDF, menu URL, virtual tour, website — all optional)
//   Step 4: Confirmare

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import Image from "next/image";
import { toast } from "sonner";
import {
  ArrowRight,
  ArrowLeft,
  CheckCircle,
  Building2,
  Upload,
  Loader2,
  X,
  Camera,
  FileText,
  Globe,
  PlayCircle,
  Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { MOLDOVA_CITIES, DEFAULT_CITY } from "@/lib/moldova-cities";
import { MapsAutofill } from "@/components/vendor/maps-autofill";
import { ESignature, type ESignatureValue } from "@/components/legal/e-signature";
import { useLocale } from "@/hooks/use-locale";

const STEP_LABEL_KEYS = [
  "vendor.venueOnboarding.stepBasics",
  "venue.capacity",
  "vendor.venueOnboarding.stepPhotos",
  "vendor.venueOnboarding.stepExtra",
  "wizard.steps.confirm",
];

export default function VenueOnboardingPage() {
  const { t } = useLocale();
  const router = useRouter();
  const { user } = useUser();
  const [step, setStep] = useState(0);
  // Vendors must sign the Legal Pack before their profile is submitted.
  const [signature, setSignature] = useState<ESignatureValue | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [loadingExisting, setLoadingExisting] = useState(true);
  const [resubmit, setResubmit] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const menuInputRef = useRef<HTMLInputElement>(null);
  const [data, setData] = useState({
    name: "",
    phone: "",
    city: DEFAULT_CITY,
    address: "",
    capacityMin: 50,
    capacityMax: 200,
    description: "",
    imageUrls: [] as string[],
    menuPdfUrl: "",
    menuUrl: "",
    virtualTourUrl: "",
    websiteUrl: "",
    // From Maps autofill — never typed by hand. We forward them on submit
    // so the public venue page can render the map and the schedule
    // section without an admin needing to manually fill them.
    lat: null as number | null,
    lng: null as number | null,
    workingHours: null as
      | {
          mon: { open: string; close: string } | null;
          tue: { open: string; close: string } | null;
          wed: { open: string; close: string } | null;
          thu: { open: string; close: string } | null;
          fri: { open: string; close: string } | null;
          sat: { open: string; close: string } | null;
          sun: { open: string; close: string } | null;
        }
      | null,
  });

  // Pre-fill the form if the user already has a venue submission. Approved
  // venues redirect to the dashboard (admin-edit only). Pending ones load
  // their existing data so the user can fix what was wrong and re-submit
  // without re-entering everything from scratch.
  useEffect(() => {
    let alive = true;
    fetch("/api/me/venue", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { venue: null }))
      .then((res: { venue: Record<string, unknown> | null; images?: Array<{ url: string }> }) => {
        if (!alive) return;
        const v = res?.venue;
        if (!v) return;
        if (v.isActive) {
          // Already approved — bounce them into the dashboard. They can edit
          // through /dashboard/sala/profil from there.
          router.replace("/dashboard/sala");
          return;
        }
        // Pending — pre-fill the wizard so they can finish/correct + re-submit.
        setResubmit(true);
        setData({
          name: (v.nameRo as string) || "",
          phone: (v.phone as string) || "",
          city: (v.city as string) || DEFAULT_CITY,
          address: (v.address as string) || "",
          capacityMin: Number(v.capacityMin) || 50,
          capacityMax: Number(v.capacityMax) || 200,
          description: (v.descriptionRo as string) || "",
          imageUrls: Array.isArray(res.images) ? res.images.map((i) => i.url) : [],
          menuPdfUrl: (v.menuPdfUrl as string) || "",
          menuUrl: (v.menuUrl as string) || "",
          virtualTourUrl: (v.virtualTourUrl as string) || "",
          websiteUrl: (v.website as string) || "",
          // Re-hydrate the Maps payload so a re-submit doesn't accidentally
          // wipe coordinates / schedule that admins manually filled.
          lat: typeof v.lat === "number" ? (v.lat as number) : null,
          lng: typeof v.lng === "number" ? (v.lng as number) : null,
          workingHours:
            (v.workingHours as {
              mon: { open: string; close: string } | null;
              tue: { open: string; close: string } | null;
              wed: { open: string; close: string } | null;
              thu: { open: string; close: string } | null;
              fri: { open: string; close: string } | null;
              sat: { open: string; close: string } | null;
              sun: { open: string; close: string } | null;
            } | null) ?? null,
        });
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setLoadingExisting(false);
      });
    return () => {
      alive = false;
    };
  }, [router]);

  function update(partial: Partial<typeof data>) {
    setData((prev) => ({ ...prev, ...partial }));
  }

  async function uploadFile(file: File, folder: "venues" | "uploads"): Promise<string | null> {
    if (file.size > 10 * 1024 * 1024) {
      toast.error(t("vendor.venueOnboarding.fileTooLarge"));
      return null;
    }
    const fd = new FormData();
    fd.append("file", file);
    fd.append("folder", folder);
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error || t("moments.errUploadFailed"));
      return null;
    }
    const { url } = await res.json();
    return url;
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    if (data.imageUrls.length + files.length > 10) {
      toast.error(t("vendor.venueOnboarding.maxImages"));
      return;
    }
    setUploading(true);
    try {
      const newUrls: string[] = [];
      for (const file of files) {
        if (!file.type.startsWith("image/")) {
          toast.error(`${file.name}: ${t("vendor.venueOnboarding.notAnImage")}`);
          continue;
        }
        const url = await uploadFile(file, "venues");
        if (url) newUrls.push(url);
      }
      if (newUrls.length > 0) {
        update({ imageUrls: [...data.imageUrls, ...newUrls] });
        toast.success(
          `${newUrls.length} ${
            newUrls.length === 1
              ? t("vendor.venueOnboarding.imageUploadedOne")
              : t("vendor.venueOnboarding.imageUploadedMany")
          }`,
        );
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleMenuUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== "application/pdf") {
      toast.error(t("vendor.venueOnboarding.selectPdf"));
      return;
    }
    setUploading(true);
    try {
      const url = await uploadFile(file, "venues");
      if (url) {
        update({ menuPdfUrl: url });
        toast.success(t("vendor.venueOnboarding.menuUploaded"));
      }
    } finally {
      setUploading(false);
      if (menuInputRef.current) menuInputRef.current.value = "";
    }
  }

  function setCoverPhoto(idx: number) {
    if (idx === 0) return;
    const next = [...data.imageUrls];
    const [picked] = next.splice(idx, 1);
    next.unshift(picked);
    update({ imageUrls: next });
  }

  function removePhoto(idx: number) {
    update({ imageUrls: data.imageUrls.filter((_, i) => i !== idx) });
  }

  async function handleSubmit() {
    setSubmitting(true);
    try {
      // Record the electronic acceptance first: if the profile were created
      // and this failed, we'd have a live vendor with no signed contract.
      if (signature?.accepted) {
        await fetch("/api/legal/accept", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subjectType: "venue",
            signatureName: signature.signatureName,
            signatureImage: signature.signatureImage,
            documents: signature.documents,
            locale: document.documentElement.lang || "ro",
          }),
        });
      }

      const res = await fetch("/api/auth/register-venue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.name,
          phone: data.phone,
          email: user?.primaryEmailAddress?.emailAddress,
          city: data.city,
          address: data.address,
          capacityMin: data.capacityMin,
          capacityMax: data.capacityMax,
          description: data.description || undefined,
          imageUrls: data.imageUrls,
          menuPdfUrl: data.menuPdfUrl || undefined,
          menuUrl: data.menuUrl || undefined,
          virtualTourUrl: data.virtualTourUrl || undefined,
          websiteUrl: data.websiteUrl || undefined,
          // Maps autofill payload — server stores lat/lng so the public
          // page renders the embedded map; workingHours becomes the
          // schedule section.
          lat: data.lat ?? undefined,
          lng: data.lng ?? undefined,
          workingHours: data.workingHours ?? undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || t("vendor.venueOnboarding.registerError"));
      }
      toast.success(t("vendor.venueOnboarding.submitted"));
      router.push("/dashboard/sala");
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : t("vendor.venueOnboarding.registerError"),
      );
    } finally {
      setSubmitting(false);
    }
  }

  function canContinue(): boolean {
    switch (step) {
      case 0:
        return !!data.name.trim() && !!data.phone.trim() && !!data.address.trim();
      case 1:
        return data.capacityMin > 0 && data.capacityMax >= data.capacityMin;
      case 2:
        return data.imageUrls.length >= 1; // at least one photo required
      case 3:
        return true; // optional step
      default:
        return false;
    }
  }

  // While we check whether the user has an existing pending submission,
  // show a small spinner instead of an empty form. Cheaper UX than a flash
  // of "Înregistrare" → "Editează cererea".
  if (loadingExisting) {
    return (
      <div className="mx-auto max-w-2xl py-20 text-center">
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-gold" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl py-12 px-4">
      <div className="mb-8 text-center">
        <Building2 className="mx-auto mb-3 h-10 w-10 text-gold" />
        <h1 className="font-heading text-2xl font-bold">
          {resubmit
            ? t("vendor.venueOnboarding.editRequest")
            : t("vendor.venueOnboarding.title")}
        </h1>
        <p className="mt-1 text-muted-foreground">
          {resubmit
            ? t("vendor.venueOnboarding.pendingHint")
            : t("vendor.venueOnboarding.subtitle")}
        </p>
      </div>

      <div className="mb-10 flex flex-wrap justify-center gap-2 sm:gap-3">
        {STEP_LABEL_KEYS.map((labelKey, i) => (
          <div key={labelKey} className="flex items-center gap-2">
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
            <span className="hidden text-xs sm:inline">{t(labelKey)}</span>
            {i < STEP_LABEL_KEYS.length - 1 && (
              <div className={cn("h-0.5 w-6 sm:w-8", i < step ? "bg-gold" : "bg-muted")} />
            )}
          </div>
        ))}
      </div>

      {/* Step 0: Date de bază */}
      {step === 0 && (
        <div className="space-y-4 rounded-xl border border-border/40 bg-card p-6">
          <h2 className="font-heading text-lg font-bold">{t("vendor.venueOnboarding.aboutVenue")}</h2>
          <div>
            <Label>{t("vendor.venueOnboarding.venueName")}</Label>
            <Input
              value={data.name}
              onChange={(e) => update({ name: e.target.value })}
              placeholder={t("vendor.venueOnboarding.venueNamePlaceholder")}
            />
          </div>
          <div>
            <Label>{t("vendor.venueOnboarding.phone")}</Label>
            <Input
              value={data.phone}
              onChange={(e) => update({ phone: e.target.value })}
              placeholder="+373 69 ..."
            />
          </div>
          {/* Google Maps autofill — paste the venue's Maps URL and we
              pre-fill name, address, city, phone, website and (when
              GOOGLE_PLACES_API_KEY is set) a draft description. We never
              overwrite values the owner has already typed. */}
          <MapsAutofill
            onResult={(r) => {
              update({
                name: data.name || r.placeName || data.name,
                phone: data.phone || r.phone || data.phone,
                address: r.address || data.address,
                city:
                  r.city && MOLDOVA_CITIES.includes(r.city)
                    ? r.city
                    : data.city,
                websiteUrl: data.websiteUrl || r.website || data.websiteUrl,
                description: data.description || r.summary || data.description,
                // Coordinates and working hours are taken whenever Places
                // returns them — they aren't user-typed so there's nothing
                // to clobber.
                lat: typeof r.lat === "number" ? r.lat : data.lat,
                lng: typeof r.lng === "number" ? r.lng : data.lng,
                workingHours: r.workingHours ?? data.workingHours,
              });
            }}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>{t("vendor.venueOnboarding.city")}</Label>
              <select
                value={data.city}
                onChange={(e) => update({ city: e.target.value })}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm"
              >
                {MOLDOVA_CITIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <Label>{t("vendor.venueOnboarding.address")}</Label>
              <Input
                value={data.address}
                onChange={(e) => update({ address: e.target.value })}
                placeholder="Str. ..."
              />
              <p className="mt-1 text-[10px] text-muted-foreground">
                {t("vendor.venueOnboarding.addressHint")}
              </p>
            </div>
          </div>
          <div>
            <Label>{t("vendor.venueOnboarding.shortDescription")}</Label>
            <Textarea
              value={data.description}
              onChange={(e) => update({ description: e.target.value })}
              rows={4}
              placeholder={t("vendor.venueOnboarding.descriptionPlaceholder")}
            />
            <p className="mt-1 text-[10px] text-muted-foreground">
              {t("vendor.venueOnboarding.optionalLater")}
            </p>
          </div>
        </div>
      )}

      {/* Step 1: Capacitate */}
      {step === 1 && (
        <div className="space-y-4 rounded-xl border border-border/40 bg-card p-6">
          <h2 className="font-heading text-lg font-bold">{t("venue.capacity")}</h2>
          <p className="text-sm text-muted-foreground">
            {t("vendor.venueOnboarding.capacityHint")}
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>{t("vendor.venueOnboarding.minGuests")}</Label>
              <Input
                type="number"
                min={1}
                value={data.capacityMin}
                onChange={(e) => update({ capacityMin: Number(e.target.value) })}
              />
            </div>
            <div>
              <Label>{t("vendor.venueOnboarding.maxGuests")}</Label>
              <Input
                type="number"
                min={1}
                value={data.capacityMax}
                onChange={(e) => update({ capacityMax: Number(e.target.value) })}
              />
            </div>
          </div>
          {data.capacityMax < data.capacityMin && (
            <p className="text-xs text-destructive">
              {t("vendor.venueOnboarding.maxGteMin")}
            </p>
          )}
        </div>
      )}

      {/* Step 2: Foto */}
      {step === 2 && (
        <div className="space-y-4 rounded-xl border border-border/40 bg-card p-6">
          <div>
            <h2 className="font-heading text-lg font-bold flex items-center gap-2">
              <Camera className="h-5 w-5 text-gold" />
              {t("dashboard.photoGallery")}
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              {t("vendor.venueOnboarding.galleryHintPre")}{" "}
              <strong>{t("vendor.venueOnboarding.galleryHintBold")}</strong>{" "}
              {t("vendor.venueOnboarding.galleryHintPost")}
            </p>
          </div>

          {/* Photo grid */}
          {data.imageUrls.length > 0 && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {data.imageUrls.map((url, idx) => (
                <div key={url} className="relative aspect-[4/3] overflow-hidden rounded-lg border border-border/40">
                  <Image src={url} alt="" fill sizes="200px" className="object-cover" />
                  {idx === 0 && (
                    <div className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-gold px-2 py-0.5 text-[10px] font-bold text-[#0D0D0D]">
                      <Star className="h-3 w-3" /> {t("vendor.venueOnboarding.main")}
                    </div>
                  )}
                  <div className="absolute right-2 top-2 flex gap-1">
                    {idx !== 0 && (
                      <button
                        type="button"
                        onClick={() => setCoverPhoto(idx)}
                        className="rounded-full bg-black/60 p-1 text-white hover:bg-black"
                        title={t("vendor.venueOnboarding.setAsMain")}
                      >
                        <Star className="h-3 w-3" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => removePhoto(idx)}
                      className="rounded-full bg-black/60 p-1 text-white hover:bg-destructive"
                      title={t("common.delete")}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleImageUpload}
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || data.imageUrls.length >= 10}
            className="gap-2 w-full"
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            {data.imageUrls.length === 0
              ? t("vendor.venueOnboarding.uploadFirstImage")
              : t("vendor.venueOnboarding.addImages", {
                  count: data.imageUrls.length,
                })}
          </Button>
        </div>
      )}

      {/* Step 3: Extra */}
      {step === 3 && (
        <div className="space-y-4 rounded-xl border border-border/40 bg-card p-6">
          <div>
            <h2 className="font-heading text-lg font-bold">{t("vendor.venueOnboarding.extraDetails")}</h2>
            <p className="text-xs text-muted-foreground mt-1">
              {t("vendor.venueOnboarding.extraHint")}
            </p>
          </div>

          {/* Meniu PDF */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-gold" />
              {t("vendor.venueOnboarding.menuPdf")}
            </Label>
            {data.menuPdfUrl ? (
              <div className="flex items-center justify-between gap-2 rounded-lg border border-border/40 bg-muted/30 px-3 py-2 text-sm">
                <a href={data.menuPdfUrl} target="_blank" rel="noopener" className="text-gold hover:underline truncate">
                  📎 {data.menuPdfUrl.split("/").pop()}
                </a>
                <button
                  type="button"
                  onClick={() => update({ menuPdfUrl: "" })}
                  className="text-xs text-destructive hover:underline shrink-0"
                >
                  {t("common.delete")}
                </button>
              </div>
            ) : (
              <>
                <input
                  ref={menuInputRef}
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={handleMenuUpload}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => menuInputRef.current?.click()}
                  disabled={uploading}
                  className="gap-2"
                >
                  <Upload className="h-3.5 w-3.5" />
                  {t("vendor.venueOnboarding.uploadPdf")}
                </Button>
              </>
            )}
            <p className="text-[10px] text-muted-foreground">
              {t("vendor.venueOnboarding.menuUrlHint")}
            </p>
            <Input
              value={data.menuUrl}
              onChange={(e) => update({ menuUrl: e.target.value })}
              placeholder="https://restaurantul-tau.md/meniu"
              className="text-sm"
            />
          </div>

          {/* Virtual Tour */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <PlayCircle className="h-4 w-4 text-gold" />
              {t("vendor.venueOnboarding.virtualTourLink")}
            </Label>
            <Input
              value={data.virtualTourUrl}
              onChange={(e) => update({ virtualTourUrl: e.target.value })}
              placeholder="https://www.matterport.com/show/?m=..."
            />
            <p className="text-[10px] text-muted-foreground">
              {t("vendor.venueOnboarding.virtualTourHint")}
            </p>
          </div>

          {/* Website */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-gold" />
              {t("vendor.venueOnboarding.website")}
            </Label>
            <Input
              value={data.websiteUrl}
              onChange={(e) => update({ websiteUrl: e.target.value })}
              placeholder="https://restaurantul-tau.md"
            />
          </div>
        </div>
      )}

      {/* Step 4: Confirm */}
      {step === 4 && (
        <div className="space-y-4 rounded-xl border border-border/40 bg-card p-6">
          <h2 className="font-heading text-lg font-bold">{t("vendor.venueOnboarding.confirmData")}</h2>
          {data.imageUrls[0] && (
            <div className="relative aspect-[16/9] overflow-hidden rounded-xl border border-gold/30">
              <Image src={data.imageUrls[0]} alt={data.name} fill sizes="600px" className="object-cover" />
            </div>
          )}
          <div className="space-y-2 text-sm">
            <Row k={t("form.name")} v={data.name} />
            <Row k={t("form.phone")} v={data.phone} />
            <Row k={t("compare.row.city")} v={data.city} />
            <Row k={t("contactPage.address")} v={data.address} />
            <Row
              k={t("venue.capacity")}
              v={`${data.capacityMin} — ${data.capacityMax} ${t("common.guests")}`}
            />
            <Row
              k={t("vendor.venueOnboarding.images")}
              v={`${data.imageUrls.length} ${t("vendor.venueOnboarding.uploadedCount")}`}
            />
            {data.menuPdfUrl && (
              <Row
                k={t("vendor.venueOnboarding.menuPdfShort")}
                v={t("vendor.venueOnboarding.checkUploaded")}
              />
            )}
            {data.menuUrl && (
              <Row k={t("vendor.venueOnboarding.menuUrl")} v={data.menuUrl} />
            )}
            {data.virtualTourUrl && (
              <Row
                k={t("vendor.venueOnboarding.virtualTour")}
                v={t("vendor.venueOnboarding.checkAdded")}
              />
            )}
            {data.websiteUrl && (
              <Row k={t("vendor.venueOnboarding.website")} v={data.websiteUrl} />
            )}
          </div>
          {data.description && (
            <p className="rounded-lg bg-accent/50 p-3 text-sm text-muted-foreground">
              {data.description}
            </p>
          )}
          <div className="rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm text-warning">
            {t("vendor.venueOnboarding.afterSubmit")}
          </div>
        </div>
      )}

      <div className="mt-8 flex items-center justify-between">
        <Button
          variant="outline"
          disabled={step === 0}
          onClick={() => setStep(step - 1)}
          className="gap-2"
        >
          <ArrowLeft className="h-4 w-4" /> {t("common.back")}
        </Button>
        {step < STEP_LABEL_KEYS.length - 1 ? (
          <Button
            onClick={() => setStep(step + 1)}
            disabled={!canContinue()}
            className="gap-2 bg-gold text-[#0D0D0D] hover:bg-gold-dark"
          >
            {t("common.next")} <ArrowRight className="h-4 w-4" />
          </Button>
        ) : (
          <>
          <div className="mb-4">
            <ESignature
              subjectType="venue"
              onChange={setSignature}
            />
          </div>
          <Button
            onClick={handleSubmit}
            disabled={submitting || !signature?.accepted}
            className="gap-2 bg-gold text-[#0D0D0D] hover:bg-gold-dark"
          >
            {submitting ? (
              t("vendor.venueOnboarding.sending")
            ) : (
              <>
                <CheckCircle className="h-4 w-4" /> {t("vendor.venueOnboarding.sendForApproval")}
              </>
            )}
          </Button>
          </>
        )}
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{k}:</span>
      <span className="font-medium text-right">{v}</span>
    </div>
  );
}
