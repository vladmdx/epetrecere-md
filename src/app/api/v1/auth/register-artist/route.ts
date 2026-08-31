/**
 * Creating an artist profile, from the app.
 *
 * `/artists/crud` only ever updates an existing row, so the app's "complete
 * your profile" button led nowhere for a partner who had just signed up. This
 * is the same endpoint the web onboarding uses, including the step that links
 * the freshly signed contract to the profile it belongs to.
 */
export { POST } from "../../../auth/register-artist/route";
