# 02 — Post-purchase extension rewrite plan

**File that changes:** `extensions/wholesale-post-purchase/src/index.jsx`
(single file). No new deps, no toml changes, no API changes.

## Primitives available (reality check)

`@shopify/post-purchase-ui-extensions-react@0.13.2` ships:

- Containers: `Layout`, `View`, `BlockStack`, `InlineStack`, `Tiles`,
  `Separator`.
- Typography: `Heading`, `Text`, `TextBlock`.
- Interactive: `Button` (variants: `submit`, `plain`), **no `Pressable`,
  no `onPress` on `View`**.
- Media: `Image`.
- No horizontal scroll primitive. No snap. No custom CSS. No hex colors.

What this means in plain English: we cannot build a swipeable 13-tile
strip. The best we can do is a `Tiles` grid that wraps, driven by the
← / → buttons to select, with the active tile tinted via the primitive's
appearance keyword.

## Target UI

Section-by-section layout, matching Lovable screenshot 4 as closely as
the primitive allows.

```
┌──────────────── Layout maxInlineSize=900 ────────────────┐
│                                                          │
│         ✓ Order #3272 confirmed  (success tone)          │
│                                                          │
│  ┌── View background=subdued border=base padding=base ─┐ │
│  │                                             09:48   │ │
│  │  Add a book, save 20% off your next order           │ │
│  │  [ −20% ]  [ $0 EXTRA SHIPPING ]      OFFER ENDS IN │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
│  Tiles maxPerLine=5 (wraps on mobile)                    │
│  ┌──┐ ┌──┐ ┌──┐ ┌──┐ ┌──┐                                │
│  │GR│ │DA│ │FB│ │LR│ │CK│   ← current page               │
│  └──┘ └──┘ └──┘ └──┘ └──┘                                │
│  ┌──┐ ┌──┐ ...                                           │
│                                                          │
│  Swipe → not shown (no scroll); keep "1 / 13 [←] [→]"    │
│                                                          │
│  ───────────────────────────────────────                 │
│  📘 Golden Retriever                                     │
│      $̶1̶2̶0̶  $96.00         [ ADD — $96.00 ]              │
│                                                          │
│         🔒 One click · ships together · no card details  │
│                              No thanks                   │
└──────────────────────────────────────────────────────────┘
```

## Per-component changes

### OrderConfirmedRow (lines 181-193)

Keep as is. Already uses `✓` glyph + `appearance="success"`.

### OfferBanner (lines 195-241)

- Change `background={COLORS.accentTint}` → `background="subdued"`.
  `subdued` is the only keyword that renders a tinted panel without
  looking critical/warning. Hex was always being dropped.
- Keep `border="base"` and `cornerRadius="none"`.
- Change `-20%` pill: wrap in `<View padding="extraTight" background="success">`
  → gets the mint accent via theme, not hex.
- Change `$0 EXTRA SHIPPING` pill: keep `border="base"`, add
  `padding="extraTight"`, keep text `appearance="success"`.
- Timer stays at `size="extraLarge"` — primitive ceiling. Acceptable
  gap vs the 60px Lovable design.

### BreedCarousel (lines 243-316)

With 5 variants in the catalog, `Tiles maxPerLine={5}` renders a
single row of tiles — the Lovable layout with no horizontal scroll
needed. If the merchant grows the catalog past 5, Tiles reflows into
a second row, which is acceptable (post-purchase has unlimited
vertical space; see §Open questions in the first draft, now resolved
toward "wrap, no pager" per user guidance "do what's best, close to
Lovable").

- Keep `Tiles maxPerLine={5} spacing="tight"`.
- Images: `aspectRatio={0.75} fit="cover"` — already correct.
- Placeholder (lines 273-281): change
  `<View background={COLORS.secondary}>` → `background="subdued"`.
- Below-carousel row: `Swipe →` label is misleading since nothing
  scrolls. **Drop it.** Keep the `1 / N [←] [→]` block only. Arrows
  change the selected tile; when `selected` crosses into the next
  wrapped row, nothing has to auto-scroll.
- Selected-tile tint: `background="info"` on the selected `View` for a
  subtle fill that reads as "chosen" in both light and dark checkout
  themes. (Hex `COLORS.accentTint` was being dropped.)

### ActionRow (lines 318-357)

- Keep.
- Price: Lovable shows strike `$120.00` + bold `$96.00`. Current code
  already uses `<Text role="deletion">` for strike and `size="large"`
  for the current price. Keep.
- CTA label: `ADD — $96.00`. Keep. The spec explicitly says the
  checkout surface drops the price from the label; the post-purchase
  surface keeps it.

### TrustRow (lines 359-367)

Keep as is.

### TerminalPanel (lines 369-407)

- **Delete** the dev-only "Back to the offer" ghost button (lines
  397-402). The spec marks this as prod-remove.
- `Button submit onPress={onDone}` label: keep `Continue to
  confirmation`.

## Data flow (unchanged)

- `ShouldRender` extend: fetch offers via `/api/post-purchase/offer`,
  filter against purchased variants, `storage.update(...)`,
  return `{render: filtered.length > 0}`. Already correct.
- `Render` component: read `storage.initialData`, drive UI off state.
- `accept()`: call `/api/post-purchase/sign` with the Shopify-issued
  JWT and the changeset, then `applyChangeset(signedToken)`. Already
  correct.

## New constants to add

None. `PAGE_SIZE` not needed — Tiles wraps naturally beyond 5 items.
`COLORS.*` becomes unused once we switch to keyword backgrounds; the
whole hex-color map in `_shared/tokens.js` goes away (see section 04).

## Testing checklist

1. Place an order with any product.
2. Thank-you page: extension renders.
3. Banner shows a subdued mint-ish background with a visible border;
   headline + two pills + timer are all visible on the same row at
   ≥ 768px, pills wrap below headline at < 768px.
4. Carousel shows 5 tiles per page; ← / → advance tile-by-tile and
   roll to the next page at tile 6, 11.
5. Click `ADD — $96.00` → `calculateChangeset` returns pricing →
   server signs → `applyChangeset` runs → "Added to your order" panel
   with the chosen breed name in the sentence.
6. Click `No thanks` → declined panel with just `Continue to
   confirmation`, no "Back to the offer" link.
7. Let timer hit 00:00 → expired panel.

## Decisions (resolved)

1. **Wrap, no pager.** `Tiles maxPerLine={5}` renders the current
   5-variant catalog in a single row, matching the Lovable mock.
   Future-proof: if the catalog grows past 5, Tiles reflows into a
   second row. No `PAGE_SIZE` constant, no slicing logic.
2. **Timer stays** — 10-minute countdown is a client requirement.
   `POST_PURCHASE_OFFER_SECONDS = 600` stays in `_shared/tokens.js`.
