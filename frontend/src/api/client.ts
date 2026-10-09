import axios, { type AxiosError, type InternalAxiosRequestConfig } from "axios";

// ---------------------------------------------------------------------
// Where does the API live?
//
// DEVELOPMENT (npm run dev): derive the host from the page itself. The
// backend's auth cookies are SameSite=Lax, and browsers treat "localhost"
// and "127.0.0.1" as different sites, so a page at http://localhost:5173
// calling a hardcoded http://127.0.0.1:8000 would never get its cookies
// attached. Using window.location.hostname keeps every request same-site
// whichever of the two hosts (or a LAN IP) the page is opened from.
//
// PRODUCTION (Cloudflare Pages build): the app calls "/api" on its OWN
// origin. A Pages Function (functions/api/[[path]].ts) forwards those calls
// to the Render backend. Because the browser only ever talks to one site,
// the auth cookies stay first-party and no CORS is involved.
//   VITE_API_BASE_URL = /api
//   VITE_API_ORIGIN   = https://<your-render-service>.onrender.com
//                       (only used to resolve relative /media/... URLs)
//
// Both variables are read in production builds only, so a local .env can
// never accidentally change how development works.
// ---------------------------------------------------------------------

// In a production build, fall back to "/api" (the Pages Function proxy) when
// VITE_API_BASE_URL was not set, instead of silently calling localhost.
const configuredBase: string | undefined = import.meta.env.PROD
  ? import.meta.env.VITE_API_BASE_URL || "/api"
  : undefined;

const configuredOrigin: string | undefined = import.meta.env.PROD
  ? import.meta.env.VITE_API_ORIGIN
  : undefined;

const API_HOST =
  typeof window !== "undefined" && window.location.hostname
    ? window.location.hostname
    : "127.0.0.1";

const DEV_ORIGIN = `http://${API_HOST}:8000`;

function stripTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

function resolveApiOrigin(): string {
  if (configuredOrigin) return stripTrailingSlashes(configuredOrigin);

  if (configuredBase) {
    if (/^https?:\/\//i.test(configuredBase)) {
      return new URL(configuredBase).origin;
    }

    return typeof window !== "undefined" ? window.location.origin : "";
  }

  return DEV_ORIGIN;
}

// The bare origin (no /api suffix) - needed to resolve relative media URLs
// (e.g. event cover images) returned by endpoints that don't build an
// absolute URL themselves. See lib/media.ts.
export const API_ORIGIN = resolveApiOrigin();

export const API_BASE_URL = configuredBase
  ? stripTrailingSlashes(configuredBase)
  : `${DEV_ORIGIN}/api`;

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
});

interface RetriableRequestConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

// /auth/login/ and /auth/register/ never carry a session to refresh.
// /auth/refresh/ is the hard safety check: without it, a 401 from the
// refresh call itself would re-enter this same retry flow and loop.
// /auth/logout/ MUST also be excluded: the backend's logout view is
// AllowAny and blacklists the refresh cookie unconditionally, so it
// should never 401 in the first place - but if it ever does (a stray
// concurrent request, a race with another 401 in flight), retrying it
// through a token refresh is actively wrong: that call mints a BRAND NEW
// valid access/refresh cookie pair right as the user is trying to log
// out, silently re-authenticating them a moment after the UI already
// shows them logged out. The fix is to let a failed logout call fail,
// never resurrect the session to retry it.
// /auth/me/ is intentionally NOT in this list - a 401 there is exactly the
// "access token expired, refresh cookie might still be valid" case this
// interceptor exists to handle, so it must stay eligible for one refresh
// attempt like any other authenticated request.
const NO_REFRESH_PATHS = [
  "/auth/login/",
  "/auth/register/",
  "/auth/verify-mobile/",
  "/auth/resend-otp/",
  "/auth/forgot-password/",
  "/auth/reset-password/",
  "/auth/refresh/",
  "/auth/logout/",
];

function shouldSkipRefresh(url?: string): boolean {
  if (!url) return false;
  return NO_REFRESH_PATHS.some((path) => url.includes(path));
}

let isRefreshing = false;
type RefreshResult = "ok" | "expired" | "error";

let refreshWaiters: Array<(result: RefreshResult) => void> = [];

function notifyWaiters(result: RefreshResult) {
  refreshWaiters.forEach((resolve) => resolve(result));
  refreshWaiters = [];
}

// "expired" = the server refused the refresh cookie (really logged out).
// "error"   = network drop, 429 rate limit, 5xx: the session may be fine, so
//             the caller must NOT sign the user out because of it.
async function refreshSession(): Promise<RefreshResult> {
  if (isRefreshing) {
    return new Promise((resolve) => {
      refreshWaiters.push(resolve);
    });
  }

  isRefreshing = true;
  let result: RefreshResult = "ok";

  try {
    await axios.post(
      `${API_BASE_URL}/auth/refresh/`,
      {},
      { withCredentials: true }
    );
  } catch (error) {
    const status = axios.isAxiosError(error) ? error.response?.status : undefined;
    result = status === 401 || status === 403 ? "expired" : "error";
  } finally {
    isRefreshing = false;
  }

  notifyWaiters(result);
  return result;
}

let sessionExpiredHandler: (() => void) | null = null;

export function setSessionExpiredHandler(handler: () => void) {
  sessionExpiredHandler = handler;
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as RetriableRequestConfig | undefined;

    if (
      error.response?.status === 401 &&
      originalRequest &&
      !originalRequest._retry &&
      !shouldSkipRefresh(originalRequest.url)
    ) {
      originalRequest._retry = true;

      const refreshed = await refreshSession();

      if (refreshed === "ok") {
        return apiClient(originalRequest);
      }

      if (refreshed === "expired") {
        sessionExpiredHandler?.();
      }
    }

    return Promise.reject(error);
  }
);