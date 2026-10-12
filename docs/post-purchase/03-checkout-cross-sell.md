# 03 — Checkout cross-sell (Shopify Plus only)

**Source route:** `post-purchase-design/src/routes/checkout.tsx`
**Design screenshots:** `OPTION 4 · CHECKOUT CROSS-SELL (SHOPIFY PLUS
ONLY)` (full screen) and the cropped close-up showing just the offer +
order summary right rail.

The main Shopify checkout page. We **don't rebuild the checkout form**
on the left — that is Shopify's own UI, we're only showing it to prove
spatial context. The deliverable is the **right rail**: the green-
bordered upsell panel sitting *above* the order summary. The user
asked us to focus on **this part only** — see cropped screenshot.

> **Platform constraint:** inserting any custom block *inside* the
> hosted Shopify checkout requires Shopify Plus (`checkout.liquid` is
> deprecated; use a Checkout UI Extension of type `purchase.checkout.*`).
> On non-Plus stores, defer to the cart drawer version (doc 02).

---

## 1. Layout (desktop + mobile)

### Desktop (≥ 1024px)

Two columns under one logo bar:

```
┌──── mock frame ────────────────────────────────────────────┐
│ OPTION 4 · CHECKOUT CROSS-SELL (SHOPIFY PLUS ONLY)
│ ┌──────────────────────────────────────────────────────┐
│ │ The Dog Book                                          │  ← logo bar
│ ├────────────────────────┬────────────────────────────┤
│ │                        │  ┌── OFFER PANEL ───────┐  │
│ │ Express checkout       │  │ Add a book, save…    │  │
│ │ [Shop][PayPal][GP][V]  │  │ [−20%] [$0 EXTRA…]   │  │
│ │                        │  │ [🐶] [🐶] [🐶] [04]→ │  │
│ │ Contact      Sign in   │  │ Swipe → 1/13 [←][→] │  │
│ │ [ email___________ ]   │  │ 📘 Golden Retriever  │  │
│ │                        │  │   $̶1̶2̶0̶ $96   [ADD]   │  │
│ │ Delivery               │  │ 🔒 One click · ships │  │
│ │ [Country · US        ] │  └──────────────────────┘  │
│ │ [First] [Last         ]│  📘 BEAGLE¹      $120.00   │
│ │ [Address             ] │  ─────────────────────────  │
│ │ [City][State][ZIP    ] │  Subtotal        $120.00   │
│ │                        │  Shipping          $9.95   │
│ │                        │  **Total** USD **$120.00** │
│ │                        │                            │
│ │                        │  Note: Shopify Plus req'd  │
│ └────────────────────────┴────────────────────────────┘
└──────────────────────────────────────────────────────────┘
```

- Outer grid: `grid-cols-[1.08fr_.92fr]` → left slightly wider than right.
- Both columns `min-h-[720px]`.
- Logo bar: full-width, border-bottom 1px `--border`, `px-6 py-5`, 20px
  (`text-xl`) bold "The Dog Book".
- Left column: white bg (card default), `px-10 py-10`, border-right
  1px `--border`.
- Right column (`<aside>`): bg `--muted/50` (very light sand), `px-10
  py-10`.

### Mobile (< 1024px)

- Columns stack: logo bar → form → aside (offer + summary).
- Left column `px-6 py-10`, no border-right.
- Right column `px-6 py-10`, no top border — the `mt-6` on the
  summary already provides spacing.
- Every control is already single-column within each section.

---

## 2. Left column (Shopify checkout form) — spec-only

**Do not rebuild. Shopify Plus Checkout Extensibility owns this.** For
reference, the prototype draws:

1. **Express checkout row** — label `Express checkout` centered 14px
   muted; buttons grid `grid-cols-4 gap-2` with brand-hex bgs:
   - Shop `#5A31F4` white text
   - PayPal `#FFC439` text `#182E49`
   - G Pay `#1E1C18` white text
   - Venmo `#008CFF` white text

2. **Contact** section — `h2` 20px semibold "Contact" + `Sign in`
   underline link right-aligned. Below: single `Email` field —
   `rounded-md`, 1px `--input` border, `px-3 py-3`, 14px placeholder
   `--muted-foreground`.

