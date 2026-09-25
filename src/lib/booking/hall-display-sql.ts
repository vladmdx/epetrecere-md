import { sql, type SQLWrapper } from "drizzle-orm";

/** Only project the display name, never the full commercial/legal snapshot. */
export function bookingHallNameSql(snapshot: SQLWrapper, currentName: SQLWrapper) {
  return sql<string | null>`coalesce(
    case when jsonb_typeof(${snapshot}->'hallName') = 'string'
      then nullif(btrim(${snapshot}->>'hallName'), '') end,
    nullif(btrim(${currentName}), '')
  )`;
}
