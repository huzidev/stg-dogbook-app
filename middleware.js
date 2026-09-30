export const config = { matcher: "/api/wholesale-orders" };

export default function middleware(request) {
  if (request.method !== "OPTIONS") return;

  const origin = request.headers.get("origin") ?? "";
  const allowed = (process.env.ALLOWED_STOREFRONT_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
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
