# 08 — Order details upsell (customer account UI extension)

## Target surface
Order status page inside **customer accounts** (also the thank-you page
after checkout — Shopify renders both from the same template now).
Design source: `docs/post-purchase-design-lovable/src/routes/tracking.tsx`.

Correct target: `customer-account.order-status.cart-line-list.render-after`
(renders a block right below the order's line items — exactly where the
Lovable mock puts the carousel). API version `2026-07`.

## Scaffolding
```
shopify app generate extension --template customer_account_ui \
  --name dogbook-order-upsell
```

Resulting layout mirrors `extensions/dogbook-checkout-upsell/`:
```
extensions/dogbook-order-upsell/
  shopify.extension.toml           target = customer-account.order-status.cart-line-list.render-after
  src/
    OrderUpsell.jsx                preact root
  package.json
```

## Reused code
- `_shared/useOffers.js` — exports `fetchOffers`, `filterNotInCart`,
  `formatMoney`. Lift it as-is; add a `filterNotInOrder(offers,
  purchasedVariantGids)` sibling that mirrors `filterNotInCart`. The
  post-purchase extension already does this filter inline — move the
  filter into `_shared` so both consume the same function.
- `_shared/tokens.js` — add `UPSELL_SOURCE_ORDER = "order-status"`
  alongside the two existing constants.

## Flow
1. On mount, read `shopify.order.value` → extract `purchasedVariantGids`
   and `shopDomain`.
2. `fetchOffers(APP_URL, {shopDomain, productIds: purchased})` → same
   endpoint, same response shape.
3. Render the carousel using the same preact `s-*` primitives the checkout
   extension already uses — the components port straight over. One shared
   `BreedCarousel` component in `_shared/` would de-dupe checkout + this
   extension; defer until the second port actually proves the shape is
   stable.

## The hard constraint — "Add to my order" is a lie
Lovable's design says the new book "ships with your Beagle — $0 extra
shipping". **Shopify does not let a customer-side extension amend a
placed order.** Options:

- (a) **Button creates a NEW cart** with the upsell variant +
  `_upsell_source: order-status` attribute + a `_bundle_with_order:
  <order-name>` note, then redirects to a one-click checkout
  (`shopify.navigation.navigate('/cart')` or we build a Shop Pay link).
  Shipping is a separate transaction; "ships together" is best-effort,
  not guaranteed.
- (b) **Backend creates a draft order** linked to the original (via
  Admin API) and emails/surfaces a one-click pay link. Requires
  `write_draft_orders` scope + a new app route. Heavier.
- (c) **Honest copy** — change "Add to my order" to "Add to a new order"
  and drop the shipping promise. Zero backend work.

Recommend (a) + (c): new-cart redirect, and copy that says "Add — ships
separately unless combined by Shopify at fulfillment". Lovable's shipping
promise is UX aspiration we don't own.

## Discount wiring
Add `"order-status"` to the Function's attribute match:
`== "checkout" || == "cart" || == "order-status"`. Same metafield,
same percent, no new admin discount needed.

## Timer
Lovable shows a 24h countdown. Post-purchase has 10min
(`POST_PURCHASE_OFFER_SECONDS`). For order-status, 24h is defensible —
it's the "come back and finish" window. Store deadline in the order's
`$app:upsell_offer_expiry` metafield at order creation (webhook) so
reloads don't reset it. Defer until merchant asks for persistence;
start with a session-local timer (same approach as post-purchase, just
with `24 * 3600` as the seed).

## Testing checklist
1. Place a test order with one dogbook variant.
2. Open the order from the customer account → carousel renders below
   line items, excludes the already-purchased variant.
3. Click a tile's ADD → navigates to `/cart` with the new variant +
   `_upsell_source: order-status` property.
4. Proceed through checkout → Function (after the attribute update)
   applies the 20% discount.

## Scope
- No new OAuth scopes for option (a). Option (b) adds
  `write_draft_orders`.
- API version `2026-07` or later (customer account UI extensions
  minimum for the `cart-line-list.render-after` target).

## Order of operations
1. Extend the Function to match the three attribute values (one line in
   `cart_lines_discounts_generate_run.rs`).
2. Scaffold the customer account extension.
3. Port the checkout carousel component to it.
4. Add the "new cart redirect" button wiring.
5. Deploy, test.

Step 1 is independent and ships first — unblocks the cart block (plan 07)
simultaneously.
