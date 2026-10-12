# Plan — Post-purchase + Checkout UI extensions (for the app repo)

Hand this file to Claude running inside your custom Shopify app repo
(the one you screenshotted that currently has a single-variant
post-purchase extension). This plan rebuilds that post-purchase UI to
match the Lovable design, and adds a new Checkout UI Extension beside
it. Both surfaces share config.

> **Design source of truth lives in the theme repo**, not the app repo.
> Before coding, read these files (copy them into the app repo under
> `docs/upsell-design/` so Claude has them locally):
>
> - `docs/post-purchase-upsell/00-design-tokens.md` — colors, fonts, spacing, radii, shared molecules
> - `docs/post-purchase-upsell/01-one-click-post-purchase.md` — post-purchase extension spec
> - `docs/post-purchase-upsell/03-checkout-cross-sell.md` — checkout extension spec
> - `post-purchase-design/src/routes/upsell-1-clic.tsx` — post-purchase React prototype
> - `post-purchase-design/src/routes/checkout.tsx` — checkout React prototype
> - `post-purchase-design/src/components/demo.tsx` — shared `BookCover`, `OfferCard`, `OrderSummary` molecules
> - `post-purchase-design/src/styles.css` — OKLCH token values

---

## 1. Scope

Build **two** Shopify extensions in the same app:

| Extension | Target | Spec doc | Surface |
|-----------|--------|----------|---------|
| Post-purchase | `Checkout::PostPurchase::Render` (v2) | `01-one-click-post-purchase.md` | Thank-you-page one-click upsell screen |
| Checkout UI | `purchase.checkout.cart-line-list.render-after` | `03-checkout-cross-sell.md` | Green-bordered offer panel in checkout right rail (above order summary) |

The cart drawer surface is **already built in the Shopify theme** and
is out of scope here — do not touch it.

**Platform constraint:** Checkout UI Extensions on this target require
Shopify Plus. If the dev store is not Plus, scaffold the extension but
expect runtime "extension not supported" errors on that target —
confirm with the store owner before you start.

---

## 2. Shared config (where offers come from)

The existing extension stores a single variant ID in its own app DB.
That's not enough — the Lovable design shows a **list of 3–13 books**
in both surfaces. Two options:

**Option A — app-local DB, multi-variant list (recommended for now).**
Extend the current app's offer editor to accept a list of variants
instead of one, plus a shared discount percent (default 20). Both
extensions read from the same offer config via the app's existing API.
One source, zero Shopify coupling.

**Option B — Shopify shop metafield (recommended for long-term).**
Define `shop.metafields.custom.upsell_variants` as
`list.variant_reference`. Merchant edits once in Shopify admin →
Settings → Custom data → Shop. The app's extensions AND the theme's
cart drawer snippet all read from the same metafield. True
single-source. More refactor on the app side but no app-side merchant
UI to maintain.

**Pick A for v1, migrate to B when you ship v2.** The theme snippet is
currently wired to a theme-settings collection picker — when the app
moves to metafield B, update the theme snippet to read the metafield
too so all three surfaces stay in sync.

---

## 3. Post-purchase extension

### 3.1 Scaffold

```
shopify app generate extension --type=post_purchase_ui --name=dogbook-post-purchase
```

Target: `Checkout::PostPurchase::ShouldRender` + `Checkout::PostPurchase::Render` (API v2, React).

### 3.2 ShouldRender

Return `{render: true, initialState: {offers, discountPercent, orderName}}` **only if**:
- The offer config has ≥ 1 variant.
- None of the variants are already in `inputData.initialPurchase.lineItems`.
- The store currency and locale are supported (default: just pass through).

Prefetch all variant data (title, image URL, price, compareAtPrice) via
Storefront or Admin API in `ShouldRender` so `Render` is instant.

### 3.3 Render — screen structure

Match `01-one-click-post-purchase.md` section-by-section. Component
tree:

```
<Layout maxInlineSize={900}>
  <OrderConfirmedRow orderName={state.orderName} />
  <OfferBanner secondsLeft={countdown} />      // headline + −20% pill + $0 SHIP pill + 10:00 timer
  <BreedCarousel offers={state.offers} selectedIndex={i} onSelect={…} />
  <SelectedActionRow offer={state.offers[i]} onAdd={…} />
  <TrustRow />
  <NoThanksLink onClick={decline} />
</Layout>
```

State machine (useReducer):
- `browsing` → initial state, timer counting down from 600 s
- `accepted` → after `Shopify.applyChanges`, swap to success panel ("Added to your order")
- `declined` → after `No thanks`, swap to decline panel then `Shopify.done()`
- `expired` → when timer hits 0, swap to "This offer has ended" panel + button that calls `Shopify.done()`

See spec §6 for exact copy and panel geometry.

### 3.4 Shopify API wiring

