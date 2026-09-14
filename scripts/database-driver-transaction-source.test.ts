import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("all advertised PostgreSQL hosts use a transaction-capable driver", () => {
  const source = readFileSync("src/lib/db/index.ts", "utf8");
  assert.match(source, /drizzle-orm\/postgres-js/);
  assert.doesNotMatch(source, /drizzle-orm\/neon-http/);
  assert.doesNotMatch(source, /if \(isNeon\(url\)\)/);
  assert.match(source, /return drizzlePg\(client, \{ schema \}\)/);
});
