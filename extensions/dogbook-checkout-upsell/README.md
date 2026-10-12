# dogbook-checkout-upsell

Checkout UI extension — green-bordered offer panel in the right rail,
rendered above Shopify's native order summary. Spec:
`docs/post-purchase/03-checkout-cross-sell.md`.

Target: `purchase.checkout.cart-line-list.render-after`. Requires
Shopify Plus.

Add-to-cart writes attribute `_upsell_source=checkout` on the new line;
the `dogbook-upsell-discount` Shopify Function reads that attribute and
applies the configured percent off.

Offer source + discount percent come from the app's
`/api/post-purchase/offer` endpoint (see `extensions/_shared/useOffers.js`).

Test:
1. On a Plus dev store, start a checkout with any book in cart.
2. Green panel renders above Shopify's order summary.
3. Carousel scrolls (native scroll only); arrows change selection without
   auto-scrolling the strip.
4. Click ADD → cart line added; order summary updates; panel swaps to
   "Added to your order" with the breed name.
5. Confirm the Function applied the 20% discount at the real totals.
