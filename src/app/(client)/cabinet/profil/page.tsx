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
} from "lucide-react";
import { toast } from "sonner";

export default function ProfilePage() {
  const { user, isLoaded } = useUser();
  const { signOut, openUserProfile } = useClerk();
  const [firstName, setFirstName] = useState(user?.firstName || "");
  const [lastName, setLastName] = useState(user?.lastName || "");
  const [saving, setSaving] = useState(false);

  // Phone editing
  const [editingPhone, setEditingPhone] = useState(false);
  const [phoneValue, setPhoneValue] = useState("");
  const [savingPhone, setSavingPhone] = useState(false);

  // Email editing
  const [editingEmail, setEditingEmail] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [emailOtpSent, setEmailOtpSent] = useState(false);
  const [emailOtp, setEmailOtp] = useState("");
  const [emailResource, setEmailResource] = useState<ReturnType<
    NonNullable<typeof user>["createEmailAddress"]
  > | null>(null);
  const [savingEmail, setSavingEmail] = useState(false);

  // Sync phone from Clerk user
  useEffect(() => {
    if (user) {
      setFirstName(user.firstName || "");
      setLastName(user.lastName || "");
      setPhoneValue(user.primaryPhoneNumber?.phoneNumber || "");
    }
  }, [user]);

  async function handleSave() {
    if (!user) return;
    setSaving(true);
    try {
      await user.update({ firstName, lastName });
      toast.success("Profil actualizat!");
    } catch {
      toast.error("Eroare la salvare.");
    } finally {
      setSaving(false);
    }
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    try {
      await user.setProfileImage({ file });
      toast.success("Fotografie actualizată!");
    } catch {
      toast.error("Eroare la încărcare.");
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
      toast.success(
        "Cod de verificare trimis prin SMS. Verifică telefonul.",
      );
      // For simplicity, open Clerk profile for phone verification
      setEditingPhone(false);
      openUserProfile();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Eroare la salvare telefon.";
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
      toast.success("Cod de verificare trimis la noul email.");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Eroare la trimiterea codului.";
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
        toast.error("Email-ul nu a fost găsit. Încearcă din nou.");
        return;
      }
      await unverified.attemptVerification({ code: emailOtp.trim() });
      // Set as primary
      await user.update({ primaryEmailAddressId: unverified.id });
      toast.success("Email-ul a fost schimbat cu succes!");
      setEditingEmail(false);
      setEmailOtpSent(false);
      setNewEmail("");
      setEmailOtp("");
      setEmailResource(null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Cod incorect sau expirat.";
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

  const currentPhone = user?.primaryPhoneNumber?.phoneNumber;
  const currentEmail = user?.primaryEmailAddress?.emailAddress;

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-heading text-2xl font-bold mb-1">Contul Meu</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Gestionează profilul și setările contului
      </p>

      {/* Profile photo + basic info */}
      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="text-lg font-heading">Profil</CardTitle>
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
                {user?.fullName || "Utilizator"}
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
                Membru din{" "}
                {user?.createdAt
                  ? new Date(user.createdAt).toLocaleDateString("ro-MD")
                  : "—"}
              </p>
            </div>
          </div>

          {/* Name fields */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="firstName">Prenume</Label>
              <Input
                id="firstName"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Prenumele tău"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Nume</Label>
              <Input
                id="lastName"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Numele tău"
              />
            </div>
          </div>

          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-gold text-background hover:bg-gold-dark"
          >
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Salvează modificările
          </Button>
        </CardContent>
      </Card>

      {/* Phone Number */}
      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="text-lg font-heading flex items-center gap-2">
            <Phone className="h-4 w-4 text-gold" />
            Telefon
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
                    Nu ai adăugat un număr de telefon.
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
                {currentPhone ? "Modifică" : "Adaugă"}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="phone">Număr de telefon</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={phoneValue}
                  onChange={(e) => setPhoneValue(e.target.value)}
                  placeholder="+373 69 123 456"
                />
                <p className="text-xs text-muted-foreground">
                  Include prefixul țării (ex: +373). Vei primi un SMS de verificare.
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="gap-1 bg-gold text-background hover:bg-gold-dark"
                  onClick={handleSavePhone}
                  disabled={savingPhone || !phoneValue.trim()}
                >
                  {savingPhone ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="h-3.5 w-3.5" />
                  )}
                  Salvează
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1"
                  onClick={() => setEditingPhone(false)}
                >
                  <X className="h-3.5 w-3.5" /> Anulează
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
            Email
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!editingEmail ? (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{currentEmail}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Email principal al contului
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
                <Pencil className="h-3.5 w-3.5" /> Modifică
              </Button>
            </div>
          ) : !emailOtpSent ? (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="newEmail">Email nou</Label>
                <Input
                  id="newEmail"
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="noul-tau@email.com"
                />
                <p className="text-xs text-muted-foreground">
                  Vei primi un cod de verificare (OTP) pe noul email.
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="gap-1 bg-gold text-background hover:bg-gold-dark"
                  onClick={handleStartEmailChange}
                  disabled={savingEmail || !newEmail.trim()}
                >
                  {savingEmail ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Mail className="h-3.5 w-3.5" />
                  )}
                  Trimite codul
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1"
                  onClick={() => setEditingEmail(false)}
                >
                  <X className="h-3.5 w-3.5" /> Anulează
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="rounded-lg bg-gold/5 border border-gold/20 p-3 text-sm">
                <p>
                  Am trimis un cod de verificare la{" "}
                  <span className="font-medium text-gold">{newEmail}</span>
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="otp">Codul de verificare</Label>
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
                  className="gap-1 bg-gold text-background hover:bg-gold-dark"
                  onClick={handleVerifyEmail}
                  disabled={savingEmail || !emailOtp.trim()}
                >
                  {savingEmail ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="h-3.5 w-3.5" />
                  )}
                  Verifică & Schimbă
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
                  <X className="h-3.5 w-3.5" /> Anulează
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
            Securitate
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Gestionează parola, autentificarea în doi pași și sesiunile active.
          </p>
          <Button
            variant="outline"
            onClick={() => openUserProfile()}
            className="gap-2"
          >
            <ExternalLink className="h-4 w-4" />
            Deschide setări securitate
          </Button>
        </CardContent>
      </Card>

      {/* Danger zone */}
      <Card className="border-destructive/20">
        <CardHeader>
          <CardTitle className="text-lg font-heading flex items-center gap-2 text-destructive">
            <LogOut className="h-4 w-4" />
            Sesiune
          </CardTitle>
        </CardHeader>
        <CardContent className="flex gap-3">
          <Button
            variant="outline"
            onClick={() => signOut({ redirectUrl: "/" })}
            className="border-destructive/30 text-destructive hover:bg-destructive hover:text-destructive-foreground"
          >
            <LogOut className="mr-2 h-4 w-4" />
            Deconectare
          </Button>
          <a href="/cabinet/date">
            <Button variant="ghost" className="text-xs text-muted-foreground">
              Ștergere cont & Date GDPR
            </Button>
          </a>
        </CardContent>
      </Card>
    </div>
  );
}
