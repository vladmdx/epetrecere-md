/**
 * Deleting your account, from the app.
 *
 * Required by App Store 5.1.1(v) and by Google Play: an app that creates
 * accounts must let a person delete theirs from inside the app, not only by
 * writing to support. Both account screens stopped at "sign out", and the
 * handler this re-exports was reachable only from the website.
 */
export { DELETE } from "../../../me/delete-account/route";
