"use client";

import { useState, useEffect } from "react";
import { useUser, useClerk } from "@clerk/nextjs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  User,
  Mail,
  Calendar,
  Camera,
  Lock,
  Save,
  Loader2,
  LogOut,
  ExternalLink,
  Phone,
  Pencil,
  Check,
  X,
  Settings as SettingsIcon,
  Shield as ShieldIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useLocale } from "@/hooks/use-locale";

export default function ProfilePage() {
  const { t } = useLocale();
  const { user, isLoaded } = useUser();
  const { signOut, openUserProfile } = useClerk();
  const [firstName, setFirstName] = useState(user?.firstName || "");
  const [lastName, setLastName] = useState(user?.lastName || "");
  const [saving, setSaving] = useState(false);

  // Phone editing
  const [editingPhone, setEditingPhone] = useState(false);
  const [phoneValue, setPhoneValue] = useState("");
  const [savingPhone, setSavingPhone] = useState(false);
  const [dbPhone, setDbPhone] = useState<string | null>(null);

  // Email editing
  const [editingEmail, setEditingEmail] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [emailOtpSent, setEmailOtpSent] = useState(false);
  const [emailOtp, setEmailOtp] = useState("");
  const [_emailResource, setEmailResource] = useState<ReturnType<
    NonNullable<typeof user>["createEmailAddress"]
  > | null>(null);
  const [savingEmail, setSavingEmail] = useState(false);

  // Sync phone from Clerk user. Picks any phone (verified preferred) so a
  // half-finished previous attempt doesn't ghost the new save.
  useEffect(() => {
    if (user) {
      setFirstName(user.firstName || "");
      setLastName(user.lastName || "");
      const anyPhone =
        user.primaryPhoneNumber?.phoneNumber ||
        user.phoneNumbers.find((p) => p.verification?.status === "verified")?.phoneNumber ||
        user.phoneNumbers[0]?.phoneNumber ||
        "";
      setPhoneValue(anyPhone);
    }
  }, [user]);

  // Google/email sign-ups store the onboarding phone in our app database,
  // even when Clerk has no phone object. Load that canonical contact so the
  // profile and booking flow do not incorrectly claim the number is missing.
  useEffect(() => {
    if (!user) return;
    let active = true;
    void fetch("/api/me/phone", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!active || !data) return;
        const phone = typeof data.phone === "string" ? data.phone : null;
        setDbPhone(phone);
        if (phone && user.phoneNumbers.length === 0) setPhoneValue(phone);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [user]);

  async function handleSave() {
    if (!user) return;
    setSaving(true);
    try {
      await user.update({ firstName, lastName });
      toast.success(t("cabinet.profile.toastProfileUpdated"));
    } catch {
      toast.error(t("cabinet.profile.toastSaveError"));
    } finally {
      setSaving(false);
    }
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    try {
      await user.setProfileImage({ file });
      toast.success(t("cabinet.profile.toastPhotoUpdated"));
    } catch {
      toast.error(t("cabinet.profile.toastUploadError"));
    }
  }

  // Phone: add or update
  async function handleSavePhone() {
    if (!user || !phoneValue.trim()) return;
    setSavingPhone(true);
    try {
      const existing = user.phoneNumbers;
      if (existing.length > 0) {
        // Remove old, add new
        for (const ph of existing) {
          await ph.destroy();
        }
      }
      const created = await user.createPhoneNumber({ phoneNumber: phoneValue.trim() });
      // Prepare verification
      await created.prepareVerification();
      toast.success(t("cabinet.profile.toastSmsSent"));
      // Force-refresh the local user so the UI flips from "Nu ai adăugat"
      // to "Modifică" immediately, even before verification finishes.
      await user.reload();
      setEditingPhone(false);
      openUserProfile();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t("cabinet.profile.toastPhoneSaveError");
      toast.error(message);
    } finally {
      setSavingPhone(false);
    }
  }

  // Email: start OTP flow
  async function handleStartEmailChange() {
    if (!user || !newEmail.trim()) return;
    setSavingEmail(true);
    try {
      const created = await user.createEmailAddress({ email: newEmail.trim() });
      await created.prepareVerification({ strategy: "email_code" });
      setEmailResource(Promise.resolve(created) as never);
      setEmailOtpSent(true);
      toast.success(t("cabinet.profile.toastEmailCodeSent"));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t("cabinet.profile.toastCodeSendError");
      toast.error(message);
    } finally {
      setSavingEmail(false);
    }
  }

  // Email: verify OTP and set as primary
  async function handleVerifyEmail() {
    if (!user || !emailOtp.trim()) return;
    setSavingEmail(true);
    try {
      // Find the unverified email we just created
      const unverified = user.emailAddresses.find(
        (e) => e.emailAddress === newEmail.trim() && e.verification?.status !== "verified",
      );
      if (!unverified) {
        toast.error(t("cabinet.profile.toastEmailNotFound"));
        return;
      }
      await unverified.attemptVerification({ code: emailOtp.trim() });
      // Set as primary
      await user.update({ primaryEmailAddressId: unverified.id });
      toast.success(t("cabinet.profile.toastEmailChanged"));
      setEditingEmail(false);
      setEmailOtpSent(false);
      setNewEmail("");
      setEmailOtp("");
      setEmailResource(null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t("cabinet.profile.toastCodeInvalid");
      toast.error(message);
    } finally {
      setSavingEmail(false);
    }
  }

  if (!isLoaded) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-gold" />
      </div>
    );
  }

  // Treat ANY phone on the Clerk user as "current" — not just the primary
  // one. Without this, users with an unverified phone left over from a
  // previous attempt would see "Nu ai adăugat" + an "Adaugă" button, but
  // any new phone they tried to save would fail with "phone already
  // exists" because Clerk still tracks the unverified leftover. Picking
  // the verified one first if available keeps the displayed value sane.
  const currentPhone = (() => {
    if (!user) return undefined;
    if (user.primaryPhoneNumber?.phoneNumber) return user.primaryPhoneNumber.phoneNumber;
    const verified = user.phoneNumbers.find(
      (p) => p.verification?.status === "verified",
    );
    if (verified) return verified.phoneNumber;
    return user.phoneNumbers[0]?.phoneNumber || dbPhone || undefined;
  })();
  const currentEmail = user?.primaryEmailAddress?.emailAddress;

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-heading text-2xl font-bold mb-1">{t("cabinet.profile.title")}</h1>
      <p className="text-sm text-muted-foreground mb-6">
        {t("cabinet.profile.subtitle")}
      </p>

      {/* Profile photo + basic info */}
      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="text-lg font-heading">{t("cabinet.profile.cardProfile")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Photo */}
          <div className="flex items-center gap-5">
            <div className="relative group">
              {user?.imageUrl ? (
                <img
                  src={user.imageUrl}
                  alt=""
                  className="h-20 w-20 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gold/10">
                  <User className="h-10 w-10 text-gold" />
                </div>
              )}
              <label className="absolute inset-0 flex cursor-pointer items-center justify-center rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity">
                <Camera className="h-5 w-5 text-white" />
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handlePhotoUpload}
                />
              </label>
            </div>
            <div>
              <p className="text-lg font-semibold">
                {user?.fullName || t("cabinet.profile.anonymousUser")}
              </p>
              <p className="text-sm text-muted-foreground flex items-center gap-1">
                <Mail className="h-3.5 w-3.5" />
                {currentEmail}
              </p>
              {currentPhone && (
                <p className="text-sm text-muted-foreground flex items-center gap-1 mt-0.5">
                  <Phone className="h-3.5 w-3.5" />
                  {currentPhone}
                </p>
              )}
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                <Calendar className="h-3 w-3" />
                {t("cabinet.profile.memberSince")}{" "}
                {user?.createdAt
                  ? new Date(user.createdAt).toLocaleDateString("ro-MD")
                  : "—"}
              </p>
            </div>
          </div>

          {/* Name fields */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="firstName">{t("cabinet.profile.firstName")}</Label>
              <Input
                id="firstName"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder={t("cabinet.profile.firstNamePlaceholder")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">{t("cabinet.profile.lastName")}</Label>
              <Input
                id="lastName"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder={t("cabinet.profile.lastNamePlaceholder")}
              />
            </div>
          </div>

          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-gold text-[#0D0D0D] hover:bg-gold-dark"
          >
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            {t("cabinet.profile.saveChanges")}
          </Button>
        </CardContent>
      </Card>

      {/* Phone Number */}
      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="text-lg font-heading flex items-center gap-2">
            <Phone className="h-4 w-4 text-gold" />
            {t("cabinet.profile.cardPhone")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!editingPhone ? (
            <div className="flex items-center justify-between">
              <div>
                {currentPhone ? (
                  <p className="text-sm font-medium">{currentPhone}</p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {t("cabinet.profile.noPhone")}
                  </p>
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="gap-1"
                onClick={() => {
                  setPhoneValue(currentPhone || "");
                  setEditingPhone(true);
                }}
              >
                <Pencil className="h-3.5 w-3.5" />
                {currentPhone ? t("cabinet.profile.edit") : t("cabinet.profile.add")}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="phone">{t("cabinet.profile.phoneNumber")}</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={phoneValue}
                  onChange={(e) => setPhoneValue(e.target.value)}
                  placeholder="+373 69 123 456"
                />
                <p className="text-xs text-muted-foreground">
                  {t("cabinet.profile.phoneHint")}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="gap-1 bg-gold text-[#0D0D0D] hover:bg-gold-dark"
                  onClick={handleSavePhone}
                  disabled={savingPhone || !phoneValue.trim()}
                >
                  {savingPhone ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="h-3.5 w-3.5" />
                  )}
                  {t("cabinet.profile.save")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1"
                  onClick={() => setEditingPhone(false)}
                >
                  <X className="h-3.5 w-3.5" /> {t("cabinet.profile.cancel")}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Email */}
      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="text-lg font-heading flex items-center gap-2">
            <Mail className="h-4 w-4 text-gold" />
            {t("cabinet.profile.cardEmail")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!editingEmail ? (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{currentEmail}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t("cabinet.profile.primaryEmail")}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="gap-1"
                onClick={() => {
                  setNewEmail("");
                  setEmailOtp("");
                  setEmailOtpSent(false);
                  setEditingEmail(true);
                }}
              >
                <Pencil className="h-3.5 w-3.5" /> {t("cabinet.profile.edit")}
              </Button>
            </div>
          ) : !emailOtpSent ? (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="newEmail">{t("cabinet.profile.newEmail")}</Label>
                <Input
                  id="newEmail"
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="noul-tau@email.com"
                />
                <p className="text-xs text-muted-foreground">
                  {t("cabinet.profile.newEmailHint")}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="gap-1 bg-gold text-[#0D0D0D] hover:bg-gold-dark"
                  onClick={handleStartEmailChange}
                  disabled={savingEmail || !newEmail.trim()}
                >
                  {savingEmail ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Mail className="h-3.5 w-3.5" />
                  )}
                  {t("cabinet.profile.sendCode")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1"
                  onClick={() => setEditingEmail(false)}
                >
                  <X className="h-3.5 w-3.5" /> {t("cabinet.profile.cancel")}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="rounded-lg bg-gold/5 border border-gold/20 p-3 text-sm">
                <p>
                  {t("cabinet.profile.codeSentTo")}{" "}
                  <span className="font-medium text-gold">{newEmail}</span>
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="otp">{t("cabinet.profile.verificationCode")}</Label>
                <Input
                  id="otp"
                  value={emailOtp}
                  onChange={(e) => setEmailOtp(e.target.value)}
                  placeholder="123456"
                  maxLength={6}
                />
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="gap-1 bg-gold text-[#0D0D0D] hover:bg-gold-dark"
                  onClick={handleVerifyEmail}
                  disabled={savingEmail || !emailOtp.trim()}
                >
                  {savingEmail ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="h-3.5 w-3.5" />
                  )}
                  {t("cabinet.profile.verifyAndChange")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1"
                  onClick={() => {
                    setEditingEmail(false);
                    setEmailOtpSent(false);
                  }}
                >
                  <X className="h-3.5 w-3.5" /> {t("cabinet.profile.cancel")}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Security */}
      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="text-lg font-heading flex items-center gap-2">
            <Lock className="h-4 w-4 text-gold" />
            {t("cabinet.profile.cardSecurity")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {t("cabinet.profile.securityText")}
          </p>
          <Button
            variant="outline"
            onClick={() => openUserProfile()}
            className="gap-2"
          >
            <ExternalLink className="h-4 w-4" />
            {t("cabinet.profile.openSecurity")}
          </Button>
        </CardContent>
      </Card>

      {/* Account quick-access — Setări and Confidențialitate used to be
          standalone sidebar items. Surfacing them here as cards keeps the
          sidebar focused on event tools while preserving easy access. */}
      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <a href="/cabinet/setari" className="block">
          <Card className="h-full cursor-pointer transition-all hover:border-gold/40 hover:bg-card/80">
            <CardContent className="flex items-start gap-3 p-5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gold/10 text-gold">
                <SettingsIcon className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-heading font-bold text-sm">{t("cabinet.profile.settingsCard")}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t("cabinet.profile.settingsCardHint")}
                </p>
              </div>
            </CardContent>
          </Card>
        </a>
        <a href="/cabinet/date" className="block">
          <Card className="h-full cursor-pointer transition-all hover:border-gold/40 hover:bg-card/80">
            <CardContent className="flex items-start gap-3 p-5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gold/10 text-gold">
                <ShieldIcon className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-heading font-bold text-sm">{t("cabinet.profile.privacyCard")}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t("cabinet.profile.privacyCardHint")}
                </p>
              </div>
            </CardContent>
          </Card>
        </a>
      </div>

      {/* Danger zone */}
      <Card className="border-destructive/20">
        <CardHeader>
          <CardTitle className="text-lg font-heading flex items-center gap-2 text-destructive">
            <LogOut className="h-4 w-4" />
            {t("cabinet.profile.cardSession")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            onClick={() => signOut({ redirectUrl: "/" })}
            className="border-destructive/30 text-destructive hover:bg-destructive hover:text-destructive-foreground"
          >
            <LogOut className="mr-2 h-4 w-4" />
            {t("cabinet.profile.signOut")}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
