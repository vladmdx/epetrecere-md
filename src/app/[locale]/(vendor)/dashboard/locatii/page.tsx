import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { eq, inArray } from "drizzle-orm";
import { Plus, Building2, MapPin } from "lucide-react";
import { db } from "@/lib/db";
import { users, venueHalls } from "@/lib/db/schema";
import { venueReviewLabel } from "@/lib/partner/onboarding-feedback";
import {
  listAccessibleOrganizations,
  listAccessibleVenues,
} from "@/lib/venue-access";
import { DEFAULT_LOCALE, isLocale, localizePath } from "@/lib/i18n/routing";
import Link from "@/components/shared/locale-link";
import { Card, CardContent } from "@/components/ui/card";
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

  if (venues.length === 0 && organizations.length === 0) {
    redirect(localizePath("/dashboard/venue-onboarding", locale));
  }
  const hallStates = venues.length ? await db
    .select({ venueId: venueHalls.venueId, status: venueHalls.status })
    .from(venueHalls)
    .where(inArray(venueHalls.venueId, venues.map((venue) => venue.id))) : [];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold">Localuri</h1>
          <p className="text-sm text-muted-foreground">
            Alege localul pe care vrei să-l gestionezi.
          </p>
        </div>
        <Link
          href={
            organizations.length === 1
              ? `/dashboard/venue-onboarding?intent=create&organizationId=${organizations[0].id}`
              : "/dashboard/venue-onboarding?intent=create"
          }
          className="inline-flex h-8 items-center rounded-lg bg-gold px-2.5 text-sm font-medium text-[#0D0D0D] hover:bg-gold-dark"
        >
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
        <div className="grid grid-cols-1 gap-3">
          {venues.map((venue) => (
            <Link
              key={venue.id}
              href={`/dashboard/locatii/${venue.id}`}
              className="block min-w-0"
            >
              <Card className="transition-colors hover:ring-gold/40">
                <CardContent className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 p-4 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
                  <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-gold/10 text-gold">
                    <Building2 className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{venue.nameRo}</p>
                    <p className="flex items-start gap-1 text-xs text-muted-foreground">
                      <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
                      <span className="min-w-0 break-words">{[venue.city, venue.address].filter(Boolean).join(" · ") || "Fără adresă"}</span>
                    </p>
                  </div>
                  <span className="col-start-2 justify-self-start rounded-full bg-accent px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground sm:col-start-3">
                    {venueReviewLabel(venue.isActive, hallStates.filter((hall) => hall.venueId === venue.id).map((hall) => hall.status))}
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
