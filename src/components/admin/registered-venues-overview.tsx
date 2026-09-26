"use client";

import { useEffect, useState } from "react";
import { Building2, Loader2 } from "lucide-react";
import Link from "@/components/shared/locale-link";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/hooks/use-locale";
import { adminVenueStatusText } from "@/lib/admin/venue-display";
import type { AdminVenueListItem } from "@/lib/admin/venue-list";

/** Read-only registry, deliberately separate from actionable pending requests. */
export function RegisteredVenuesOverview() {
  const { t, locale } = useLocale();
  const copy = locale === "ru" ? {
    title: "Все зарегистрированные заведения",
    hint: "В очереди показаны только заявки на рассмотрении. Одобренные заведения и черновики доступны здесь. Если владелец ещё не создал заведение, его здесь не будет.",
    open: "Показать заведения и их статусы", close: "Скрыть заведения", all: "Полный список заведений", empty: "Заведения ещё не созданы.",
    error: "Не удалось загрузить заведения.", retry: "Повторить", details: "Подробнее", previous: "Назад", next: "Далее",
    draft: "Черновик не находится в очереди на одобрение. Владелец должен завершить и отправить регистрацию; старые записи требуют отдельной проверки.",
  } : locale === "en" ? {
    title: "All registered venues",
    hint: "The queue only shows requests awaiting review. Approved venues and drafts are available here. Accounts that have not created a venue yet are not listed.",
    open: "Show venues and their statuses", close: "Hide venues", all: "Full venue registry", empty: "No venues have been created yet.",
    error: "Could not load venues.", retry: "Retry", details: "Details", previous: "Previous", next: "Next",
    draft: "Drafts are not in the approval queue. The owner must complete and submit registration; older records require a separate review.",
  } : {
    title: "Toate localurile înregistrate",
    hint: "Lista de cereri arată doar înregistrările în așteptare. Localurile aprobate și ciornele sunt disponibile aici. Conturile care nu au creat încă un local nu apar în listă.",
    open: "Vezi localurile și stările lor", close: "Ascunde localurile", all: "Registrul complet al localurilor", empty: "Nu există încă localuri create.",
    error: "Localurile nu au putut fi încărcate.", retry: "Reîncearcă", details: "Detalii", previous: "Înapoi", next: "Înainte",
    draft: "Ciorna nu este în coada de aprobare. Proprietarul trebuie să finalizeze și să trimită înregistrarea; înregistrările vechi necesită verificare separată.",
  };
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [retry, setRetry] = useState(0);
  const [items, setItems] = useState<AdminVenueListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const limit = 20;

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true);
    setError(false);
    void fetch(`/api/admin/venues?page=${page}&limit=${limit}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("venue registry unavailable");
        const data = await response.json();
        if (!Array.isArray(data.items) || typeof data.total !== "number") throw new Error("invalid registry response");
        if (controller.signal.aborted) return;
        setItems(data.items);
        setTotal(data.total);
      })
      .catch(() => { if (!controller.signal.aborted) setError(true); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [open, page, retry]);

  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-4" aria-labelledby="registered-venues-title">
      <h2 id="registered-venues-title" className="font-heading text-lg font-semibold">{copy.title}</h2>
      <p className="text-sm text-muted-foreground">{copy.hint}</p>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="registered-venues-list">{open ? copy.close : copy.open}</Button>
        <Link href="/admin/sali" className="text-sm text-gold underline">{copy.all}</Link>
      </div>
      {open && <div id="registered-venues-list" className="space-y-3" aria-busy={loading}>
        {loading ? <Loader2 className="h-5 w-5 animate-spin" aria-label={t("common.loading")} /> : error ? (
          <div role="alert"><p>{copy.error}</p><Button variant="outline" onClick={() => setRetry(retry + 1)}>{copy.retry}</Button></div>
        ) : <>
          {items.length === 0 && <p className="text-sm text-muted-foreground">{copy.empty}</p>}
          {items.map((venue) => <div key={venue.id} className="rounded-lg border border-border p-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="flex items-center gap-2 font-medium"><Building2 className="h-4 w-4 shrink-0" /><span className="break-words">{venue.nameRo}</span></h3>
                <p className="text-sm text-muted-foreground">{venue.organization?.displayName}</p>
                <p className="text-sm">{adminVenueStatusText(venue.isActive ? "published" : "unpublished", t)}</p>
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  {Object.entries(venue.halls.byStatus).filter(([, count]) => count > 0).map(([status, count]) => <span key={status}>{adminVenueStatusText(status, t)}: {count}</span>)}
                </div>
              </div>
              <Link href={`/admin/sali/${venue.id}`} className="text-sm text-gold underline">{copy.details}</Link>
            </div>
            {(venue.halls.byStatus.draft ?? 0) > 0 && <p className="mt-2 text-xs text-muted-foreground">{copy.draft}</p>}
          </div>)}
          {total > limit && <div className="flex items-center justify-between gap-2">
            <Button variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>{copy.previous}</Button>
            <span className="text-sm">{page} / {Math.ceil(total / limit)}</span>
            <Button variant="outline" disabled={page * limit >= total} onClick={() => setPage(page + 1)}>{copy.next}</Button>
          </div>}
        </>}
      </div>}
    </section>
  );
}
