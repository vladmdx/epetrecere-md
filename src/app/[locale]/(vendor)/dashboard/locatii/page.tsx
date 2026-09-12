import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { Plus, Building2, MapPin } from "lucide-react";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import {
  listAccessibleOrganizations,
  listAccessibleVenues,
} from "@/lib/venue-access";
import { DEFAULT_LOCALE, isLocale, localizePath } from "@/lib/i18n/routing";
import Link from "@/components/shared/locale-link";
import { Card, CardContent } from "@/components/ui/card";
import { writeLastVenueCookie } from "@/lib/venues/last-selected";
import { salaUsesLegacyLayout } from "@/lib/partner/multi-hall-gate";

export const dynamic = "force-dynamic";

export default async function LocatiiPickerPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  const locale = isLocale(raw) ? raw : DEFAULT_LOCALE;
  if (salaUsesLegacyLayout()) {
    redirect(localizePath("/dashboard/sala", locale));
  }
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    redirect(
      `${localizePath("/sign-in", locale)}?redirect_url=${encodeURIComponent(localizePath("/dashboard/locatii", locale))}`,
    );
  }
  const [appUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);
  if (!appUser) redirect(localizePath("/", locale));

  const [venues, organizations] = await Promise.all([
    listAccessibleVenues(appUser.id),
    listAccessibleOrganizations(appUser.id),
  ]);

  if (venues.length === 1) {
    await writeLastVenueCookie(venues[0].id);
    redirect(localizePath(`/dashboard/locatii/${venues[0].id}`, locale));
  }

  if (venues.length === 0 && organizations.length === 0) {
    redirect(localizePath("/dashboard/venue-onboarding", locale));
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold">Localuri</h1>
          <p className="text-sm text-muted-foreground">
            Alege un local. Autorizarea se face la fiecare cerere; această listă nu este un token.
          </p>
        </div>
        <Link href="/dashboard/venue-onboarding?intent=create" className="inline-flex h-8 items-center rounded-lg bg-gold px-2.5 text-sm font-medium text-[#0D0D0D] hover:bg-gold-dark">
          <Plus className="mr-1.5 h-4 w-4" />
          Adaugă local
        </Link>
      </div>

      {venues.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Nu ai încă un local. Completează onboardingul sau adaugă unul la organizație.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {venues.map((venue) => (
            <Link
              key={venue.id}
              href={`/dashboard/locatii/${venue.id}`}
              className="block"
            >
              <Card className="transition-colors hover:ring-gold/40">
                <CardContent className="flex items-center gap-4 p-4">
                  <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-gold/10 text-gold">
                    <Building2 className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{venue.nameRo}</p>
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="h-3 w-3" />
                      {[venue.city, venue.address].filter(Boolean).join(" · ") || "Fără adresă"}
                    </p>
                  </div>
                  <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                    {venue.isActive ? "activ" : "draft"}
                  </span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {organizations.length > 0 && (
        <p className="text-sm text-muted-foreground">
          <Link href="/dashboard/organizatie" className="text-gold hover:underline">
            Deschide organizația
          </Link>
        </p>
      )}
    </div>
  );
}
