import { splitLocale } from "./i18n/routing";

/** Navigation follows the current dashboard, never an arbitrary first venue. */
export function dashboardAccountLinks(pathname: string) {
  const path = splitLocale(pathname).pathname;
  if (path === "/cabinet" || path.startsWith("/cabinet/")) {
    return { profile: "/cabinet/profil", settings: "/cabinet/setari" };
  }
  if (path === "/admin" || path.startsWith("/admin/")) {
    return { profile: null, settings: "/admin/setari" };
  }
  const venue = path.match(/^\/dashboard\/locatii\/([1-9]\d*)(?:\/|$)/);
  if (venue) return { profile: null, settings: `/dashboard/locatii/${venue[1]}/setari` };
  if (path === "/dashboard/sala" || path.startsWith("/dashboard/sala/")) {
    return { profile: null, settings: "/dashboard/sala/setari" };
  }
  return { profile: null, settings: "/dashboard/setari" };
}
