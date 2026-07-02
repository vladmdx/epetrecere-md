// v1 alias — see ../../README.md
// GET  ?entity_type=artist&entity_id=N&month=YYYY-MM  → month's calendar events
// POST { entity_type, entity_id, dates[], status }    → owner-gated bulk set
export { GET, POST } from "../../calendar/route";
