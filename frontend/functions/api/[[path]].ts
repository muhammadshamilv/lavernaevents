// Cloudflare Pages Function: forwards every /api/* request to the Django
// backend on Render. The browser only ever talks to the Pages site, so the
// login cookies are first-party (no cross-site cookie blocking, no CORS).
//
// Variables on the Pages project (Settings -> Variables and Secrets):
//   BACKEND_ORIGIN      https://laverna-api.onrender.com   (no trailing slash)
//   PROXY_SHARED_SECRET a long random string; set the SAME value on Render.
//                       Lets Django trust the visitor IP sent below (used for
//                       rate limiting). Optional but strongly recommended.

interface Env {
  BACKEND_ORIGIN: string;
  PROXY_SHARED_SECRET?: string;
}

const json = (status: number, message: string): Response =>
  new Response(JSON.stringify({ success: false, message }), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

export const onRequest = async (context: {
  request: Request;
  env: Env;
}): Promise<Response> => {
  const { request, env } = context;

  if (!env.BACKEND_ORIGIN) {
    return json(500, "BACKEND_ORIGIN is not configured on this Pages project.");
  }

  const incoming = new URL(request.url);
  const target = new URL(incoming.pathname + incoming.search, env.BACKEND_ORIGIN);

  // Copy the headers, then overwrite anything a visitor could have forged.
  const headers = new Headers(request.headers);
  headers.delete("X-Client-IP");
  headers.delete("X-Proxy-Secret");

  const visitorIp = request.headers.get("CF-Connecting-IP");
  if (env.PROXY_SHARED_SECRET && visitorIp) {
    headers.set("X-Client-IP", visitorIp);
    headers.set("X-Proxy-Secret", env.PROXY_SHARED_SECRET);
  }

  const upstream = new Request(target.toString(), {
    method: request.method,
    headers,
    body: request.body,
    redirect: "manual",
  });

  try {
    return await fetch(upstream);
  } catch {
    // Render free instances sleep; a cold start or outage should give the
    // app a clean JSON error instead of an HTML Cloudflare page.
    return json(502, "The server is not reachable right now. Please try again in a moment.");
  }
};