export default function VenuesLoading() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 lg:px-8">
      <div className="mb-8">
        <div className="h-9 w-64 animate-pulse rounded-lg bg-muted" />
        <div className="mt-2 h-5 w-24 animate-pulse rounded bg-muted" />
      </div>
      <div className="mb-6 flex gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-8 w-20 animate-pulse rounded-full bg-muted" />
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="overflow-hidden rounded-xl border border-border/40 bg-card">
            <div className="aspect-[16/10] animate-pulse bg-muted" />
            <div className="p-4 space-y-2">
              <div className="h-5 w-3/4 animate-pulse rounded bg-muted" />
              <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
              <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
