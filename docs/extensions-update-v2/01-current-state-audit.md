# 01 — Current state audit

Verified by reading the source. Line numbers below point at the actual
code so the diagnosis is auditable, not vibes.

## 1. Repo layout

```
extensions/
  _shared/
    tokens.js        design tokens (hex colors + offer-seconds constant)
    useOffers.js     fetchOffers(), filterNotInCart(), formatMoney(), formatMMSS()
    package.json
  dogbook-checkout-upsell/
    src/CheckoutUpsell.jsx
    shopify.extension.toml  target = purchase.checkout.cart-line-list.render-after
  wholesale-post-purchase/
    src/index.jsx
    shopify.extension.toml  type = checkout_post_purchase
app/
  routes/
    api.post-purchase.offer.jsx   GET loader, metaobject → metafield fallback
    api.post-purchase.sign.jsx    POST action, JWT sign for applyChangeset
    app.post-purchase.jsx         admin UI, resource picker, metaobject upsert
  lib/
    post-purchase-sign.server.js
```

## 2. Checkout UI extension — `dogbook-checkout-upsell`

**File:** `extensions/dogbook-checkout-upsell/src/CheckoutUpsell.jsx`

### Bugs visible in screenshot 1

| Symptom | Root cause | Lines |
|---|---|---|
| Tiles render as a 2-column grid, each tile ~1/2 panel width | `s-stack direction="inline"` wraps by default; nothing forces single-row flex | 119-152 |
| Tile background is light blue (not mint); whole panel bg is grey | `background={COLORS.accentTint}` → hex `#F2F7F3` passed to `s-stack` / `s-box`; Polaris web components only accept keyword enums (`subdued`, `base`, `strong`, `transparent`, …). Hex is silently dropped. | 107, 131, 140, 228 |
| Image placeholder boxes huge | `<s-box minBlockSize="80px">` for placeholder, and `<s-image>` for real images has no `inlineSize` / `blockSize` — defaults to parent width | 134-146 |
| No swipe affordance | `s-scroll-box` here has no `maxBlockSize`, no explicit horizontal overflow, and the inner `s-stack` wraps instead of overflowing | 118 |
| ADD button colored neutral grey, not the accent / primary | `variant="primary"` is correct, but the panel has no accent surrounding it so the button looks dead | 202 |
| `-20%` and `$0 EXTRA SHIPPING` badges small and colorless | `<s-badge size="small">` — `tone="success"` would paint it mint; nothing paints the first badge | 114-115 |

### Design-token sin, in one line

`extensions/_shared/tokens.js` lines 8-27 define a palette of hex colors
(`accent: "#2F6E3E"`, `accentTint: "#F2F7F3"`, …) that **neither
extension can consume**. Both runtimes only accept enum keywords. The
file is cargo-culted from the Lovable design doc.

### What's actually right

- The target (`purchase.checkout.cart-line-list.render-after`) is correct
  for a right-rail panel above the Shopify-rendered order summary.
- `applyCartLinesChange` with `addCartLine` + an attribute is the
  recommended pre-purchase upsell pattern (confirmed via Shopify docs:
  "Build a pre-purchase product offer").
- `network_access = true` is set in the toml.

## 3. Post-purchase extension — `wholesale-post-purchase`

**File:** `extensions/wholesale-post-purchase/src/index.jsx`

### Bugs visible in screenshot 3

| Symptom | Root cause | Lines |
|---|---|---|
| Banner (headline + badges + timer) has no mint background, no border | `<View background={COLORS.accentTint} border="base">` — hex ignored by `@shopify/post-purchase-ui-extensions-react`; `background` prop accepts appearance keywords (`subdued`, `transparent`, `info`, `success`, `critical`), not hex | 197-241 |
| Timer only ~24px, not the Lovable 48–60px | `Text size="extraLarge"` is the biggest the primitive exposes; no custom typography available on this surface | 231 |
| Four tiles side-by-side instead of a horizontal carousel of 13 | (a) `Tiles maxPerLine={5}` with four variants = four tiles; (b) `Tiles` wraps instead of scrolling. The library has **no** horizontal-scroll primitive and **no** `Pressable`. | 255-289 |
| Tiles are big and square, not tall book-shaped cards | Each `Image` is `aspectRatio={0.75}` + `fit="cover"` but it stretches to the Tiles cell. No way to constrain inside the primitive. | 265-271 |
| "Back to the offer" ghost button on declined / expired panels | Dev-only reset left in — spec `01-one-click-post-purchase.md` §7 says drop before shipping | 397-402 |
| CTA label `Continue to confirmation` instead of `BACK TO EXAMPLE` | On purpose — `BACK TO EXAMPLE` is a mock-frame label; prod should call `Shopify.done()`. This one is correct and the spec is wrong. | 394-396 |