3. **Delivery** section — `h2` 20px semibold. Fields grid:
   - Full-width `Country/Region · United States`
   - 2-col `First name` / `Last name`
   - Full-width `Address`
   - 3-col `City` / `State` / `ZIP code`

All fields in prototype are the `<Field>` placeholder (not real
inputs) — our Liquid port will not render these at all because
Shopify's native fields replace them.

---

## 3. Right column — our actual build target

Two blocks stacked:

### 3a. Offer panel ⭐ primary build

| Property       | Value                                               |
|----------------|-----------------------------------------------------|
| Border         | 1px `--accent` green                                |
| Background     | `bg-accent/5` (green 5% opacity)                    |
| Padding        | `p-4` (16px)                                         |
| Border radius  | 0                                                    |

**Headline (`<h3>`)**: `Add a book, save 20% off your next order` —
18px (`text-lg`) bold, `leading-tight`, `--foreground`. (Smaller than
the post-purchase variant because this panel is narrower.)

**Badge row** `mt-2`, flex wrap, `gap-2`:
- `−20%` pill: solid `--accent` bg, white text, 10px bold uppercase
  `tracking-wide`, `px-2.5 py-1`, square.
- `$0 EXTRA SHIPPING` pill: 1px `--accent` border, `--accent` text,
  transparent bg, 10px bold uppercase, square.

**Breed carousel** `mt-4`, flex `gap-2`, `overflow-x-auto`,
`overscroll-x-contain`, `pb-2`, thin scrollbar.
- Tile width **118px** (`w-[118px]`) — narrower than post-purchase to
  fit the right-rail width.
- Tile padding `p-2`, square `rounded-none`.
- Cover well `h-20` (80px), bg `--muted`, flex-center.
- Real cover photo: 72×54px (`h-18 w-[54px]`), object-cover.
- Placeholder cover: 72×54px, `bg-secondary`, text
  `--secondary-foreground`, `p-1.5`, 7px (`text-[7px]`) bold uppercase.
  Three stacked labels: `THE DOG BOOK` / big number `04`+ (16px /
  `text-base`) / 2-line breed name clamp.
- Label `min-h-8` (32px) 11px (`text-[11px]`) 600 `leading-tight`.
- Selected: `border-accent`, `bg-accent/5`, `ring-1 ring-accent`.

**Below carousel** `mt-1` flex `justify-between` items-center:
- Left: `Swipe →`, 12px `--muted-foreground`.
- Right: counter + arrows. Counter 12px bold tabular-nums muted.
  Arrow buttons `size-8` (32×32) **not 36 like post-purchase** —
  compact to fit rail. `ArrowLeft` / `ArrowRight` 14px (`size-3.5`).

**Action row** `mt-4`, flex items-center `gap-3`, border-top 1px
`--border`, `pt-4`:
- Cover 64×48 (`h-16 w-12`).
- Breed name 14px (`text-sm`) 600, truncate.
- Price line baseline, `gap-2`, nowrap: `<s>$120.00</s>` 12px muted
  + `$96.00` 16px (`text-base`) bold.
- CTA `ADD` — `min-h-12` (48px), `rounded-none`, `px-5`, 14px bold.
  Bg `--foreground`, text white. No price in label (space is tight;
  price is right next to it already).

**Trust row** `mt-3`, centered flex `gap-1.5`, 12px muted:
`🔒 (LockKeyhole 12px) One click · ships together · no card details`.

### 3b. Order summary (reused molecule)

Rendered via `<OrderSummary addedBreed={…} total={…} />` from
`demo.tsx`. Spec:

- `mt-6` from the offer panel.
- `space-y-5` vertical rhythm.
- **Line item row**: flex items-center `gap-3`.
  - Beagle placeholder cover 64×48 relative, with a quantity dot
    absolutely positioned `-right-2 -top-2`: 20×20 (`size-5`) grid
    place-items-center, `rounded-full`, bg `--foreground`, text white
    10px — content `1`.
  - Flex-1 label `Beagle` 14px 500.
  - Right-aligned price `$120.00` 14px.
- **If added breed** → extra flex-between row: `<breed> · 20% off` ↔ `$96.00`.
- **Totals block** border-top 1px `--border`, `pt-4`, `space-y-2` 14px:
  - `Subtotal` ↔ `$120.00` / `$216.00`
  - `Shipping` ↔ `$9.95` / `Included`
  - `Total` row `pt-2`, 18px (`text-lg`) bold:
    `Total` ↔ `USD` (small 12px muted mr-2) + `$120.00` or `$216.00`.

