/**
 * Commissions, for the app.
 *
 * Only GET is re-exported. The POST on the web route is admin reconciliation
 * that walks every confirmed order on the platform; there is no reason for it
 * to be reachable from a phone, and v1 is the surface a shipped build keeps
 * calling long after we would want to change it.
 *
 * The handler already scopes rows to the signed-in vendor, so a partner sees
 * their own fees and nothing else.
 */
export { GET } from "../../commissions/route";
