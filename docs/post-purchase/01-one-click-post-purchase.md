# 01 — One-click post-purchase upsell

**Source route:** `post-purchase-design/src/routes/upsell-1-clic.tsx`
**Design screenshot:** `OPTION 1 · ONE-CLICK OFFER AFTER PAYMENT`

The screen the customer sees **after payment is captured but before the
Shopify thank-you page**. Shopify renders this in a Post-Purchase
Extension iframe at a fixed max width — hence the 900px center column.

Everything inside is one tall card on a warm off-white page.

---

## 1. Layout (both views)

```
┌────────── mock frame (max 1500px, off-white) ──────────┐
│  OPTION 1 · ONE-CLICK OFFER AFTER PAYMENT     Example placement
│  ┌─────────── card (border, white bg) ────────────┐
│  │                                                 │
│  │       ✓ Order #3272 confirmed  (green, center) │
│  │                                                 │
│  │   ┌──── offer banner (green border, mint bg) ─┐│
│  │   │ Add a book, save 20% off your…    09:57   ││
│  │   │ [−20%] [$0 EXTRA SHIPPING]   OFFER ENDS IN││
│  │   └──────────────────────────────────────────┘│
│  │                                                 │
│  │   ┌──┐ ┌──┐ ┌──┐ ┌──┐ ┌──┐  →   (breed strip) │
│  │   │GR│ │DA│ │FB│ │04│ │05│                    │
│  │   └──┘ └──┘ └──┘ └──┘ └──┘                    │
│  │   Swipe →                 1/13  [←] [→]        │
│  │   ─────────────────────────────────────────── │
│  │   📘 Golden Retriever                          │
│  │       $̶1̶2̶0̶  $96.00         [ ADD — $96.00 ]  │
│  │                                                 │
│  │        🔒 One click · ships together ·         │
│  │              no card details                   │
│  │                   No thanks                    │
│  │                                                 │
│  └─────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────┘
```

### Container

| Property          | Desktop                                    | Mobile (< 640px)                     |
|-------------------|--------------------------------------------|--------------------------------------|
| Outer page bg     | `--background` `#FDFCF8`                   | same                                 |
| Mock frame        | `max-w-[1500px]`, `px-6 py-9`              | `px-4 py-6`                          |
| Card border       | 1px `--border` `#DED9CF`                   | same                                 |
| Card bg           | `--card` `#FFFFFF`                         | same                                 |
| Inner column      | `max-w-[900px]` centered, `px-8 py-10`     | `px-4 py-7`                          |

---

## 2. Order-confirmed row

- Centered, flex row with `gap-2`.
- Icon: `CheckCircle2` 20px (`size-5`), color `--accent` green.
- Text: `Order #3272 confirmed`, 14px (`text-sm`), weight 500
  (`font-medium`), color `--accent`.

---

## 3. Offer banner (headline + badges + timer)

The visual hero of the screen.

| Property            | Desktop                                       | Mobile                                   |
|---------------------|-----------------------------------------------|------------------------------------------|
| Container           | `mt-5` flex row, align-center, `gap-5`        | same (headline wraps, timer stays right) |
| Border              | 1px `--accent` green                          | same                                     |
| Background          | `bg-accent/5` (green at 5% opacity) `#F2F7F3` | same                                     |
| Padding             | `px-6 py-4` (24/16)                           | `px-5 py-4` (20/16)                      |
| Headline (`<h2>`)   | 24px (`text-2xl`), bold, `leading-tight`      | 20px (`text-xl`)                         |
| Headline color      | `--foreground` `#1E1C18`                      | same                                     |
| Badge row           | `mt-2` flex, `gap-2`, wraps                   | same                                     |
| `−20%` pill         | solid `--accent` bg, white text, 12px bold uppercase, `tracking-wide`, `px-2.5 py-1` square | same |
| `$0 EXTRA SHIPPING` | 1px `--accent` border, `--accent` text, transparent bg, same geometry | same |
| Timer digits        | 60px (`text-5xl`), font-mono, bold, `tabular-nums`, `leading-none`, color `--accent` | 48px (`text-4xl`) |
| "OFFER ENDS IN" label | `mt-1` block, 10px uppercase, `tracking-wide`, 600 weight, color `--muted-foreground` | same |
| Role                | `<span role="timer" aria-label="Offer ends in MM:SS">` | same                             |