```ts
import { extend, render } from '@shopify/post-purchase-ui-extensions-react';

// Accept:
await applyChanges({
  changes: [
    {
      type: 'add_variant',
      variantId: selectedOffer.variantGid, // "gid://shopify/ProductVariant/..."
      quantity: 1,
      discount: {
        value: state.discountPercent, // 20
        valueType: 'percentage',
        title: `Post-purchase ${state.discountPercent}% off`,
      },
    },
  ],
});
```

Discount is applied inline per the Post-Purchase Extension API — no
Shopify Function or admin discount needed for this surface. Payment is
NOT re-collected (uses the already-authorized token).

### 3.5 Styling

Post-purchase extensions use Shopify's `BlockStack`, `InlineStack`,
`Text`, `Button`, `Pressable`, `Image` primitives. They do **not**
accept arbitrary CSS. Match the Lovable design with Polaris-ish
equivalents:

- Colors: use literal hex values from `00-design-tokens.md` where
  Shopify primitives accept `background` / `border` props with hex. For
  the mint `bg-accent/5` fill: use `#F2F7F3`.
- Timer: `<Text size="extraLarge" emphasized>` with `appearance="critical"`
  swapped for custom hex — or fall back to a `<View background="…">`
  wrapper. The `tabular-nums` effect is automatic in post-purchase
  typography.
- Breed carousel: no native carousel component. Use `InlineStack`
  with `overflow="scroll"` or `<ScrollView>` (check latest API). Each
  tile is a `<Pressable>` wrapping `<BlockStack>` cover + label.
- Square corners everywhere: pass `cornerRadius="none"` on every
  surface that accepts it.
- CTA: `<Button kind="primary" onPress={accept}>` — Shopify forces its
  own primary color here; use `appearance="monochrome"` to approximate
  the black bg. If exact black is required, wrap a `<Pressable>` with
  `background="#1E1C18"` + `<Text appearance="subdued" emphasized>` for
  the label.

If the design absolutely cannot be matched inside the primitives (which
is possible for the timer and tile grid), log the gap and ship the
closest approximation — do NOT inject raw CSS, it will be stripped.

### 3.6 Accessibility

See spec §9. Specifically: `role="timer"` is not available via
primitives; use `accessibilityLabel="Offer ends in MM:SS"` on the
timer `<Text>` and re-render every second (the extension host
announces label changes). Prev/next arrows → `accessibilityLabel`
+ `disabled` prop.

---

## 4. Checkout UI extension

### 4.1 Scaffold

```
shopify app generate extension --type=checkout_ui --name=dogbook-checkout-upsell
```

In `shopify.extension.toml`, add target:

```toml
[[extensions.targeting]]
target = "purchase.checkout.cart-line-list.render-after"
module = "./src/CheckoutUpsell.tsx"
```

### 4.2 Guard

Early return if any of these are true:
- No offer config / empty variant list.
- Every offer variant is already in `useCartLines()`.
- Cart currency not supported (edge case; default: proceed).

### 4.3 Render — component tree

Match `03-checkout-cross-sell.md` §3a:

```
<View border="base" cornerRadius="none" padding="base" background="#F2F7F3">
  <BlockStack spacing="tight">
    <Heading level={3}>Add a book, save 20% off your next order</Heading>
    <InlineStack spacing="tight">
      <Badge kind="success">−20%</Badge>
      <Badge kind="neutral">$0 EXTRA SHIPPING</Badge>
    </InlineStack>
    <BreedCarousel />                    // 118px tiles, native scroll, no auto-scroll on arrow click
    <View border="base" borderBlockStart="base" paddingBlockStart="base">
      <InlineStack spacing="base" blockAlignment="center">
        <Image … 64x48 />
        <BlockStack spacing="none" inlineSize="fill">
          <Text emphasized>{selectedOffer.title}</Text>
          <InlineStack spacing="tight">
            <Text appearance="subdued"><s>{compareAt}</s></Text>
            <Text emphasized size="large">{price}</Text>
          </InlineStack>
        </BlockStack>
        <Button onPress={add} kind="primary">ADD</Button>
      </InlineStack>
    </View>
    <TrustRow />
  </BlockStack>
</View>
```

The order summary that sits below (per spec §3b) is Shopify's own —
**do not render it from the extension**. Shopify's native order summary
renders beneath automatically. Delete that section from the Lovable
design when porting.

### 4.4 Add-to-cart wiring

Use `useApi()` to get `applyCartLinesChange`:

```ts
const api = useApi<'purchase.checkout.cart-line-list.render-after'>();
await api.applyCartLinesChange({
  type: 'addCartLine',
  merchandiseId: selectedOffer.variantGid,
  quantity: 1,
  attributes: [{ key: '_upsell_source', value: 'checkout' }],
});
```

The 20% discount is **not** applied inline here (checkout API doesn't
expose a per-line discount the way post-purchase does). Options:

