# 07 — Cart upsell (theme app extension)

## Target surface
Cart drawer **and** `/cart` page. Both are rendered by the merchant's theme
Liquid — Shopify has no Checkout UI Extension target for the online-store
cart. So this ships as a **theme app extension** (one Liquid block that OS
2.0 themes merge in via `type: "@app"`).

Source of truth: `docs/post-purchase-design-lovable/src/routes/panier.tsx`
("Complete your collection" section inside the cart aside).

## Scaffolding
```
shopify app generate extension --template theme_app_extension \
  --name dogbook-cart-upsell
```

Resulting layout:
```
extensions/dogbook-cart-upsell/
  shopify.extension.toml
  blocks/
    complete-collection.liquid    (schema + markup)
  assets/
    complete-collection.css       (only if we can't inline)
    complete-collection.js        (ajax add + fade-on-scroll)
  snippets/
    complete-collection-item.liquid
  locales/
    en.default.json
```

## Block contract
- Type: `app block`. Target: `section` (merchants drop it inside any OS 2.0
  cart section — `cart-items.liquid`, `cart-drawer.liquid`, etc.).
- Zero merchant settings. The offer catalogue + discount % come from the
  **same shop metafield** `app.post_purchase_offer` that the checkout +
  post-purchase extensions already read (see `_shared/useOffers.js`). No
  new backend endpoint, no new data source.
- Reads the metafield via Liquid: `{{ shop.metafields.app.post_purchase_offer }}`
  (merchants grant storefront access on the metafield definition — one-time
  Admin task we document, not code).

## Data flow
1. Liquid parses the metafield JSON on page render → list of variant GIDs +
   `discountPercent`.
2. For each GID, Liquid resolves the variant object via
   `{% assign v = all_products[handle].variants | ... %}` **or** we drop
   dynamic hydration and keep the backend route the carousel already uses
   (`APP_URL/api/offers`), called from the block's JS. Lazier: use the
   existing endpoint — the server already knows how to resolve GIDs → price,
   image, title.
3. On click, `fetch("/cart/add.js", { body: JSON.stringify({ id: variantId,
   quantity: 1, properties: { _upsell_source: "cart" } }) })`. Note the
   **`_upsell_source: "cart"`** value — distinct from `"checkout"` so the
   Function can discount it independently (or not).

## Discount wiring
The existing Rust Function (`extensions/dogbook-upsell-discount`) only
matches `_upsell_source == "checkout"`. Three options, pick one:
- (a) **Match both** values in the Function (`"checkout" | "cart"`). One
  line change in Rust. Discount applies everywhere a dogbook upsell lands.
- (b) **Separate automatic discount** keyed off `"cart"`. More buttons for
  the merchant, no benefit.
- (c) **Skip discount on cart adds**. Removes the "20% off" pill from the
  Lovable mock. Not aligned.

Recommend (a). The Function change is `== "checkout" || == "cart"`.

## Design mapping (Lovable → block)
- "COMPLETE YOUR COLLECTION" header + "20% OFF" chip → two-column
  `{% section %}`-friendly flex row.
- Scroll list with gradient fade bottom → one `<div>` with `max-height:
  300px; overflow-y: auto;` and an absolutely-positioned
  `linear-gradient` overlay (CSS only, no JS until the user requests
  that the overlay disappear-on-scroll — Lovable does this with
  `onScroll`; we skip it unless they ask).
- Per-row `+ / ✓` button → `<button data-variant-id="...">` wired by
  `complete-collection.js` to `/cart/add.js`; on 200, swap SVG to check.

## Testing checklist
1. `shopify app dev` → open Online Store editor → add the block to the
   cart drawer section → it renders with the three default book tiles.
2. Click `+` on a tile → network panel shows `POST /cart/add.js` with
   `properties._upsell_source: "cart"`.
3. Refresh cart → the new line is present with the property visible via
   `GET /cart.js`.
4. Checkout → Function fires (if option-a applied) and totals drop by
   `discountPercent`.
5. Change the metafield's `discountPercent` in the app admin → re-open the
   cart drawer → new chip + inline price reflect the new value immediately
   (no block rebuild).

## Scope
- No new OAuth scopes. Storefront metafield access is a per-metafield
  definition setting, not an app scope.
- No new backend route if we reuse `/api/offers`.

## Explicit non-goals
- No merchant settings for position/color/copy. Lovable's design is the
  design. If merchants want to move it, they move the block in the
  theme editor.
- No A/B test harness, no analytics beyond the `_upsell_source` attribute
  the carousel already writes.

## Open question (defer until live)
Theme performance budget: the block adds ~15 KB JS at minimum. Themes
sensitive to this will complain. Fallback is pure-Liquid render + a
non-JS form POST to `/cart/add` (works, costs us the inline +/-
affordance). Hold until a merchant actually complains.
