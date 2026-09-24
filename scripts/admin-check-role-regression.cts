import assert from "node:assert/strict";
import Module, { createRequire } from "node:module";
import { NextRequest } from "next/server";
const original = Module._load;
const load = createRequire(__filename);
let role = "admin";
Module._load = function (request, parent, isMain) {
  if (request === "@clerk/nextjs/server") return { auth: async () => ({ userId: "admin-clerk" }) };
  if (request === "@/lib/rate-limit") return { rateLimit: async () => ({ success: true }) };
  if (request === "@/lib/venue-access") return { listAccessibleVenueIds: async () => {
    throw new Error("Global venue access must not replace the administrator role");
  } };
  if (request === "@/lib/db") return { db: { select: () => {
    const query = { from: () => query, where: () => query, limit: async () => [{ id: "admin-id", role }] };
    return query;
  } } };
  return original.call(this, request, parent, isMain);
};
void (async () => {
  try {
    const { GET } = load("../src/app/api/auth/check-role/route");
    for (role of ["admin", "super_admin"]) {
      const response = await GET(new NextRequest("https://example.invalid/api/auth/check-role"));
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.role, role);
      assert.equal(body.isNewUser, false);
      assert.equal(body.onboardingComplete, true);
    }
    console.log("Admin and super_admin routing verified");
  } finally { Module._load = original; }
})();
