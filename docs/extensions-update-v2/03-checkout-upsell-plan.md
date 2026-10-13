# 03 — Checkout UI extension rewrite plan

**File that changes:** `extensions/dogbook-checkout-upsell/src/CheckoutUpsell.jsx`
(single file). Possibly a one-line toml bump (API 2025-10 → 2026-01).
No new deps.

## Primitives available (reality check)

`@shopify/ui-extensions/preact` 2025-10+ with Polaris web components
(`s-*`) ships everything we actually need:

- Containers: `s-stack`, `s-grid`, `s-box`, `s-section`, `s-scroll-box`.
- Typography: `s-heading`, `s-text`, `s-paragraph`.
- Interactive: `s-button`, `s-clickable`.
- Media: `s-image`, `s-product-thumbnail`, `s-icon`.
- Feedback: `s-badge`, `s-banner`, `s-spinner`.

Hard limits worth stating up front:

- **No hex colors.** `background` and `border` take enum keywords
  (`subdued`, `base`, `strong`, `transparent`, `critical`, `warning`,
  `success`, `info`, `accent`). Hex is silently dropped.
- **`s-scroll-box` has no scroll-snap and no programmatic scroll-to.**
  Horizontal scroll works via `overflow="auto hidden"` (first value =
  inline/horizontal, second = block/vertical).
- **`s-stack direction="inline"` wraps by default.** For a one-row
  scroller we need the children themselves to have fixed `inlineSize`
  and the wrapper to be the `s-scroll-box`, not a wrapping stack.
- **`s-image`** respects `inlineSize` / `blockSize`. Without them it
  fills the parent — that's the current bug.

## Target UI

Matches Lovable screenshot 2 as closely as a non-Plus right-rail can.

```
┌── s-banner tone="success" / s-box border + background=subdued ──┐
│  Add a book, save 20% off your next order                       │
│  [ −20% ]  [ $0 EXTRA SHIPPING ]                                │
│                                                                 │
│  ┌── s-scroll-box overflow="auto hidden" ────────────────────┐  │
│  │ ┌──┐ ┌──┐ ┌──┐ ┌──┐ ┌──┐ ...                              │  │
│  │ │GR│ │DA│ │FB│ │LR│ │CK│    (each 118px wide, no wrap)    │  │
│  │ └──┘ └──┘ └──┘ └──┘ └──┘                                   │  │
│  └────────────────────────────────────────────────────────────┘  │
│  Swipe →                                      1 / 13  [←] [→]   │
│  ─────────────────────────────────────────────────────────────   │
│  📘 Golden Retriever                                             │
│      $̶1̶2̶0̶  $96.00                                       [ADD]   │
│                                                                 │
│       🔒 One click · ships together · no card details            │
└─────────────────────────────────────────────────────────────────┘
```

## Component-by-component

### Outer panel

Current: `<s-stack direction="block" gap="base" padding="base" border="base" background={COLORS.accentTint}>` (lines 101-108) — hex background ignored.

Change to:

```jsx
<s-banner tone="success" heading="Add a book, save 20% off your next order">
  …
</s-banner>
```

**Why `s-banner`:** it is the one primitive that paints a true mint
accent (`tone="success"`) with a matching border, which is exactly the
"green-bordered mint panel" the design calls for. Headline moves from
`s-heading` into the banner's `heading` prop. Everything else lives
inside the banner's slot.

Fallback if we want more layout control: `<s-box border="base" background="subdued" padding="base">` — subdued is grey-mint-ish and works, but less visually distinct.

### Badge row

Current:

```jsx
<s-badge size="small">−{discountPercent}%</s-badge>
<s-badge size="small" tone="neutral">$0 EXTRA SHIPPING</s-badge>
```

Change to:

```jsx
<s-stack direction="inline" gap="small-100">
  <s-badge tone="success">−{discountPercent}%</s-badge>
  <s-badge tone="success">$0 EXTRA SHIPPING</s-badge>
</s-stack>
```

Both pills now carry the accent, matching the Lovable mint-filled
`−20%` and outlined `$0 EXTRA SHIPPING`.

### Carousel strip (THE main fix)

Current wraps children into a grid because `s-stack direction="inline"`
is a flex row that wraps. Replace with explicit sized tiles and a
scroll-box that only scrolls horizontally.