### What's actually right

- Correct extension targets: `Checkout::PostPurchase::ShouldRender` for
  the gate and `Checkout::PostPurchase::Render` for the UI.
- `calculateChangeset` → `/api/post-purchase/sign` → `applyChangeset` is
  the exact flow Shopify documents in "Build a post-purchase product
  offer".
- JWT verify + resign (`app/lib/post-purchase-sign.server.js`) matches
  the Shopify-recommended server-side signing — do not change this.
- Deadline-based countdown (lines 77-87) survives tab backgrounding;
  that's the correct implementation.

## 4. Backend — `/api/post-purchase/offer`

**File:** `app/routes/api.post-purchase.offer.jsx`

- Loader walks: metaobject `$app:post_purchase_offer` (lines 51-125) →
  shop metafield `app.post_purchase_offer` fallback (lines 127-144) →
  empty.
- Metaobject carries: `variant_ids` (list of ProductVariant refs),
  `discount_percent`, `enabled`, `priority`, `trigger_product`.
- Hydrates with an Admin GraphQL `nodes(ids:)` query returning
  `price`, `compareAtPrice`, `product.title`, `image.url` /
  `product.featuredImage.url`.
- CORS: `Access-Control-Allow-Origin: *` because the request comes from
  the Shopify-hosted checkout iframe with no session token. Fine for
  non-sensitive display data; must not add anything sensitive here.

### Over-engineering flags

| Concern | Why it hurts |
|---|---|
| **Metaobject with 5 fields** replaces what is literally `{variantGids: [...], discountPercent: 20}`. Four of the five fields are never used by either extension (`enabled`, `priority`, `trigger_product`). | 2 scopes we don't need (`write_metaobjects`, `write_metaobject_definitions`), one admin GraphQL round-trip per render, resource-picker complexity, legacy JSON fallback path. |
| **Public `GET /api/post-purchase/offer`** that both extensions hit on every render | Cold start on Vercel, a second network dependency during checkout, CORS surface area. The checkout extension already has Admin GraphQL access via a Function or Storefront access — the data could live on a product collection and be read natively. |
| **Legacy JSON `offer` field normalization** (`normalizeLegacyOffer`, lines 38-49) | Pure deadweight; no shop in prod has written this shape. |

## 5. Admin UI — `app/routes/app.post-purchase.jsx`

Resource picker + metaobject upsert UI. Works, but the whole file goes
away if we switch to a shop metafield (see `04-data-model-and-backend.md`).

## 6. Design doc vs. real primitives — mismatch summary

| Lovable spec says | Polaris web components (checkout) offer | Post-purchase React lib offers |
|---|---|---|
| Hex `#F2F7F3` background | `background="subdued"` or `"base"` only | `background="subdued"` or appearance keyword |
| 60px tabular-nums timer | `s-text` has no font-size prop; largest tone keyword | `Text size="extraLarge"` |
| Horizontal carousel with snap scrolling | `s-scroll-box` + fixed-width tiles; no snap, no programmatic scroll | **Nothing.** `Tiles` wraps, no scroll primitive |
| `rounded-none` square corners | `borderRadius="none"` on `s-box` | `cornerRadius="none"` on `View` |
| Custom tracking-wide uppercase | n/a — font follows checkout theme | n/a |

**Takeaway:** we cannot pixel-match Lovable. We can get *visually
convincing* within each library's primitives. Section 02 and 03 spell
out exactly what each panel looks like after.

## Decisions (resolved)

1. **Real catalog is 5 variants today** (Australian Shepherd, Basset
   Hound, Bernese Mountain, Cane Corso, Cavapoo), configurable up to
   whatever the merchant picks. 13 is a design mock; the UI must
   render N items cleanly for any N.
2. **Plus store confirmed** (staging is on Plus). Both targets are
   available; no non-Plus fallback needed.
3. **Timer stays** — client requirement.
