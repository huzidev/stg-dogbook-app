# 00 — Feature Overview

## Goal
Capture wholesale order intake from a form on the storefront ("Before we ship your order, tell us more about your shop"), persist it in this app's DB, then hand the buyer off to Shopify's checkout with the cart prefilled. Mark the record paid once Shopify confirms payment.

## End-to-end flow
1. **Storefront form** (route TBD — caller side) — buyer fills shop name, URL, sales channel, business address, invoice address. Order line items are already known on the calling page.
2. **POST to this app** — form action calls our public endpoint (details in `02-api-endpoint.md`).
3. **This app persists** the intake as a `WholesaleOrder` with `isPaid=false` and returns a checkout redirect URL (details in `03-shopify-checkout-redirect.md`).
4. **Buyer completes checkout** on Shopify — cart is prefilled, address is pre-filled from what we captured. A cart attribute (`wholesale_order_id`) carries our record ID through checkout.
5. **Shopify `orders/paid` webhook** fires → we look up the record by the attribute and flip `isPaid=true` (details in `04-webhook-payment-confirmation.md`).

## Data captured (from the theme-side contract)
Wire format is snake_case, sent by the storefront theme as `application/json`.

- `shop_name` — string, required
- `store_url` — string, required
- `channel` — string, one of `"Online" | "Offline" | "Both"`, required
- `business_address` — string, required
- `invoice_address` — string, always sent (theme mirrors business address when "Same as" is checked)
- `currency` — string, top-level, `"USD"` for now
- `totals` — `{ units: int, price: number }` (price in major units / dollars)
- `lines[]` — each item has:
  - `handle` — string, required (breed handle)
  - `name` — string, required (display name, e.g. "Beagle")
  - `count` — int, required (quantity)
  - `price` — number, required (per-copy in dollars)
  - `variant_id` — string, **nullable** (null when merchant hasn't attached a Shopify product to that breed)
  - `product_title` — string, **nullable** (same reason)

Server derives / stores:
- `isPaid` — boolean, default `false`
- `shopifyOrderId`, `shopifyOrderName`, `paidAt` — nullable, filled by the webhook

## Storage vs. wire
- Wire uses **dollars**; storage uses **cents** (Int) to avoid float drift. Convert at the API boundary.
- Wire uses **snake_case**; DB uses camelCase (Prisma convention). One small mapping in the handler.
- `channel` stored as a String column with a 3-value validator, not a Prisma enum — keeps migrations lighter and matches the wire labels directly.

## Handling lines with `variant_id = null`
The merchant may not have attached a Shopify product to every breed yet. Those lines still get persisted, but they can't be added to Shopify's cart URL. Behavior:
- Persist every line (variantId nullable in the DB).
- When building the checkout URL, include only lines with a `variant_id`; append the missing lines to the checkout `note` so the merchant sees them in the admin.
- If **every** line is missing `variant_id`, respond 200 with the saved order id but a null `checkout_url` — theme decides whether to redirect. (See open items.)

## Non-goals (skipped on purpose)
- Auth on the intake endpoint beyond a shared secret / HMAC — YAGNI until you tell me who else can hit it.
- Admin UI for browsing intakes — not in the ask.
- Email receipts — not in the ask.
- Retry/queue infra for the webhook — Shopify already retries failed webhooks.

## Section index
- `01-database.md` — Postgres switch + Prisma schema for `WholesaleOrder`.
- `02-api-endpoint.md` — public POST endpoint that receives the form.
- `03-shopify-checkout-redirect.md` — building the checkout URL with prefilled cart + shipping.
- `04-webhook-payment-confirmation.md` — `orders/paid` handler that sets `isPaid=true`.
- `05-vercel-deployment.md` — Vercel target (first deploy).
- `06-heroku-deployment.md` — Heroku target (later).

## Answers locked
1. Caller — storefront theme. Cross-origin from `<storefront>.com` → our Vercel host. CORS must allow the storefront origin.
2. Line items include Shopify `variant_id` **and** `product_title` (both nullable — merchant may not have attached a product to a breed yet).
3. Endpoint is **public** — no shared secret, no HMAC. Theme calls it directly from the browser.
4. Currency always `"USD"` for now; sent as a top-level field so it's easy to switch later.
5. **Redirect** — theme reads `checkout_url` from the 200 body. Non-empty string → `window.location.href = data.checkout_url`. Null (or field omitted) → theme shows its existing "we've received your details, we'll follow up" state. Same behavior for any 2xx without a URL, so we don't need a separate flag.
6. **Response contract with the theme** — `{ "checkout_url": string | null }`. Anything else we return (e.g. `order_id`) is ignored by the theme, so we can keep it for our own logs/support without breaking anything.

## No remaining open items
All contract questions closed. Ready to implement starting with `01-database.md`.
