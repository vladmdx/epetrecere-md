"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  CheckCircle,
  XCircle,
  Music,
  Building2,
  Loader2,
  Eye,
  Phone,
  Mail,
  MapPin,
  Calendar,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useLocale } from "@/hooks/use-locale";

interface RegistrationRequest {
  id: number;
  type: "artist" | "venue";
  name: string;
  email: string | null;
  phone: string | null;
  location: string | null;
  description: string | null;
  categoryName: string | null;
  capacity: string | null;
  photoUrl: string | null;
  createdAt: string;
  userId: string | null;
  userName: string | null;
  userEmail: string | null;
}

export default function RegistrationRequestsPage() {
  const { t } = useLocale();
  const [requests, setRequests] = useState<RegistrationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<number | null>(null);
  const [filter, setFilter] = useState<"all" | "artist" | "venue">("all");

  async function loadRequests() {
    try {
      const res = await fetch("/api/admin/registration-requests");
      if (!res.ok) throw new Error();
      const data = await res.json();
      setRequests(data);
    } catch {
      toast.error(t("adminUi.registrations.toastLoadError"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRequests();
  }, []);

  async function handleAction(id: number, type: "artist" | "venue", action: "approve" | "reject") {
    setProcessing(id);
    try {
      const res = await fetch("/api/admin/registration-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, type, action }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || t("adminUi.registrations.genericError"));
      }
      toast.success(action === "approve" ? t("adminUi.registrations.toastApproved") : t("adminUi.registrations.toastRejected"));
      setRequests((prev) => prev.filter((r) => !(r.id === id && r.type === type)));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("adminUi.registrations.toastProcessError"));
    } finally {
      setProcessing(null);
    }
  }

  const filtered = filter === "all" ? requests : requests.filter((r) => r.type === filter);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-gold" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">{t("adminUi.registrations.title")}</h1>
        <p className="text-muted-foreground">
          {t("adminUi.registrations.subtitle", { count: requests.length })}
        </p>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        {(["all", "artist", "venue"] as const).map((f) => (
          <Button
            key={f}
            variant={filter === f ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(f)}
            className={cn(filter === f && "bg-gold text-[#0D0D0D] hover:bg-gold-dark")}
          >
            {f === "all" ? t("common.all") : f === "artist" ? t("adminUi.registrations.tabArtists") : t("adminUi.registrations.tabVenues")}
            {f === "all"
              ? ` (${requests.length})`
              : ` (${requests.filter((r) => r.type === f).length})`}
          </Button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <CheckCircle className="mb-3 h-12 w-12 text-green-500/50" />
            <p className="text-lg font-medium">{t("adminUi.registrations.emptyTitle")}</p>
            <p className="text-sm text-muted-foreground">
              {t("adminUi.registrations.emptyBody")}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((req) => (
            <Card key={`${req.type}-${req.id}`} className="overflow-hidden">
              <CardContent className="p-0">
                <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between">
                  {/* Info */}
                  <div className="flex gap-4">
                    {req.photoUrl ? (

                      <img
                        src={req.photoUrl}
                        alt={req.name}
                        className={cn(
                          "h-14 w-14 shrink-0 rounded-full object-cover ring-2",
                          req.type === "artist"
                            ? "ring-purple-500/30"
                            : "ring-blue-500/30",
                        )}
                      />
                    ) : (
                      <div
                        className={cn(
                          "flex h-14 w-14 shrink-0 items-center justify-center rounded-full",
                          req.type === "artist"
                            ? "bg-purple-500/10 text-purple-400"
                            : "bg-blue-500/10 text-blue-400",
                        )}
                      >
                        {req.type === "artist" ? (
                          <Music className="h-5 w-5" />
                        ) : (
                          <Building2 className="h-5 w-5" />
                        )}
                      </div>
                    )}
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-heading text-lg font-bold">{req.name}</h3>
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-xs font-medium",
                            req.type === "artist"
                              ? "bg-purple-500/10 text-purple-400"
                              : "bg-blue-500/10 text-blue-400",
                          )}
                        >
                          {req.type === "artist" ? t("adminUi.registrations.typeArtist") : t("adminUi.registrations.typeVenue")}
                        </span>
                      </div>
                      {req.categoryName && (
                        <p className="text-sm text-gold">{req.categoryName}</p>
                      )}
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                        {(req.userEmail || req.email) && (
                          <span className="flex items-center gap-1">
                            <Mail className="h-3.5 w-3.5" />
                            {req.userEmail || req.email}
                          </span>
                        )}
                        {req.phone && (
                          <span className="flex items-center gap-1">
                            <Phone className="h-3.5 w-3.5" />
                            {req.phone}
                          </span>
                        )}
                        {req.location && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3.5 w-3.5" />
                            {req.location}
                          </span>
                        )}
                        {req.capacity && (
                          <span className="flex items-center gap-1">
                            <Users className="h-3.5 w-3.5" />
                            {req.capacity} {t("adminUi.registrations.personsShort")}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5" />
                          {new Date(req.createdAt).toLocaleDateString("ro-RO", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                      {req.description && (
                        <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                          {req.description}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex shrink-0 gap-2 sm:flex-col">
                    <Button
                      size="sm"
                      onClick={() => handleAction(req.id, req.type, "approve")}
                      disabled={processing === req.id}
                      className="gap-1.5 bg-green-600 hover:bg-green-700"
                    >
                      {processing === req.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <CheckCircle className="h-3.5 w-3.5" />
                      )}
                      {t("adminUi.registrations.approve")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleAction(req.id, req.type, "reject")}
                      disabled={processing === req.id}
                      className="gap-1.5 border-red-500/30 text-red-400 hover:bg-red-500/10"
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      {t("adminUi.registrations.reject")}
                    </Button>
                    <Link
                      href={
                        req.type === "artist"
                          ? `/admin/artisti/${req.id}`
                          : `/admin/sali/${req.id}`
                      }
                    >
                      <Button size="sm" variant="ghost" className="gap-1.5 w-full">
                        <Eye className="h-3.5 w-3.5" />
                        {t("adminUi.registrations.details")}
                      </Button>
                    </Link>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
