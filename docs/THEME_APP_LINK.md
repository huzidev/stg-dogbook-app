# Theme ↔ App Integration — Wholesale Order Flow

Reference doc for porting this integration into the production app. Describes every file this app owns on the theme-facing boundary: the public API endpoint the storefront theme POSTs to, CORS handling, the DB model, the paid-order webhook, and the one-off data migration that adds a Wholesale variant tier to each product.

The theme itself is not in this repo. The theme submits a JSON POST to `/api/wholesale-orders`; this app persists the order, (eventually) returns a Shopify checkout URL, and later flips the order to paid via the `orders/paid` webhook.

Repo root: `/Users/huzaifa/Desktop/Signature_Works/vercel_stagings/thedogbook-app/stg-dogbook-app`

---

## 1. The public API endpoint

**File:** `app/routes/api.wholesale-orders.jsx`

Flat-route path: `/api/wholesale-orders`. Accepts `POST` with a JSON body from the storefront theme and `OPTIONS` for CORS preflight. Returns `{ order_id, checkout_url }`.

Behaviour:
- `OPTIONS` → delegates to `preflight(request)` from `app/lib/cors.server.js`.
- Non-POST → `405 Method not allowed` with CORS headers.
- Invalid JSON → `400 Invalid JSON`.
- Validates body via `validateIntake` — on failure returns `400` with a `fields` map.
- Sanity-checks that `sum(lines[i].price * count)` equals `totals.price` (logs a warning but still proceeds).
- Persists via `prisma.wholesaleOrder.create({ data: toPrismaCreate(body) })`.
- `checkout_url` is intentionally returned as `null` right now (see §5). The theme is expected to handle `null` by showing a "we'll follow up" state.

Expected payload shape (contract with theme):

```json
{
  "shop_name": "string",
  "store_url": "string",
  "business_address": "string",
  "invoice_address": "string",
  "channel": "string",
  "currency": "USD",
  "totals": { "units": 10, "price": 500.00 },
  "lines": [
    {
      "handle": "string (product handle)",
      "name": "string (breed/display name)",
      "count": 1,
      "price": 50.00,
      "variant_id": "gid://shopify/ProductVariant/... | numeric string | null",
      "product_title": "string | null"
    }
  ]
}
```

---

## 2. Validation + Prisma mapping

**File:** `app/lib/wholesale-intake.server.js`

Two exports:
- `validateIntake(body)` — returns an error map, or `null` if valid.
- `toPrismaCreate(body)` — maps the JSON body to Prisma's nested `create` input for `WholesaleOrder` + `WholesaleOrderItem`.
- `toCents(dollars)` — helper, converts to integer cents (prices in DB are stored as integer cents).

Important history: `channel` used to be restricted to `Online | Offline | Both`. It is now a free-form non-empty string so the theme can send any label the merchant chose without the app needing a release. Keep this behaviour when porting.