```jsx
<s-scroll-box overflow="auto hidden">
  <s-grid gridTemplateColumns={offers.map(() => '118px').join(' ')} gap="small-100">
    {offers.map((o, i) => (
      <s-clickable
        key={o.variantId}
        onclick={() => setSelectedIdx(i)}
        accessibility-label={o.productTitle}
      >
        <s-box
          padding="small-100"
          border="base"
          background={i === selectedIdx ? 'subdued' : 'base'}
          borderRadius="none"
        >
          <s-stack direction="block" gap="small-200" alignInline="center">
            <s-box inlineSize="54px" blockSize="80px">
              {o.imageUrl ? (
                <s-image
                  src={o.imageUrl}
                  alt={o.productTitle}
                  inlineSize="fill"
                  blockSize="fill"
                  objectFit="cover"
                />
              ) : (
                <s-stack direction="block" alignItems="center" justifyContent="center" background="subdued" inlineSize="fill" blockSize="fill">
                  <s-text type="small">{String(i + 1).padStart(2, '0')}</s-text>
                </s-stack>
              )}
            </s-box>
            <s-text type="small">{o.productTitle}</s-text>
          </s-stack>
        </s-box>
      </s-clickable>
    ))}
  </s-grid>
</s-scroll-box>
```

Three things to notice:

1. `s-grid` with an explicit `gridTemplateColumns` of N × 118px forces
   a single row. The grid is wider than the scroll-box, so the
   scroll-box scrolls horizontally.
2. The image is wrapped in a `s-box` with fixed `inlineSize="54px"
   blockSize="80px"` and the image fills via `inlineSize="fill"
   blockSize="fill"`. No more blown-out images.
3. Selected tile gets `background="subdued"` for a subtle fill +
   `border="base"` (always present). We lose the Lovable's accent-ring
   effect — Polaris has no ring prop, but subdued-fill reads as
   "selected" at a glance.

### Below-carousel row

Keep the current grid (lines 155-178). Fine as-is after the carousel
is fixed, no color/hex issues.

### Divider

Keep. `<s-divider />` already works.

### Action row

Current (lines 182-207) is close. One change: swap the manual
`s-product-thumbnail` + `s-box` fallback with just `s-product-thumbnail`
always; it ships a built-in placeholder.

```jsx
<s-product-thumbnail
  src={selected.imageUrl}
  alt={selected.productTitle}
  size="base"
/>
```

### Trust row

Keep. Already uses `s-icon type="lock"` + `s-text`.

### Added panel

Current (lines 221-238) uses `background={COLORS.accentTint}` — again
dropped. Replace with:

```jsx
<s-banner tone="success" heading="Added to your order">
  <s-paragraph>
    Your {breed} ships with your order — $0 extra shipping.
  </s-paragraph>
</s-banner>
```

## `shopify.extension.toml`

No required changes. Optionally bump `api_version = "2025-10"` →
`"2026-01"` to pick up the latest Polaris component additions. If we
bump, add `--version 2026-01` to any CLI commands and re-test on the
dev store.

If we go with the shop-metafield data model (section 04), add:

```toml
[[extensions.metafields]]
namespace = "app"
key = "post_purchase_offer"
owner_type = "SHOP"
```

so the extension can read the metafield directly via
`useAppMetafields` and we can delete the public offer API round-trip.

## Discount wiring

Covered in `05-discount-wiring.md`. The checkout extension itself only
needs to continue writing the `_upsell_source=checkout` attribute on
the new cart line (lines 82-83 already do this). The Shopify Function
reads that attribute and applies the %.

## Testing checklist

1. Dev store (Plus or non-Plus — see open question in section 01).
2. Start a checkout with a book in cart.
3. Mint banner renders above the native order summary.
4. Tiles render as a single horizontal strip, scrollable natively, no
   wrap, image size correct, selected tile tinted.
5. Click ADD → cart line added → native order summary updates → panel
   swaps to the "Added to your order" banner.
6. With the Function in place: discount actually applied, totals drop
   by 20%.
7. With the Function NOT YET in place: cart line added with attribute,
   totals do NOT drop, UI still looks right.

## Decisions (resolved)

1. **Use `s-banner tone="success"`** as the outer panel. Closest match
   to Lovable's green-bordered mint panel the primitives allow.
2. **Keep writing `_upsell_source=checkout`** attribute — the Shopify
   Function in §05 keys off it.
3. **Carousel shows a cut-off tile** as scroll affordance. The grid
   approach above produces this naturally when
   `offers.length * 118px > rail width`.
