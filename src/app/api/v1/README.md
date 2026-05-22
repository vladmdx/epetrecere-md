# API v1 — mobile contract

This directory exposes a stable, versioned subset of the underlying
API that the mobile app calls. Each route here is a thin re-export
of the unversioned handler so the web side stays the source of truth
and we don't duplicate business logic.

## Versioning policy

- **The web frontend continues to use unversioned routes** (`/api/*`).
  This keeps the existing client codebase untouched.
- **The mobile app calls only `/api/v1/*`**. When we need to make a
  breaking change (rename a field, change a status code), we ship a
  `/api/v2/` namespace and keep `/api/v1/` running until the old
  mobile builds drop below ~1% of installs.
- **All breaking changes get a new namespace**. Non-breaking additions
  (new optional field, new status accepted by an existing enum)
  can land on `/api/v1/` directly.

## How a re-export shim looks

```ts
// /api/v1/artists/route.ts
export { GET } from "../../artists/route";
```

That's it — the route handler is reused via standard ES module
re-export. Next.js doesn't care if `GET` was defined inline or
re-exported from another module.

If a route needs different behavior on v1 (e.g., redact a field that
leaks too much over the public API), wrap the handler:

```ts
import { GET as v0Get } from "../../artists/route";
export async function GET(req: NextRequest) {
  const res = await v0Get(req);
  // ...transform res...
  return res;
}
```

## Adding a new endpoint

1. Make sure the underlying `/api/<thing>/route.ts` is stable.
2. `mkdir src/app/api/v1/<thing>/` (or nested if dynamic).
3. Create `route.ts` re-exporting whichever verbs mobile needs.
4. Add a constant for it in `packages/shared/src/api/index.ts → API_PATHS`.