- **Shopify Function (Discount API)** — create one in this same app
  that targets any cart line with attribute `_upsell_source == 'checkout'`
  (or any variant from the configured list) and applies the configured
  percent. This is the real production path.
- **Automatic discount** targeting the collection used by the theme's
  cart drawer snippet — works if you've picked Option A/B from §2
  such that the variants in the extension overlap the collection.

Pick the Shopify Function path; the stakeholder has already said real
discounts come from Functions.

### 4.5 Added-state

Match spec §4. Swap the panel's inner children for:

```
<BlockStack spacing="base" blockAlignment="center" inlineAlignment="center" minBlockSize={280}>
  <Icon source="checkmark" size="large" appearance="success" />
  <Heading level={3}>Added to your order</Heading>
  <Text appearance="subdued">
    Your {breed} book ships with your Beagle — $0 extra shipping.
  </Text>
</BlockStack>
```

Omit the dev-only "Back to the offer" ghost button in production.

### 4.6 Carousel behavior

Per spec §5: arrow buttons change `selected` but **do NOT scroll the
strip**. The strip only scrolls via native touch/trackpad. Deliberate —
the right rail is narrow and auto-scroll feels jittery here.

---

## 5. Shared offer-loading hook

Both extensions need the same offer list + prices. Build one helper in
`extensions/_shared/useOffers.ts`:

```ts
export function useOffers(): { offers: Offer[]; discountPercent: number; loading: boolean } {
  // 1. Fetch offer config from your app's API (variant IDs + discount percent).
  // 2. Resolve variant GIDs → { title, image, price, compareAtPrice } via Storefront API.
  //    Cache per-session so Render is instant.
  // 3. Return. Both extensions import this.
}
```

If you go with Option B (shop metafield) later, swap step 1 for a
metafield read via Admin API, no change to the extensions themselves.

---

## 6. Testing checklist

### Post-purchase
1. Set up offer with 3+ variants + 20% discount.
2. Place a test order with any Beagle book (or whichever base product
   you have in the store).
3. On the thank-you page the extension renders *before* the native
   thank-you content.
4. Verify: order number row, offer banner with countdown ticking down,
   breed carousel scrolls, arrow buttons move selection, selected tile
   shows green ring + mint bg.
5. Click `ADD` → `Shopify.applyChanges` fires, success panel shows
   with the correct breed name. Confirm the order in admin now has 2
   line items and the second has 20% discount applied.
6. Place another order, click `No thanks` → decline panel then
   thank-you page loads normally.
7. Place another order, let the 10:00 timer run out → expired panel
   shows, buttons disappear.
8. Mobile viewport < 640px → headline 20px, timer 48px, CTA shows
   `ADD` only (no price in label).

### Checkout
1. On a Shopify Plus dev store, start a checkout.
2. Right rail shows the green-bordered panel ABOVE the order summary.
3. Carousel scrolls; arrows change selection without scrolling the
   strip.
4. Click `ADD` → cart line added; order summary updates; panel swaps
   to "Added to your order".
5. Mobile viewport → columns stack, panel sits in the lower half; tile
   width stays 118px, ~3 tiles visible with a cut-off 4th.
6. Confirm the Shopify Function applies the 20% discount at the real
   totals, not just visually.

### Both
7. Empty variant config → neither extension renders.
8. All variants already in cart → neither extension renders.
9. Discount percent changed in app → both surfaces reflect the new
   value on next render.

---

## 7. What NOT to do

- Don't inject custom CSS strings or iframes inside the extensions —
  both runtimes strip them.
- Don't duplicate the order summary inside the checkout extension;
  Shopify owns it.
- Don't re-prompt for payment in the post-purchase extension; the
  authorized token is already present.
- Don't hardcode `#2F6E3E` — put all design hex values in one
  `tokens.ts` file in `extensions/_shared/` so both extensions and
  future email templates stay consistent.
- Don't ship the "Back to the offer" dev-reset button to production.
- Don't rebuild the cart drawer surface — the theme already owns it
  and reads from a separate theme setting today (will migrate to the
  shared metafield in v2).

---

## 8. Deliverables summary

- `extensions/dogbook-post-purchase/` — React post-purchase extension matching `01-one-click-post-purchase.md`.
- `extensions/dogbook-checkout-upsell/` — Checkout UI extension matching `03-checkout-cross-sell.md`.
- `extensions/_shared/useOffers.ts` + `extensions/_shared/tokens.ts` — shared data loader + design tokens.
- (Optional, v2) Shopify Function (Discount API) that applies the configured percent to cart lines matching the offer variant list.
- Updated offer editor in the existing app admin UI: accepts a list of variants + a single discount percent (replaces the single-variant form currently in production).
- Short README in each extension folder listing the extension target, the spec doc it implements, and the test steps above.
