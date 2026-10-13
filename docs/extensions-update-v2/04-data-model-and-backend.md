# 04 — Data model + backend simplification

Today's picture:

```
Admin UI  →  metaobject $app:post_purchase_offer  (5 fields, 1 used shape)
                      ↓
             GET /api/post-purchase/offer     (Vercel route, CORS, no auth)
                      ↓
        extensions ← JSON { offers, discountPercent }
```

Both extensions fetch from the same endpoint on every render. The
metaobject is a general-purpose storage shape we're using for exactly
one row ("the default offer").

## Proposal: shop metafield, no custom API

Store the config as a single JSON on the shop metafield:

```
namespace: "app"
key:       "post_purchase_offer"
type:      "json"
value:     { "variantGids": ["gid://shopify/ProductVariant/…", ...],
             "discountPercent": 20 }
```

Why this is lazy:

- **Zero schema.** No metaobject definition, no 5-field upsert, no
  resource-picker-feeding-metaobject-field plumbing. Just a JSON blob.
- **Scope reduction.** Drop `write_metaobjects` and
  `write_metaobject_definitions` from `shopify.app.toml` scopes. Only
  `write_products` (already there for the admin picker) and
  `write_metafields` remain. Smaller install prompt.
- **Native extension access.** Checkout extensions can declare a shop
  metafield in `shopify.extension.toml` and read it directly via
  `useAppMetafields` — no HTTP round-trip, no CORS, no cold start.
- **Post-purchase still fetches from app** (post-purchase extensions
  can't declare metafields the same way). But its request shrinks to
  "load one metafield + hydrate N variants".

## Reader shapes

### Checkout extension (new path)

```jsx
// shopify.extension.toml
[[extensions.metafields]]
namespace = "app"
key = "post_purchase_offer"
owner_type = "SHOP"

// CheckoutUpsell.jsx
import { useAppMetafields } from "@shopify/ui-extensions/preact";

const metafields = useAppMetafields({
  namespace: "app",
  key: "post_purchase_offer",
  type: "shop",
});
const config = JSON.parse(metafields[0]?.metafield?.value ?? "{}");
```

Then hydrate variant details via the Storefront API (which this
extension already has free access to) using the GIDs — no app backend
needed.

If Storefront access to variant details by GID is awkward, keep the
`GET /api/post-purchase/offer` call for hydration only (just the
variant fetch, drop the metaobject lookup). Section 06 flags this as
the fallback.

### Post-purchase extension (unchanged shape, simplified body)

Still hits `GET /api/post-purchase/offer`. The route body shrinks to:

```js
export const loader = async ({ request }) => {
  const shop = /* parse + validate */;
  const { admin } = await unauthenticated.admin(shop);
  const metafield = await admin.graphql(`
    query { shop { metafield(namespace:"app", key:"post_purchase_offer") { value } } }
  `);
  const config = JSON.parse(metafield.body.data.shop.metafield?.value ?? "null");
  if (!config?.variantGids?.length) return json({ offers: [] });
  const offers = await hydrateVariants(admin, config.variantGids);
  return json({ offers, discountPercent: config.discountPercent });
};
```

- Delete `resolveFromMetaobjects` (lines 51-125).
- Delete `resolveFromMetafield` legacy JSON path.
- Delete `normalizeLegacyOffer`.
- Keep `hydrateVariants` and the CORS helpers.
- Net result: the route goes from 252 lines to ~80.

## Admin UI changes

**File:** `app/routes/app.post-purchase.jsx`

- Loader: read shop metafield instead of metaobject by handle.
- Action: `metafieldsSet` mutation with a single JSON value, instead
  of `metaobjectUpsert` + four field objects.
- The resource picker + variant list + reorder UI stays exactly the
  same (lines 185-306). Only the save/load bodies change.

```js
// action()
await admin.graphql(`
  mutation Save($value: String!) {
    metafieldsSet(metafields: [{
      ownerId: "gid://shopify/Shop/0",   // actual shop GID from session
      namespace: "app",
      key: "post_purchase_offer",
      type: "json",
      value: $value,
    }]) { userErrors { field message } }
  }
`, { variables: { value: JSON.stringify({ variantGids, discountPercent }) } });
```

Note the `ownerId` on `metafieldsSet` for a shop metafield needs the
real shop GID; grab it from `session.shop` → `shop.id` query at the
top of the action, or use the `Shop` query result at load time and
cache it in a hidden form field.

## Deletions enabled

Once this lands we can delete (not merely orphan):

- `app.post-purchase.jsx` admin page: only the server loader/action
  bodies change; delete nothing.
- `api.post-purchase.offer.jsx`: delete `resolveFromMetaobjects`,
  `resolveFromMetafield`, `normalizeLegacyOffer`, `METAOBJECT_TYPE`,
  the legacy-offer branch — ~140 lines.
- `shopify.app.toml`: remove `write_metaobjects,
  write_metaobject_definitions` from scopes; delete the
  `[metaobjects.app.example]` block (template cruft, not even used).
- `extensions/_shared/tokens.js`: delete the hex color map; nothing
  consumes it after the extension updates in sections 02 and 03.
  Keep `POST_PURCHASE_OFFER_SECONDS` + `UPSELL_SOURCE_*` only.

Net LOC change (estimated): −280.

## Decisions (resolved)

1. **Checkout extension reads shop metafield via `useAppMetafields`;
   hydrates variants via Storefront API (`nodes(ids:)` returns
   `ProductVariant.title`, `image`, `price`, `compareAtPrice`,
   `product.title`, `product.featuredImage`).** The app backend
   round-trip is removed from the checkout surface entirely. If
   Storefront access to a variant by GID turns out to be gated (e.g.
   unpublished variants), fall back to the slimmed
   `/api/post-purchase/offer` for hydration only.
2. **Scope removal batched with any scope add in §05** — one re-grant
   prompt max. Staging store, no live install coordination needed.
3. **Metafield shape:** `type: "json"` with
   `{ "variantGids": [...], "discountPercent": 20 }`. Single blob,
   admin UI shape untouched, Function reader is one `JSON.parse`.
