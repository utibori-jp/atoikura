// Security headers of the app's static files (#208). nginx.conf.template sends
// the same headers in production (a unit test keeps the two in sync), and
// `vite preview` sends them too, so the E2E suite runs the production build under
// the real policy. The dev server sends none: its hot reload needs inline scripts.

// Google Fonts serves the stylesheet and the font files.
const FONT_STYLESHEET_ORIGIN = "https://fonts.googleapis.com";
const FONT_FILE_ORIGIN = "https://fonts.gstatic.com";

// The Content-Security-Policy for an app that talks to the API at api_origin.
// - script-src: only the app's own bundles. 'wasm-unsafe-eval' lets the DB
//   worker compile SQLite WASM; it allows no JavaScript eval.
// - style-src: the app's stylesheet and the font stylesheet. React's style props
//   go through the CSSOM, which the policy does not restrict.
// - connect-src: the API, plus the font origins for the service worker, which
//   fetches and caches the fonts.
// - Nothing may frame the app, and no plugin, <base> or foreign form target.
export function contentSecurityPolicy(api_origin: string): string {
  const connect_sources = ["'self'", api_origin, FONT_STYLESHEET_ORIGIN, FONT_FILE_ORIGIN]
    .filter((connect_source) => connect_source !== "")
    .join(" ");
  return [
    "default-src 'self'",
    "script-src 'self' 'wasm-unsafe-eval'",
    `style-src 'self' ${FONT_STYLESHEET_ORIGIN}`,
    `font-src ${FONT_FILE_ORIGIN}`,
    "img-src 'self' data:",
    `connect-src ${connect_sources}`,
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

export function securityHeaders(api_origin: string): Record<string, string> {
  return {
    "Content-Security-Policy": contentSecurityPolicy(api_origin),
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
  };
}

// The origin of an API URL such as VITE_API_URL, or "" when it is missing or
// relative (the API is then same-origin and 'self' covers it).
export function apiOriginOf(api_url: string | undefined): string {
  if (!api_url) return "";
  try {
    return new URL(api_url).origin;
  } catch {
    return "";
  }
}