**Countdown behavior**
- Initial: `OFFER_SECONDS = 600` → `10:00`.
- Compute deadline = `Date.now() + 600000` once; tick every 1000ms with
  `Math.max(0, Math.ceil((deadline - Date.now()) / 1000))`.
- Format `MM:SS`, zero-padded.
- On reach 0 → swap entire inner block for the "This offer has ended"
  success panel (same panel as accepted/declined; see §7).

---

## 4. Breed carousel

Horizontally scrolling row of 13 tiles.

| Property           | Desktop                            | Mobile                             |
|--------------------|------------------------------------|------------------------------------|
| Container          | `mt-6`, flex, `gap-2`, `overflow-x-auto`, `snap-x snap-mandatory`, `overscroll-x-contain`, thin scrollbar, `touch-pan-x`, `pb-3` | same |
| Tile width         | 158px (`w-[158px]`)                | 142px (`w-[142px]`)                |
| Tile padding       | `p-2` (8px)                        | same                               |
| Tile radius        | 0 (`rounded-none`)                 | same                               |
| Tile base          | `variant="outline"` → 1px `--input` border, white bg | same              |
| Tile selected      | `border-accent`, `bg-accent/5`, `ring-1 ring-accent` | same              |
| Cover well         | inside tile, `h-25` (100px), flex-center, bg `--muted` | same           |
| Cover photo (1–3)  | 92×69px (`h-23 w-[69px]`), object-cover | same                          |
| Cover placeholder (4–13) | 92×69px flex column, `bg-secondary`, `text-secondary-foreground`, `p-2`, 8px bold uppercase, items: `THE DOG BOOK` / big "04" / 2-line breed name | same |
| Label              | 12px semibold `leading-tight`, `min-h-10` (40px for 2 lines) | same |
| Aria               | `aria-pressed`, strip has `aria-label="Choose from 13 dog breeds"` | same |

### Below carousel
Flex row, `mt-1`, `justify-between`, align-center:
- Left: `Swipe →`, 12px `--muted-foreground`.
- Right: counter `1 / 13` (12px semibold, tabular-nums,
  `--muted-foreground`) + two `size-9` (36×36) square outline buttons
  with `ArrowLeft` / `ArrowRight` 16px, disabled at ends.

### Behavior
`choose(index)` → `setSelected(index)` → programmatic
`stripRef.current.scrollTo({ left: tile.offsetLeft -
strip.offsetLeft - 12, behavior: smooth|instant })`. The `-12` offset
leaves a 12px breathing margin so the selected tile isn't glued to the
viewport edge.

---

## 5. Action row (cover + price + CTA)

| Property          | Desktop                                       | Mobile                             |
|-------------------|-----------------------------------------------|------------------------------------|
| Container         | `mt-6`, flex, items-center, `gap-4`, `border-t` 1px `--border`, `pt-6` | `gap-3` |
| Book cover        | 80×60px (`h-20 w-15`)                         | same                               |
| Breed name        | `font-semibold` (default 16px), truncate      | same                               |
| Price line        | flex items-baseline `gap-2`, nowrap, overflow-hidden | same                        |
| Strikethrough     | 14px (`text-sm`), `--muted-foreground`, no shrink | same                           |
| Current price     | 20px (`text-xl`) bold                         | 18px (`text-lg`) bold              |
| CTA button        | `min-h-14` (56px), `rounded-none`, `px-8`, 16px (`text-base`) bold | `px-5`, 14px (`text-sm`) bold, same height |
| CTA label         | `ADD — $96.00`                                | `ADD`                              |
| CTA bg / text     | `--foreground` / `--primary-foreground`       | same                               |

Trust micro-copy below, `mt-3`, centered, flex, `gap-1.5`, 12px
`--muted-foreground`: `🔒 (LockKeyhole 12px) One click · ships together ·
no card details`.

`No thanks` link: `mt-1`, centered, ghost button, 14px underline
`underline-offset-4`, color `--muted-foreground`. Click → declined state.

---

## 6. States

Three terminal states collapse the entire inner block into a 380px-min
centered success panel:

