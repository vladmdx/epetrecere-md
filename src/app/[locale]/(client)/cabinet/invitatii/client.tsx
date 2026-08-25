"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import {
  Plus,
  Calendar,
  Users,
  ExternalLink,
  Edit,
  Trash2,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useLocale } from "@/hooks/use-locale";

interface Invitation {
  id: number;
  slug: string;
  status: "draft" | "published" | "closed";
  eventType: string | null;
  coupleNames: string | null;
  hostName: string | null;
  eventDate: string | null;
  createdAt: string;
}

const statusStyles: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  published: "bg-success/15 text-success",
  closed: "bg-warning/15 text-warning",
};

const statusKeys: Record<string, string> = {
  draft: "cabinet.invitations.statusDraft",
  published: "cabinet.invitations.statusPublished",
  closed: "cabinet.invitations.statusClosed",
};

export function InvitationsListClient() {
  const { t } = useLocale();
  const { isLoaded, isSignedIn } = useUser();
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    fetch("/api/invitations")
      .then((r) => (r.ok ? r.json() : []))
      .then(setInvitations)
      .catch(() => setInvitations([]))
      .finally(() => setLoading(false));
  }, [isLoaded, isSignedIn]);

  async function handleDelete(id: number) {
    if (!confirm(t("cabinet.invitations.confirmDelete"))) return;
    const res = await fetch(`/api/invitations/${id}`, { method: "DELETE" });
    if (res.ok) {
      setInvitations((prev) => prev.filter((i) => i.id !== id));
    }
  }

  if (!isLoaded || loading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-12 lg:px-8">
        <Loader2 className="mx-auto h-6 w-6 animate-spin text-gold" />
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center lg:px-8">
        <h1 className="font-heading text-2xl font-bold">
          {t("cabinet.invitations.signInTitle")}
        </h1>
        <p className="mt-2 text-muted-foreground">
          {t("cabinet.invitations.signInBody")}
        </p>
        <Link
          href="/sign-in?redirect_url=/cabinet/invitatii"
          className="mt-6 inline-flex items-center justify-center rounded-lg bg-gold px-4 py-2 text-sm font-medium text-[#0D0D0D] hover:bg-gold-dark"
        >
          {t("cabinet.invitations.signInCta")}
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-12 lg:px-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold md:text-3xl">
            {t("cabinet.invitations.title")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {invitations.length === 0
              ? t("cabinet.invitations.empty")
              : t("cabinet.invitations.count", { count: invitations.length })}
          </p>
        </div>
        <Link
          href="/cabinet/invitatii/nou"
          className="inline-flex items-center gap-2 rounded-lg bg-gold px-4 py-2 text-sm font-medium text-[#0D0D0D] hover:bg-gold-dark"
        >
          <Plus className="h-4 w-4" /> {t("cabinet.invitations.create")}
        </Link>
      </div>

      {invitations.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-dashed border-border/40 p-12 text-center">
          <p className="text-muted-foreground">
            {t("cabinet.invitations.emptyHint")}
          </p>
          <Link
            href="/cabinet/invitatii/nou"
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-gold px-4 py-2 text-sm font-medium text-[#0D0D0D] hover:bg-gold-dark"
          >
            <Plus className="h-4 w-4" /> {t("cabinet.invitations.startNow")}
          </Link>
        </div>
      ) : (
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {invitations.map((inv) => (
            <Card key={inv.id}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate font-heading font-bold">
                      {inv.coupleNames ||
                        inv.hostName ||
                        t("cabinet.invitations.untitled")}
                    </h3>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      {inv.eventDate && (
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" /> {inv.eventDate}
                        </span>
                      )}
                      <Badge className={statusStyles[inv.status]}>
                        {t(statusKeys[inv.status])}
                      </Badge>
                    </div>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link
                    href={`/cabinet/invitatii/${inv.id}`}
                    className="inline-flex items-center gap-1 rounded-md border border-border/60 px-3 py-1.5 text-xs font-medium hover:bg-muted"
                  >
                    <Edit className="h-3 w-3" /> {t("common.edit")}
                  </Link>
                  <Link
                    href={`/cabinet/invitatii/${inv.id}#guests`}
                    className="inline-flex items-center gap-1 rounded-md border border-border/60 px-3 py-1.5 text-xs font-medium hover:bg-muted"
                  >
                    <Users className="h-3 w-3" /> {t("cabinet.invitations.guests")}
                  </Link>
                  {inv.status === "published" && (
                    <Link
                      href={`/i/${inv.slug}`}
                      target="_blank"
                      rel="noopener"
                      className="inline-flex items-center gap-1 rounded-md border border-border/60 px-3 py-1.5 text-xs font-medium hover:bg-muted"
                    >
                      <ExternalLink className="h-3 w-3" /> {t("cabinet.common.view")}
                    </Link>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDelete(inv.id)}
                    className="gap-1 text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