### 3c. Platform note
`mt-4`, 12px muted, `leading-relaxed`:
`**Note:** placing this block inside checkout requires Shopify Plus.
Without Plus, use the cart drawer version.`

Delete this line in production.

---

## 4. Added-state (confirmation inside the offer panel)

Same panel geometry, same bg + border; swap inner content with:

- Center-aligned column, `min-h-[280px]`.
- `Check` icon 40px (`size-10`) `--accent`.
- `h3` 20px (`text-xl`) semibold `mt-4`: **Added to your order**.
- Paragraph `mt-2` 14px muted:
  `Your <breed> book ships with your Beagle — $0 extra shipping.`
- Ghost button `mt-5` 14px underline muted:
  `Back to the offer` — resets `added` to false (dev-only; in prod this
  should either be hidden or replaced with "Remove this item").

When `added` is true, the right rail totals update:
- Add line `<breed> · 20% off  $96.00`
- Subtotal → `$216.00`
- Shipping → `Included`
- Total → `$216.00`

---

## 5. Carousel behavior

Simpler than post-purchase: **no programmatic scroll on tile click**.
The arrow buttons also just change `selected` without scrolling the
strip into view. This is deliberate — the right rail is narrow (~430px)
and shows ~3 tiles at a time; forcing a scroll on click would feel
jittery.

So the ONLY ways the carousel scrolls are:
- Native touch/trackpad swipe.
- The user drags the thin scrollbar.

Arrow buttons change the "which breed is in the Action row below"
only; the strip doesn't auto-chase them. If this is confusing in
usability testing, we can add the same `scrollTo` logic from the
post-purchase doc. For v1, ship without it.

---

## 6. Mobile view detail (< 1024px)

- No layout change inside the right column — it already fits a phone
  width.
- Column stacks under the form.
- The right-rail aside background `--muted/50` becomes the dominant
  color of the lower half of the screen on mobile — this is fine
  visually; it separates "input" from "review" zones.
- Breed tiles stay 118px wide → ~3 per screen on a 360px device,
  with the 4th cut-off → scroll affordance is honest.

---

## 7. Accessibility

Same checklist as doc 01:
- Breed buttons: `aria-pressed`, `aria-label` by breed name.
- Prev/next buttons: `aria-label="Previous breed" / "Next breed"`,
  disabled at ends.
- Strip wrapper `aria-label="Choose from 13 dog breeds"`.
- Quantity dot on the order summary (`1`) is purely visual — the
  "Beagle" label line is the labeled source.
- Note: no timer here (unlike post-purchase + tracking + email).

---

## 8. Shopify Plus implementation notes

- **Extension target**: `purchase.checkout.cart-line-list.render-after`
  or `purchase.checkout.block.render` depending on desired placement.
  The right-rail position matches `cart-line-list.render-after`.
- **Discount application**: use Shopify Function (Discount) tied to a
  tag `upsell-20off`. The function reads the cart, if the upsell
  product is present THEN apply 20% off that single line.
- **Shipping = "Included"**: this is a copy claim, not a line change —
  shipping is already paid on the base order, we're declaring the
  upsell book ships in the same box. Backend: upsell line
  `requires_shipping: false` on the specific variant, OR a shipping
  rate rule in `shipping_rates.liquid` that detects the tag and
  returns 0.
- **No price appears in the ADD button label** — we rely on the
  compare-at + sale price right next to it. Matches Shopify Plus
  checkout convention of "do not duplicate the price on the CTA".

---

## 9. What to keep vs. drop in the Liquid port

**Keep:**
- Compact ADD button (no price) + big price on left → use the rail's
  horizontal space efficiently.
- 118px tile width — do not make them bigger; a wider rail breaks
  Shopify's own right-rail layout.
- `--muted/50` right-rail bg to match Shopify's native checkout.

**Drop:**
- Entire left column form rendering (Shopify handles it).
- The `<Field>` placeholder component.
- The dev-only platform note (`Shopify Plus required…`).
- "Back to the offer" ghost reset button.
