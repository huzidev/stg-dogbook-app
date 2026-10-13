# 05 — Discount wiring

## Where discounts live today

| Surface | Mechanism | Status |
|---|---|---|
| Post-purchase | Inline `discount: {value, valueType: "percentage"}` in the `add_variant` changeset; signed by `/api/post-purchase/sign` and applied by `applyChangeset` | **Works.** This is the only Shopify-sanctioned way to discount a post-purchase add, and it's wired correctly. Do not touch. |
| Checkout (pre-purchase) | `applyCartLinesChange` adds the line, writes `_upsell_source=checkout` attribute. Nothing else. | **Broken.** The −20% pill is a lie; the merchant has to maintain a hand-rolled admin automatic discount keyed off the collection. |

So this section is about the **checkout** surface only.

## Proposal: ship a Product Discount Shopify Function

A Function that:

1. Reads the cart lines.
2. Finds any line with attribute `_upsell_source == "checkout"`.
3. Applies the configured % off to that line.

The configured % comes from the same shop metafield as the offer
(section 04). The Function has read access to shop metafields in
`input.query`.

### New extension

```
extensions/dogbook-upsell-discount/
  shopify.extension.toml
  src/
    index.ts     Function entry
    run.graphql  input query
  package.json
```

Use the Shopify CLI to scaffold:

```
shopify app generate extension --template product_discounts \
  --name dogbook-upsell-discount
```

### Function logic (pseudo-TS, final goes in src/run.ts)

```ts
export function run(input): FunctionRunResult {
  const metafield = input.shop.metafield;        // declared in run.graphql
  const config = JSON.parse(metafield?.value ?? "null");
  const percent = Number(config?.discountPercent ?? 0);
  if (!percent) return { discounts: [] };

  const targets = input.cart.lines
    .filter(line => line.attribute?.value === "checkout")
    .map(line => ({ cartLine: { id: line.id } }));

  if (!targets.length) return { discounts: [] };

  return {
    discounts: [{
      targets,
      value: { percentage: { value: percent.toString() } },
    }],
    discountApplicationStrategy: "FIRST",
  };
}
```

### Input query (run.graphql)

```graphql
query Input {
  cart {
    lines {
      id
      attribute(key: "_upsell_source") { value }
    }
  }
  shop {
    metafield(namespace: "app", key: "post_purchase_offer") { value }
  }
}
```

### `shopify.extension.toml` for the Function

```toml
api_version = "2025-10"

[[extensions]]
name = "dogbook-upsell-discount"
handle = "dogbook-upsell-discount"
type = "function"

[[extensions.targeting]]
target = "cart.lines.discounts.generate.run"
input_query = "src/run.graphql"
export = "run"

[extensions.build]
command = "npm run build"
path = "dist/function.wasm"
```

### Merchant setup (one-time, scripted by the app)

A Product Discount function has to be *activated* by the merchant via
a Discount they create in admin:

- Admin → Discounts → Create automatic discount → "Dog Book upsell".
- Pick the function.
- Save.

Nothing else. The Function reads the metafield each run, so changing
the percent in the admin page (section 04) immediately changes what the
Function applies.

Alternative: have the app's install hook (or a button in the admin
page) create this automatic discount via Admin API
(`discountAutomaticAppCreate`). Lazier for the merchant, same end
state.

## Attribute vs. tag

Current implementation writes `_upsell_source=checkout` as a line
attribute. Keep it. Tags would require writing to the product itself
and would apply to *all* orders of that product, not just the upsell
instances.

## Scope impact

- Add `write_discounts` to `shopify.app.toml` scopes **only if** we
  automate the Discount creation. If we leave that to the merchant,
  no scope change.
- Function extensions don't require new OAuth scopes beyond the
  existing app installation.

## Deletions once this lands

- `extensions/dogbook-checkout-upsell/README.md` lines about "the
  merchant must create one **automatic discount**" go away.
- The `-20%` pill is no longer a lie; nothing to delete, but the
  copy stops being aspirational.

## Testing checklist

1. On a dev store, set `app.post_purchase_offer` metafield to
   `{"variantGids":["gid://.../42"],"discountPercent":20}`.
2. Install the Function; activate the automatic discount in admin.
3. Checkout with the base product in cart.
4. Panel renders → click ADD → new line added with attribute.
5. Shopify totals drop by 20% on the upsell line only.
6. Change `discountPercent` to 15 in the app admin → refresh checkout
   → Function picks up the new value without an extension redeploy.
7. Remove the attribute (edit cart manually) → discount disappears.

## Decisions (resolved)

1. **Pill copy changes to `SHIPS TOGETHER`.** Making `$0 EXTRA
   SHIPPING` literally true needs either a Delivery Customization
   function or `requires_shipping: false` variants — both out of scope.
   `SHIPS TOGETHER` is honest for the "second line goes in the same
   box" case.
2. **Shopify Function, driven by the app config.** The percent on the
   UI pill and the percent actually applied at checkout both come from
   the same shop metafield, so they can never drift. No manual
   merchant discount creation.
3. **Scripted activation on install:** when the merchant installs or
   first visits the admin page, call `discountAutomaticAppCreate` to
   create the automatic discount pointing at the Function. One-time,
   idempotent (check for an existing discount with our handle before
   creating). This adds `write_discounts` to the OAuth scopes —
   batched with §04's scope removal to minimize re-grant prompts.