**Test file:** `app/lib/wholesale-intake.test.mjs` (Node's built-in `node:test`). Run with `node --test app/lib/wholesale-intake.test.mjs`.

---

## 3. CORS

Two layers — both must agree on the allowlist, and both have hardcoded staging-store origins as a fallback so preflight works even when the Vercel env var is unset.

### 3a. Vercel edge middleware

**File:** `middleware.js` (repo root)

```js
export const config = { matcher: "/api/wholesale-orders" };
```

Runs on the Vercel edge for the matched path only. Handles `OPTIONS` preflight entirely at the edge — the request never reaches the React Router route for preflight. Non-OPTIONS requests pass through to the route.

Hardcoded `DEFAULTS` (keep in sync with `cors.server.js`):

```js
const DEFAULTS = [
  "https://the-dog-book-171j00mq.myshopify.com",
  "https://dog-book-wholesale.myshopify.com",
];
```

Allowlist = `DEFAULTS` + env `ALLOWED_STOREFRONT_ORIGINS` (comma-separated). Unknown origin → `204` with no CORS headers (effectively blocks it). Allowed origin → `204` with `Access-Control-Allow-Origin`, `Vary: Origin`, `Allow-Methods: POST, OPTIONS`, `Allow-Headers: Content-Type`, `Max-Age: 86400`.

For production: add the production storefront origin to `DEFAULTS` (or set `ALLOWED_STOREFRONT_ORIGINS` in Vercel) **and** remove the staging-only origins.

### 3b. Route-level CORS headers

**File:** `app/lib/cors.server.js`

Used by the route to decorate POST responses (`200` / `400` / `405` / `500`) with the same `Access-Control-Allow-Origin` + `Vary` headers. Same `DEFAULTS` list, same env var. Exports:

- `corsHeaders(request)` — returns a header object (empty if origin not allowed).
- `preflight(request)` — returns a `204` response with CORS headers (unused in production because middleware intercepts first, but kept as a safety net for local dev where the edge middleware doesn't run).

---

## 4. Database model

**File:** `prisma/schema.prisma`

Two models were added (plus the existing Shopify `Session` model, untouched):

```prisma
model WholesaleOrder {
  id               String   @id @default(cuid())
  shopName         String
  storeUrl         String
  channel          String
  businessAddress  String
  invoiceAddress   String
  currency         String   @default("USD")
  totalUnits       Int
  totalAmount      Int           // cents
  isPaid           Boolean  @default(false)
  shopifyOrderId   String?       // populated by orders/paid webhook
  shopifyOrderName String?       // e.g. "#1042"
  paidAt           DateTime?
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
  items            WholesaleOrderItem[]
  @@index([isPaid])
  @@index([shopifyOrderId])
}

model WholesaleOrderItem {
  id           String  @id @default(cuid())
  orderId      String
  handle       String
  name         String
  variantId    String?
  productTitle String?
  quantity     Int
  unitPrice    Int           // cents
  order        WholesaleOrder @relation(fields: [orderId], references: [id], onDelete: Cascade)
  @@index([orderId])
}
```

Datasource is **PostgreSQL** (`provider = "postgresql"`, `url = env("DATABASE_URL")`).

**Migration folder:** `prisma/migrations/20260930105021/` (there is also an older `20260930074517_init_postgres` migration from an earlier commit — only the latest timestamped folder is present on disk now).

`package.json` `build` script runs `prisma generate && prisma migrate deploy && react-router build`, so Vercel deploys apply migrations automatically.

---

## 5. Checkout URL builder (currently disabled)

**File:** `app/lib/shopify-checkout.server.js`

Builds a Shopify cart permalink of the form `https://<shop>/cart/<variantId>:<qty>,...?attributes[wholesale_order_id]=<id>&checkout[shipping_address][address1]=...&note=...`. The `attributes[wholesale_order_id]` is the critical piece — it rides along the checkout and becomes a `note_attribute` on the resulting Shopify order, which is how the webhook links back to our `WholesaleOrder` row.

**Status:** import is **removed from the route** (`api.wholesale-orders.jsx`) and the route returns `checkout_url: null`. The reason is that product/variant wiring hasn't been finalized — not every line in the payload has a `variant_id` yet. Re-enable by:

1. Importing: `import { buildCheckoutUrl } from "../lib/shopify-checkout.server.js";`
2. Replacing the stub block in `api.wholesale-orders.jsx` with:
   ```js
   const checkout_url = buildCheckoutUrl(order, body.lines);
   return data({ order_id: order.id, checkout_url }, { status: 200, headers: corsHeaders(request) });
   ```
3. Setting env `SHOPIFY_SHOP_DOMAIN` (e.g. `the-dog-book-171j00mq.myshopify.com`) — without it the builder returns `null` with a warning.
4. Making sure every line in the theme payload has `variant_id`. The builder drops lines without one; if all lines are unlinked it returns `null`.

**Test file:** `app/lib/shopify-checkout.test.mjs`.

---

## 6. Paid-order webhook

**File:** `app/routes/webhooks.orders.paid.jsx`

Topic `orders/paid`. Looks for `note_attributes[].name === "wholesale_order_id"` on the Shopify order payload (set by the cart permalink in §5), then runs:

```js
prisma.wholesaleOrder.updateMany({
  where: { id: attr.value, isPaid: false },
  data: { isPaid: true, shopifyOrderId, shopifyOrderName, paidAt },
});
```

`updateMany` + `isPaid: false` guard = idempotent (webhook can fire twice safely).

**Webhook subscription:** `shopify.app.toml` under `[webhooks]`:

```toml
[[webhooks.subscriptions]]
uri = "/webhooks/orders/paid"
topics = [ "orders/paid" ]
```

**Required scope:** `read_orders` is in `[access_scopes] scopes = "write_products,write_metaobjects,write_metaobject_definitions,read_orders"`.

---

## 7. Admin UI — view a wholesale order

**File:** `app/routes/app.orders.$id.jsx`

Embedded admin page that renders a single `WholesaleOrder` with its items, paid status, and a deep link to the matching Shopify admin order (when `shopifyOrderId` is populated). Uses Polaris web components (`<s-page>`, `<s-section>`, `<s-table>`, etc.). Loader authenticates with `authenticate.admin(request)` and reads `SHOPIFY_SHOP_DOMAIN` to build the admin deep link.

Not strictly on the theme-link path, but ships with it so merchants can see what the theme submitted.

---

## 8. One-off product data migration

**File:** `scripts/add-wholesale-variants.mjs`

Standalone Node script (uses `shopify store execute` under the hood). Adds a `Tier` product option with values `Retail` + `Wholesale` to every active product, sets the Wholesale variant to `$50.00` and inventory `888` at the first active location. Idempotent — safe to re-run; skips products whose Wholesale variant already has the target quantity.

Prereqs:
```
shopify store auth --store the-dog-book-171j00mq.myshopify.com \
  --scopes write_products,write_inventory,read_locations
```

Usage:
```
node scripts/add-wholesale-variants.mjs --dry-run
node scripts/add-wholesale-variants.mjs
node scripts/add-wholesale-variants.mjs --limit=5
```

Env overrides: `SHOPIFY_STORE`, `WHOLESALE_LOCATION_NAME`.

For the production port: change the hardcoded `STORE` default and the `WHOLESALE_PRICE` / `WHOLESALE_QTY` constants to match prod requirements, or just pass them through env + CLI args.

---

## 9. Build + deploy config

- **`react-router.config.js`** — uses `vercelPreset()` from `@vercel/react-router/vite`. Required for the Vercel edge middleware (`middleware.js`) to be deployed as an edge function alongside the SSR build.
- **`package.json`** — `build` script runs Prisma migrations as part of deploy: `prisma generate && prisma migrate deploy && react-router build`.
- **`shopify.app.toml`** — webhook subscription for `orders/paid` and the `read_orders` scope (see §6).

---

## 10. Environment variables

| Var | Where used | Purpose |
|---|---|---|
| `DATABASE_URL` | `prisma/schema.prisma` | Postgres connection string. |
| `ALLOWED_STOREFRONT_ORIGINS` | `middleware.js`, `app/lib/cors.server.js` | Comma-separated extra origins allowed to call the API. **Not** required — hardcoded `DEFAULTS` cover staging. Add the production storefront origin here. |
| `SHOPIFY_SHOP_DOMAIN` | `app/lib/shopify-checkout.server.js`, `app/routes/app.orders.$id.jsx` | Shop myshopify.com domain used to build cart permalinks and admin deep links. |
| `SHOPIFY_API_KEY` / `SHOPIFY_API_SECRET` / etc. | `app/shopify.server.js` | Standard Shopify app auth (unchanged from template). |

---

## File checklist for the production port

Copy / adapt these files from this repo:

- `app/routes/api.wholesale-orders.jsx`
- `app/lib/cors.server.js`
- `app/lib/wholesale-intake.server.js`
- `app/lib/wholesale-intake.test.mjs`
- `app/lib/shopify-checkout.server.js`
- `app/lib/shopify-checkout.test.mjs`
- `app/routes/webhooks.orders.paid.jsx`
- `app/routes/app.orders.$id.jsx`
- `middleware.js`
- `react-router.config.js` (only if the target repo doesn't already use `vercelPreset`)
- `prisma/schema.prisma` — merge in the `WholesaleOrder` + `WholesaleOrderItem` models (do **not** overwrite an existing `Session` model unless identical)
- `prisma/migrations/20260930105021/` — or generate a fresh migration in the target repo (preferred) via `prisma migrate dev --name wholesale_orders`
- `scripts/add-wholesale-variants.mjs`
- `shopify.app.toml` — merge the `orders/paid` webhook subscription + `read_orders` scope

Config to update in the target repo:
- Replace the two hardcoded staging `DEFAULTS` origins in `middleware.js` and `app/lib/cors.server.js` with the production storefront origin(s).
- Set `SHOPIFY_SHOP_DOMAIN`, `DATABASE_URL`, and (optionally) `ALLOWED_STOREFRONT_ORIGINS` in the production env.
- Re-enable `checkout_url` in `api.wholesale-orders.jsx` once every theme payload line has a `variant_id` (see §5).

---

## Theme-side contract (what the theme must do)

For completeness, the storefront theme (in its own repo) is expected to:

1. Send `POST https://<app-host>/api/wholesale-orders` with `Content-Type: application/json` and the body shape in §1.
2. Handle the response:
   - `200` → read `order_id` and `checkout_url`. If `checkout_url` is non-null, `window.location.assign(checkout_url)`. If null, show a "we'll follow up" confirmation UI.
   - `400` → show per-field errors from the `fields` map.
   - `405` / `500` → generic error.
3. The theme's origin **must** be in the app's allowlist (§3) — either in `DEFAULTS` or in `ALLOWED_STOREFRONT_ORIGINS`.
