export const config = { matcher: "/api/wholesale-orders" };

// ponytail: hardcoded staging origin fallback so preflight works even if env var is unset.
// Add ALLOWED_STOREFRONT_ORIGINS (comma-sep) in Vercel to extend to the custom domain later.
const DEFAULTS = [
  "https://the-dog-book-171j00mq.myshopify.com",
  "https://dog-book-wholesale.myshopify.com",
];

export default function middleware(request) {
  if (request.method !== "OPTIONS") return;

  const origin = request.headers.get("origin") ?? "";
  const envAllowed = (process.env.ALLOWED_STOREFRONT_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const allowed = [...DEFAULTS, ...envAllowed];
  if (!allowed.includes(origin)) return new Response(null, { status: 204 });

  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": origin,
      Vary: "Origin",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
}
