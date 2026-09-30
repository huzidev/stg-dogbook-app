# 02 — Intake API endpoint

## Route
`POST /api/wholesale-orders` — new React Router resource route at `app/routes/api.wholesale-orders.jsx` (loader rejects GET, action handles POST). Public endpoint (no Shopify session — the caller is a storefront page, not the embedded admin).

## Request body (wire format, snake_case, from the theme)
```json
{
  "shop_name": "The Corner Bookstore",
  "store_url": "https://cornerbookstore.com",
  "channel": "Both",
  "business_address": "123 Main St, ...",
  "invoice_address": "123 Main St, ...",
  "currency": "USD",
  "totals": { "units": 30, "price": 1500 },
  "lines": [
    {
      "handle": "beagle",
      "name": "Beagle",
      "count": 10,
      "price": 50,
      "variant_id": "44123456789012",
      "product_title": "Dogbook — Beagle"
    }
  ]
}
```

Notes:
- `price` fields are **dollars** (major units). Server converts to cents at ingest.
- `variant_id` and `product_title` are **nullable** — treat both as optional strings.
- `channel` is the exact label the theme renders (`"Online" | "Offline" | "Both"`).
- `invoice_address` is always present — theme mirrors business address when "Same as" is checked.

## Response
Success (200):
```json
{
  "order_id": "clx...",
  "checkout_url": "https://<shop>.myshopify.com/cart/44123456789012:10?attributes[wholesale_order_id]=clx...&checkout[shipping_address][address1]=..."
}
```

Edge case — every line is missing `variant_id`:
```json
{ "order_id": "clx...", "checkout_url": null }
```

Errors:
- `400` → `{ "error": "Invalid payload", "fields": { "shop_name": "required" } }`
- `500` → `{ "error": "Internal error" }`

Response body is snake_case to match the wire format. **The theme only reads `checkout_url`**; `order_id` is kept for our own logs and is ignored by the theme.

## Validation (minimum)
- `shop_name`, `store_url`, `business_address`, `invoice_address` — non-empty strings, trim.
- `channel` — one of `"Online" | "Offline" | "Both"` (exact match).
- `lines` — non-empty array; each has non-empty `handle`, `name`, positive `count`, non-negative `price`. `variant_id` / `product_title` may be `null`.
- `totals.units`, `totals.price` — present; server recomputes and logs a warning on mismatch, but doesn't reject (theme is source of display truth).
- `currency` — default `"USD"` if missing.

No schema library needed — hand-rolled check is smaller than pulling in Zod for one endpoint. If validation grows past ~30 lines, swap in Zod.

## Handler shape (sketch, not final code)
```js
// app/routes/api.wholesale-orders.jsx
import { data } from "react-router";
import prisma from "../db.server";
import { buildCheckoutUrl } from "../lib/shopify-checkout.server";
import { corsHeaders, preflight } from "../lib/cors.server";

export const loader = ({ request }) => {
  if (request.method === "OPTIONS") return preflight(request);
  return data({ error: "Method not allowed" }, { status: 405, headers: corsHeaders(request) });
};

export async function action({ request }) {
  if (request.method === "OPTIONS") return preflight(request);
  if (request.method !== "POST") {
    return data({ error: "Method not allowed" }, { status: 405, headers: corsHeaders(request) });
  }

  const body = await request.json();
  const errors = validate(body);
  if (errors) return data({ error: "Invalid payload", fields: errors }, { status: 400, headers: corsHeaders(request) });

  const toCents = (dollars) => Math.round(dollars * 100);

  const order = await prisma.wholesaleOrder.create({
    data: {
      shopName: body.shop_name.trim(),
      storeUrl: body.store_url.trim(),
      channel: body.channel,
      businessAddress: body.business_address.trim(),
      invoiceAddress: body.invoice_address.trim(),
      currency: body.currency ?? "USD",
      totalUnits: body.totals.units,
      totalAmount: toCents(body.totals.price),
      items: {
        create: body.lines.map((l) => ({
          handle: l.handle,
          name: l.name,
          variantId: l.variant_id ?? null,
          productTitle: l.product_title ?? null,
          quantity: l.count,
          unitPrice: toCents(l.price),
        })),
      },
    },
  });

  const checkoutUrl = buildCheckoutUrl(order, body.lines); // may return null if no variant_ids
  return data(
    { order_id: order.id, checkout_url: checkoutUrl },
    { status: 200, headers: corsHeaders(request) },
  );
}
```

## CORS (required — theme is cross-origin)
Endpoint needs `Access-Control-Allow-Origin` and an `OPTIONS` preflight handler. Allowed origins come from an env var (comma-separated); reflect if matched, reject otherwise. No `*` — endpoint mutates state.

```
ALLOWED_STOREFRONT_ORIGINS="https://cornerbookstore.com,https://www.cornerbookstore.com"
```

Small helper in `app/lib/cors.server.js` that both the loader and action reuse — no duplication.

## Auth
**None.** Public endpoint per your decision. Theme calls it directly from the browser.
Rate limiting will be added if we see abuse in logs; not now.

## Skipped, add when
- Rate limiting — skip, add when we see abuse in logs.
- Zod / class-validator — skip, add when validation exceeds ~30 lines.
- Idempotency key — skip, add when we hear about duplicate submissions.
- Server-side totals re-validation as a hard reject — skip; log-and-store is enough for now.
