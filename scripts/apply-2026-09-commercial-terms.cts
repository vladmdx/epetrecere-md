/** Owner-approved venue schedule update. Does not alter signed records or existing fees. */
const fs = require("node:fs");
const postgres = require("postgres");
const { VENUE_SCHEDULES_FROM_AGREEMENT } = require("../src/lib/commissions/rules");
const envFile = process.env.TERMS_ENV_FILE;
if (!envFile) throw Error("TERMS_ENV_FILE required");
const env = require("dotenv").parse(fs.readFileSync(envFile));
const sql = postgres(env.DATABASE_URL, { ssl: "require", prepare: false, max: 1 });
(async () => {
  try {
    await sql.begin(async tx => {
      const [row] = await tx`select value from site_settings where key = 'commission_rules' for update`;
      if (!row) throw Error("Existing commission rules required");
      const next = { ...row.value, venueSchedules: VENUE_SCHEDULES_FROM_AGREEMENT };
      if (process.argv.includes("--apply")) {
        const backup = process.env.TERMS_BACKUP_FILE;
        if (!backup) throw Error("TERMS_BACKUP_FILE required for apply");
        fs.writeFileSync(backup, JSON.stringify({ savedAt: new Date().toISOString(), previous: row.value, next }, null, 2), { mode: 0o600, flag: "wx" });
        await tx`update site_settings set value = ${tx.json(next)} where key = 'commission_rules'`;
      }
      console.log(JSON.stringify({ applied: process.argv.includes("--apply"), artistRateBps: next.artist.rateBps, currency: next.currency, other: next.venueSchedules.other }));
    });
  } finally { await sql.end(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
