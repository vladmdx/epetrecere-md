/**
 * Set the venue commission tiers the owner decided on (2026-08-20):
 *   up to 80 guests → 50 EUR flat, from 80 guests → 100 EUR flat.
 *
 * The legal pack leaves these blank ("approved separately"), so they live in
 * site_settings and are editable from /admin/finante. This script just seeds
 * the first values; the admin UI is the source of truth afterwards.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { getCommissionRules, saveCommissionRules } = await import(
    "../src/lib/commissions/service"
  );
  const current = await getCommissionRules();
  const next = {
    ...current,
    venue: {
      guestThreshold: 80,
      below: { rateBps: null, fixedAmount: 50 },
      atOrAbove: { rateBps: null, fixedAmount: 100 },
    },
    currency: "EUR",
  };
  await saveCommissionRules(next);
  console.log("înainte:", JSON.stringify(current));
  console.log("după   :", JSON.stringify(await getCommissionRules()));
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
