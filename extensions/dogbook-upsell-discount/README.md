# dogbook-upsell-discount

Shopify Function (Discount API) that applies the configured percent off to
any cart line added by the checkout upsell extension.

Target: `cart.lines.discounts.generate.run`.

Trigger: cart line with attribute `_upsell_source == "checkout"` (written by
`extensions/dogbook-checkout-upsell` when the shopper clicks ADD).

Percent: reads from the DiscountNode metafield
`app.upsell_discount_percent`. Falls back to 20 if unset.

### Activating the function

Shopify Functions aren't automatic. After deploying the app, create an
automatic discount in Shopify admin referencing this function:

1. Admin → Discounts → Create discount → App discounts →
   `dogbook-upsell-discount`.
2. Type: Automatic.
3. Combinations: Product discounts can combine with Order + Shipping.
4. Status: Active.

Then set the DiscountNode metafield so the function picks up the
app-configured percent:

```graphql
mutation {
  metafieldsSet(metafields: [{
    ownerId: "gid://shopify/DiscountAutomaticNode/XXXXXX"
    namespace: "app"
    key: "upsell_discount_percent"
    type: "number_integer"
    value: "20"
  }]) {
    userErrors { field message }
  }
}
```

(This can be automated from the admin app's save handler once we wire it;
for v1 it's a one-time step.)
