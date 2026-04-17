"use client";

import { useState } from "react";
import { useUser, useClerk } from "@clerk/nextjs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { User, Mail, Calendar, Camera, Lock, Save, Loader2, LogOut, ExternalLink } from "lucide-react";
import { toast } from "sonner";

export default function ProfilePage() {
  const { user, isLoaded } = useUser();
  const { signOut, openUserProfile } = useClerk();
  const [firstName, setFirstName] = useState(user?.firstName || "");
  const [lastName, setLastName] = useState(user?.lastName || "");
  const [saving, setSaving] = useState(false);

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

  if (!isLoaded) {
    return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-gold" /></div>;
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-heading text-2xl font-bold mb-1">Contul Meu</h1>
      <p className="text-sm text-muted-foreground mb-6">Gestionează profilul și setările contului</p>

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
                <img src={user.imageUrl} alt="" className="h-20 w-20 rounded-full object-cover" />
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gold/10">
                  <User className="h-10 w-10 text-gold" />
                </div>
              )}
              <label className="absolute inset-0 flex cursor-pointer items-center justify-center rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity">
                <Camera className="h-5 w-5 text-white" />
                <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
              </label>
            </div>
            <div>
              <p className="text-lg font-semibold">{user?.fullName || "Utilizator"}</p>
              <p className="text-sm text-muted-foreground flex items-center gap-1">
                <Mail className="h-3.5 w-3.5" />
                {user?.primaryEmailAddress?.emailAddress}
              </p>
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                <Calendar className="h-3 w-3" />
                Membru din {user?.createdAt ? new Date(user.createdAt).toLocaleDateString("ro-MD") : "—"}
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
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Salvează modificările
          </Button>
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
