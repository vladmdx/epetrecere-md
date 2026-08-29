/**
 * Bounds a database call so a slow database cannot fail a build.
 *
 * Next.js gives each statically generated page 60 seconds and retries three
 * times before failing the whole export. The homepage spent longer than that
 * and took four production deploys down with it — not because anything was
 * broken, but because the build runs in Washington while the database sits in
 * Frankfurt on the smallest instance, and the driver holds a single
 * connection, so queries that read as parallel actually queue behind each
 * other across the Atlantic.
 *
 * A page that renders fine without its data has no business blocking on that
 * data indefinitely. Callers already treat a failed fetch as "render the
 * section empty"; this makes slowness take the same path as failure, which
 * turns an unbounded external dependency into a bounded one.
 *
 * ISR fills the content back in on the first request after deploy, so the
 * cost of hitting the timeout is one cold render, not a permanently empty page.
 */
export class QueryTimeout extends Error {
  constructor(ms: number) {
    super(`database call exceeded ${ms}ms`);
    this.name = "QueryTimeout";
  }
}

export function withTimeout<T>(promise: Promise<T>, ms = 12_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new QueryTimeout(ms)), ms);
    }),
  ]).finally(() => clearTimeout(timer)) as Promise<T>;
}
