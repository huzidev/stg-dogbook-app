# extensions-update-v2 — Overview

**Status:** proposal, pending user audit. No code touched yet.

## What's broken today

Two extensions that both exist and build, but neither matches the Lovable
design and the shared data layer is heavier than it needs to be.

1. **`dogbook-checkout-upsell`** (Checkout UI, Polaris web components,
   `purchase.checkout.cart-line-list.render-after`).
   - Tiles render as a 2-column grid, not a horizontal scrolling strip.
   - Tile images blow out to full column width (no `inlineSize` on
     `s-image`).
   - The green mint accent panel is actually transparent / grey — hex
     colors on `background` are silently ignored by Polaris web
     components; the primitive only accepts the enum keywords.
   - Carousel has no visible scrollbar / swipe affordance.

2. **`wholesale-post-purchase`** (`@shopify/post-purchase-ui-extensions-react`,
   `Checkout::PostPurchase::Render`).
   - Offer banner shows no mint background and no border (same hex-color
     problem — the older React library's `background` prop takes
     appearance keywords, not hex).
   - Tiles render as four fat full-width cards instead of a tight
     carousel of narrow book covers.
   - Only four tiles because the metaobject is only configured with four
     variants — not a bug, but worth confirming the merchant intends to
     list all 13.
   - "Back to the offer" ghost reset button is still shipping; it's a
     dev-only control the spec says to drop in prod.

3. **Shared data layer** today:
   - A custom metaobject type `$app:post_purchase_offer` with
     variant list + discount percent + enabled + priority + trigger
     product. Four fields to store what is really one JSON blob.
   - A public `GET /api/post-purchase/offer` endpoint on the Vercel app
     that both extensions hit on render. Needs CORS, no auth, and a cold
     start.
   - Discount is **not wired** on checkout — the README says the merchant
     must create a manual admin discount. That is fragile, invisible to
     the extension, and will drift from the `-20%` pill shown in the UI.

## What this plan covers

Six section files, each small enough to audit on its own:

- `01-current-state-audit.md` — exact files, exact bugs, exact
  root causes with line references. Verifies the diagnosis above.
- `02-post-purchase-plan.md` — concrete per-file rewrites for the
  post-purchase extension to match the Lovable design within the
  real primitives of `@shopify/post-purchase-ui-extensions-react`.
- `03-checkout-upsell-plan.md` — concrete per-file rewrites for the
  checkout extension to match the Lovable right-rail design within
  the primitives of `@shopify/ui-extensions/preact` + the
  Polaris web components (`s-*`).
- `04-data-model-and-backend.md` — the lazy data layer: shop
  metafield instead of metaobject, and whether we can drop the
  `/api/post-purchase/offer` round-trip entirely on the checkout
  surface.
- `05-discount-wiring.md` — a tiny Shopify Function (Product
  Discount) keyed off the `_upsell_source` cart line attribute, so
  the −20% pill is real instead of hoping the merchant set up a
  matching admin discount.
- `06-migration-and-rollout.md` — order of operations: ship the
  Function + metafield first (no visible change), then flip each
  extension to the new look. Rollback is `git revert` per step.

## Guiding principles (ponytail)

- Keep both extensions on the stacks they're already on — no library
  migration unless Shopify forces one.
- Prefer Shopify-native primitives (keyword `background`, `s-banner`,
  `s-product-thumbnail`, `s-scroll-box`) over custom CSS or hex colors
  that the primitive silently drops.
- Collapse the metaobject down to a single shop metafield (JSON of
  variant GIDs + percent). The admin page already has the picker;
  switching the storage shape is five lines.
- Only build the Shopify Function once; both surfaces then get a real
  discount without any UI changes.
- Nothing in this plan is a rewrite — every section is a bounded diff
  on files that already exist.

## Non-goals

- No change to `app._index`, `app.additional`, wholesale, webhooks,
  Prisma schema, auth, or any other route outside the two extensions
  and the offer API.
- No change to `shopify.app.toml` scopes (we already have
  `write_metaobjects`; the metafield switch removes a dependency
  rather than adding one).
- No new npm dependencies in either extension — Polaris web components
  and `@shopify/post-purchase-ui-extensions-react` already ship what we
  need.
- No analytics / event tracking changes.

## Order of audit

Read in this order and the plan reads top-down:

1. `01-current-state-audit.md`
2. `02-post-purchase-plan.md`
3. `03-checkout-upsell-plan.md`
4. `04-data-model-and-backend.md`
5. `05-discount-wiring.md`
6. `06-migration-and-rollout.md`

Each section ends with an **Open questions** block. Resolve those
before anyone writes code.
