# Dog Book Upsell — Implementation Overview

Two surfaces offer the same 20%-off add-a-book upsell, backed by one Shopify
Function that applies the discount. Hand this file to a fresh Claude Code
session in the production repo to replicate the feature end-to-end.

## What it does

1. Merchant admin picks the upsell variants + percent in the app.
2. Every order confirmation email shows a hero banner with those variants,
   an inline live countdown GIF, and a per-variant **Add** button.
3. The customer-account **Order status** page shows the same offer as a
   carousel for 5 minutes after order placement.
4. Clicking **Add** opens a Shopify cart permalink. The Shopify Function
   sees the `_upsell_source` + `_upsell_variant` cart attributes and applies
   the discount only to the matching line.

## Architecture

```
Shopify Admin (merchant edits)
   │
   ├── writes metafield shop.app.post_purchase_offer   (variants + %)
   └── writes metafield shop.app.email_upsell_snapshot (for Liquid)
         │
         ├── Order confirmation email (Liquid → inboxtimer.app for GIF)
         │     clicking Add → cart permalink → Shopify Function → discount
         │
         └── customer-account Order Status UI extension
               loads offers from /api/post-purchase/offer
               clicking Add → cart permalink → same Shopify Function
```

The **Vercel timer endpoint** (`/api/timer`, `/api/timer.gif`) is **not
needed** — we switched to inboxtimer.app for the email countdown.

---

## Files

### Shopify Function (discount application)

| Path | Purpose |
|---|---|
| `extensions/dogbook-upsell-discount/shopify.extension.toml` | Function manifest, target `cart.lines.discounts.generate.run` |
| `extensions/dogbook-upsell-discount/src/index.js` | Rust-free JS function; discounts only lines where `_upsell_variant` matches a configured variant id |
| `extensions/dogbook-upsell-discount/src/cart_lines_discounts_generate_run.graphql` | Input query — reads cart attributes + discount metafield |

