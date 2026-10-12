# dogbook-checkout-upsell

Checkout UI extension — green-bordered offer panel in the right rail,
rendered above Shopify's native order summary. Spec:
`docs/post-purchase/03-checkout-cross-sell.md`.

Target: `purchase.checkout.cart-line-list.render-after`. Requires
Shopify Plus.

### Discount wiring (manual, for now)

The checkout API has no per-line inline discount. Our ADD button writes
attribute `_upsell_source=checkout` on the new cart line as a marker, but
nothing is applied automatically yet.

Until the Shopify Function is wired up (follow-up PR), the merchant must
create one **automatic discount** in Shopify admin → Discounts → Automatic
discount, scoped to the collection containing the upsell variants, with
the configured percent off. The pills in the panel are just copy — the
actual discount amount comes from that admin discount.

Offer source + discount percent come from the app's
`/api/post-purchase/offer` endpoint (see `extensions/_shared/useOffers.js`).

Test:
1. On a Plus dev store, start a checkout with any book in cart.
2. Green panel renders above Shopify's order summary.
3. Carousel scrolls (native scroll only); arrows change selection without
   auto-scrolling the strip.
4. Click ADD → cart line added; order summary updates; panel swaps to
   "Added to your order".
5. Confirm the admin's automatic discount applied the 20% at the real
   totals (while the Function is still a TODO).
