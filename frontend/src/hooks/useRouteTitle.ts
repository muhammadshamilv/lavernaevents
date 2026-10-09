import { useLayoutEffect } from "react";
import { useLocation } from "react-router-dom";

const BRAND = "Laverna Events";

const LABELS: Record<string, string> = {
  portal: "Dashboard",
  admin: "Admin",
  photographer: "Photographer",
  qr: "QR codes",
  rsvp: "RSVPs",
  ecards: "E-cards",
};

function titleCase(segment: string): string {
  const spaced = segment.replace(/[-_]+/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** "/portal/events/12/guests" -> "Guests", "/admin/users" -> "Users". */
export function titleForPath(pathname: string, area: string): string {
  const segments = pathname
    .split("/")
    .filter(Boolean)
    .filter((segment) => segment !== area && !/^\d+$/.test(segment));

  const last = segments[segments.length - 1];
  const label = last ? (LABELS[last] ?? titleCase(last)) : LABELS[area] ?? titleCase(area);

  return `${label} | ${BRAND}`;
}

/**
 * Gives every page inside a layout its own browser-tab title instead of one
 * shared title. It runs as a LAYOUT effect on purpose: a page's own
 * useEffect-based title (usePageMeta) runs afterwards and therefore wins
 * when a page wants something more specific than the path.
 */
export function useRouteTitle(area: "portal" | "admin" | "photographer") {
  const { pathname } = useLocation();

  useLayoutEffect(() => {
    document.title = titleForPath(pathname, area);
  }, [pathname, area]);
}

const PUBLIC_TITLES: Record<string, string> = {
  login: "Log in",
  register: "Create your account",
  "forgot-password": "Forgot password",
  "reset-password": "Reset password",
  "verify-mobile": "Verify your mobile number",
  respond: "Your invitation",
  scan: "Find your photos",
  payment: "Payment",
};

/**
 * Titles for pages outside the portal/admin/photographer layouts. The home
 * page keeps the title from index.html, and the three layouts above set
 * their own, so those paths are skipped here.
 */
export function usePublicRouteTitle() {
  const { pathname } = useLocation();

  useLayoutEffect(() => {
    const [first] = pathname.split("/").filter(Boolean);

    if (!first || ["portal", "admin", "photographer"].includes(first)) return;

    const label = PUBLIC_TITLES[first];

    document.title = label ? `${label} | ${BRAND}` : titleForPath(pathname, "");
  }, [pathname]);
}