Key logic in `index.js`:
- Requires `discountClasses` to include `Product`.
- Requires valid `_upsell_source` cart attribute (`order-confirmation`, `order-status`, `checkout`, `cart`).
- Requires `_upsell_variant` attribute on the cart matching one of the configured variant ids from the discount metafield `$app.function-configuration` (the tamper guard — catalog adds that happen to share the same variant id but no attributes won't get discounted).

### Customer-account UI extension (Order Status block)

| Path | Purpose |
|---|---|
| `extensions/dogbook-order-upsell/shopify.extension.toml` | Target `customer-account.order-status.block.render`; needs `api_access = true` + `network_access = true` |
| `extensions/dogbook-order-upsell/src/OrderStatusBlock.jsx` | Preact component. Loads offers via `fetchOffers`, filters out variants/products already purchased, renders the 2-col card grid, countdown, and Add buttons |
| `extensions/_shared/useOffers.js` | `fetchOffers(appUrl, {shopDomain, productIds})` + `APP_URL` constant |
| `extensions/_shared/tokens.js` | Color tokens + `UPSELL_SOURCE_KEY` + `UPSELL_SOURCE_CHECKOUT` |

Card click builds a cart permalink:
```
https://{shop}/cart/{variantId}:1?attributes[_upsell_source]=order-status
  &attributes[_upsell_variant]={variantId}
  &note=bundle_with_{orderName}
```

Countdown is 5 minutes (`OFFER_SECONDS = 5 * 60`).

### Email notification (Liquid)

| Path | Purpose |
|---|---|
| `docs/order-confirmation-email.liquid` | The full HTML/Liquid email. Paste into **Shopify Admin → Settings → Notifications → Order confirmation → Edit code** (replace body) |

What it reads from Shopify:
- `shop.metafields.app.email_upsell_snapshot` — the JSON written by the admin page
- `line_items` — to filter out already-purchased variant/product ids
- Standard notification vars: `email`, `order_status_url`, `shop.url`, `shop.email`, `shop.name`

Countdown GIF: hosted embed from **inboxtimer.app**. The `<img>` is sized
93×30 inside a nowrap table-row so it renders inline between the text
`"Order in the next 00:00:00 to get N% off."` The `rid={{ email }}` query
param gives each recipient their own Gmail-proxy cache entry.

Each card's **Add** button links to the same cart permalink pattern as the
customer UI extension. Discount math:
```
v_discounted = variant.price * (100 - percent) / 100
```
(Prices are dollars in the snapshot; `| times: 100.0 | money` converts to the
localized money string.)

### Admin app routes (React Router v7 / Remix-style)

| Path | Purpose |
|---|---|
| `app/routes/app.post-purchase.jsx` | Admin page — merchant chooses variants + %, saves the metafield, also writes the `$app.function-configuration` discount metafield and (first time) auto-creates the automatic discount bound to the function handle `dogbook-upsell-discount` |
| `app/routes/app.upsell-settings.jsx` | Read-only status page showing what's live |
| `app/routes/app.upsell-tracking.jsx` | Conversion report (reads `UpsellConversion` Prisma table) |
| `app/routes/api.post-purchase.offer.jsx` | Public GET `/api/post-purchase/offer?shop={shop.myshopify.com}` — returns `{ offers, discountPercent }` for the customer UI extension |

### Supporting Shopify metafields

| Namespace | Key | Written by | Read by |
|---|---|---|---|
| `app` | `post_purchase_offer` | `app.post-purchase.jsx` | `/api/post-purchase/offer` |
| `app` | `email_upsell_snapshot` | `app.post-purchase.jsx` | Liquid email |
| `$app` | `function-configuration` | `app.post-purchase.jsx` | Shopify Function |

### Prisma (optional analytics)

| Model | Purpose |
|---|---|
| `UpsellConversion` | One row per converted upsell (shop, orderId, variant, source, linePrice, discountAmount). Written by the storefront webhook/order-created handler if you wire it up. Read by `app.upsell-tracking.jsx` |

---

## Shopify configuration (do this in Admin)

1. **App scopes** (in `shopify.app*.toml`):
   ```
   scopes = "write_products,write_discounts,read_orders,write_shipping"
   ```
2. **Install the app**, then open the post-purchase admin page — it auto-provisions:
   - The `$app.function-configuration` metafield definition.
   - One automatic discount bound to function handle `dogbook-upsell-discount` with title "Dog Book upsell".
3. **Pick variants + percent** in the admin UI. Save.
4. **Paste** `docs/order-confirmation-email.liquid` into **Settings → Notifications → Order confirmation** → Edit code → replace body → Save.
5. **Deploy extensions**:
   ```
   shopify app deploy -c <config>
   ```
   (`shopify.app.staging.toml` for staging; `shopify.app.toml` for prod.)

### Shopify Function metafield definition

If auto-provision fails, create manually:
- Owner type: Discount
- Namespace: `$app`
- Key: `function-configuration`
- Type: `json`

Schema stored: `{ "variantIds": ["gid://shopify/ProductVariant/..."], "discountPercent": 20 }`

---

## Deps

In `package.json`:
- `@shopify/shopify-app-react-router` — app server adapter
- `@shopify/shopify-app-session-storage-prisma` — session storage
- `@prisma/client`, `prisma` — session + analytics
- `react-router`, `react`, `react-dom`

Extension packages (per extension `package.json`):
- `@shopify/ui-extensions/preact` + `preact` — for `dogbook-order-upsell`
- `@shopify/shopify_function` + generated types — for `dogbook-upsell-discount`

**No Vercel-specific deps are required** for the live feature. (`satori`,
`@resvg/resvg-js`, `gifenc` exist in the repo for the legacy `/api/timer*`
route but are **unused** by this feature — the email uses inboxtimer.app
instead.)

---

## Deploy checklist (production)

1. `shopify app config use <production-config>` (or create one).
2. `shopify app deploy` — pushes both extensions.
3. In Shopify Admin:
   - Open the app → post-purchase admin page → pick variants + %.
   - Paste Liquid into order-confirmation notification.
   - Verify the automatic discount "Dog Book upsell" is active.
4. Send a test order confirmation → open in Gmail → click Add → confirm the discount applies at checkout.
5. Place a test order → open the Order status page → confirm the extension shows the carousel with Add buttons.

---

## Known limits / design choices

- Email countdown via inboxtimer.app — Gmail image-proxy caches after first open, so the first open ticks live, subsequent opens show the frozen state. This is a Gmail limitation, not fixable server-side.
- Email can't track click-to-select, so each tile has its own cart permalink + Add button (no "selected" state).
- Outlook renders inline-block tiles as stacked blocks; the horizontal-scroll carousel degrades to a wrapped grid. Acceptable.
- Customer UI timer is purely visual — the backend expiration (5 min) is tracked by the discount's rule set in Shopify, not the UI.

## Files intentionally left behind (safe to delete in production)

- `app/routes/api.timer.jsx` and `app/routes/api.timer[.]gif.jsx` — the Vercel countdown service we replaced with inboxtimer.app.
- `prisma/migrations/20261111144254_add_email_timer/` and the `EmailTimer` Prisma model — leftover from the Vercel-timer experiment.
- `satori`, `@resvg/resvg-js`, `gifenc` in `package.json` — only used by the above routes.

Deleting them removes ~20 MB of deps and one unused route surface.
