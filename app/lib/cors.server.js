// ponytail: hardcoded staging origin fallback mirrors middleware.js
const DEFAULTS = [
  "https://the-dog-book-171j00mq.myshopify.com",
  "https://dog-book-wholesale.myshopify.com",
];

const allowed = () => [
  ...DEFAULTS,
  ...(process.env.ALLOWED_STOREFRONT_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
];

function originIfAllowed(request) {
  const origin = request.headers.get("origin");
  if (!origin) return null;
  return allowed().includes(origin) ? origin : null;
}

export function corsHeaders(request) {
  const origin = originIfAllowed(request);
  if (!origin) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

export function preflight(request) {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}
