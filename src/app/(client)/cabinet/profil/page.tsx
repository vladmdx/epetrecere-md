"use client";

import { useUser } from "@clerk/nextjs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { User, Mail, Calendar } from "lucide-react";

export default function ProfilePage() {
  const { user } = useUser();

  return (
    <div>
      <h1 className="font-heading text-2xl font-bold mb-1">Contul Meu</h1>
      <p className="text-sm text-muted-foreground mb-6">Informațiile contului tău</p>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-heading">Profil</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            {user?.imageUrl ? (
              <img src={user.imageUrl} alt="" className="h-16 w-16 rounded-full" />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gold/10">
                <User className="h-8 w-8 text-gold" />
              </div>
            )}
            <div>
              <p className="text-lg font-semibold">{user?.fullName || "Utilizator"}</p>
              <p className="text-sm text-muted-foreground flex items-center gap-1">
                <Mail className="h-3.5 w-3.5" />
                {user?.primaryEmailAddress?.emailAddress}
              </p>
            </div>
          </div>

          <div className="rounded-lg bg-accent/30 p-4 text-sm text-muted-foreground">
            <p className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Membru din {user?.createdAt ? new Date(user.createdAt).toLocaleDateString("ro-MD") : "—"}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