| Trigger      | Headline                   | Supporting copy                                                     |
|--------------|----------------------------|---------------------------------------------------------------------|
| `accepted`   | **Added to your order**    | `Your <breed> book ships with your Beagle — no extra shipping.`     |
| `declined`   | **Your order is all set**  | `Your Beagle order is confirmed.`                                   |
| `expired`    | **This offer has ended**   | (no supporting copy)                                                |

Panel geometry:
- `max-w-lg` (512px), centered, `min-h-[380px]`, flex column, text-center.
- `CheckCircle2` icon 48px (`size-12`), `--accent` green.
- `h2` 30px (`text-3xl`) semibold.
- Supporting paragraph `mt-3`, `--muted-foreground`.
- Button `BACK TO EXAMPLE` → `mt-7`, `rounded-none`, `px-8`, default
  black. Resets `accepted`, `declined`, and `secondsLeft` back to 600.

---

## 7. Behavior spec (for Shopify implementation)

| Trigger                   | Action                                                              |
|---------------------------|---------------------------------------------------------------------|
| Tile click                | select breed + scroll strip so tile is 12px from left               |
| `→` arrow                 | `choose(selected + 1)`; disabled at index 12                        |
| `←` arrow                 | `choose(selected - 1)`; disabled at index 0                         |
| `ADD` button              | capture offer via Shopify post-purchase API (`Shopify.applyChanges`); switch to Accepted panel |
| `No thanks`               | call `Shopify.done()`; switch to Declined panel                     |
| Timer reaches `00:00`     | hide ADD / No thanks; switch to Expired panel; keep "No thanks" path to Shopify.done() |
| Reduced motion            | carousel scroll → `behavior: "instant"`                             |

### Shopify post-purchase extension specifics
- Max width is enforced by Shopify (~900px) → the inner `max-w-[900px]`
  is already correct.
- No shipping address re-collection: use `Shopify.applyChanges` with a
  single additional product variant and discount code or discount
  application for 20% off that line.
- The ADD action MUST NOT re-prompt for payment — the extension runs
  with the already-authorized payment token.
- Order number (`#3272`) comes from `inputData.initialPurchase.order.id`
  — hardcoded only in prototype.

---

## 8. Mobile view detail (< 640px)

Everything stacks the same way (there is no desktop/mobile layout
swap, only size reductions). Specific overrides:

- Mock frame padding: `px-4 py-6`.
- Inner column padding: `px-4 py-7`.
- Headline 20px, timer 48px.
- CTA shows `ADD` only (not `ADD — $96.00`).
- Breed tile 142px wide (vs 158px desktop) — more tiles visible per
  swipe on narrow phones is deliberate; keeps "Swipe →" affordance
  honest.
- Carousel scrollbar: thin (iOS/Safari ignores). The ↔ arrow buttons
  stay visible on mobile — they double as a tap target when swiping
  is awkward (one-handed, large thumb).
- No shadow / no shadow-elevation changes between viewports.

---

## 9. Accessibility checklist

- Timer: `role="timer"` + `aria-label="Offer ends in MM:SS"` recomputed
  every tick (polite announcement; some screen readers will skip).
- Breed buttons: `aria-pressed={selected === index}`.
- Prev/next buttons: `aria-label="Previous breed" / "Next breed"`,
  `disabled` at ends (focus skips, pointer events disabled).
- Carousel strip: `aria-label="Choose from 13 dog breeds"`.
- Focus-visible ring: 1px `--ring` on all interactive elements (comes
  from base button styles).
- `prefers-reduced-motion` honored for scroll animation.
- All interactive targets ≥ 36px tap height; CTA ≥ 56px.

---

## 10. What to keep vs. drop in the Liquid port

**Keep:**
- 1-screen scroll, no modal, no accordion.
- Green accent as the ONLY highlight color.
- Monospaced timer, `tabular-nums`.
- Square corners everywhere.
- Three terminal states (accepted / declined / expired) sharing one
  panel.

**Drop / simplify:**
- `BOOKS` array constant from prototype → replace with real Shopify
  product metafields (breed → variant mapping, cover image, compare-at
  + sale price).
- `OFFER_SECONDS = 600` → make a theme setting `offer_duration_minutes`
  (default 10).
- The hard-coded Beagle `#4D543A` placeholder cover → use real product
  featured image.
