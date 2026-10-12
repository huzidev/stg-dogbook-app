# 00 — Design tokens (shared, post-purchase upsell)

Global tokens shared across every post-purchase upsell surface
(post-purchase one-click, cart drawer, checkout, order tracking,
confirmation email). Source of truth: `post-purchase-design/src/styles.css`
and `post-purchase-design/src/components/demo.tsx`. Referenced by all
other docs in this folder.

The design language is deliberately **neutral + utilitarian** — flat colors,
hairline borders, square corners on everything *inside* the upsell block,
one single accent green used for every money / urgency affordance. The
only "visually loud" elements are: (1) the countdown timer, (2) the
−20% / $0 EXTRA SHIPPING pills, (3) the solid black ADD button.

---

## Fonts

The whole prototype uses the OS default sans-serif stack — no web fonts.
Set on `body` in `src/styles.css`:

```css
body { font-family: Arial, Helvetica, sans-serif; letter-spacing: 0; }
```

| Role         | Family                       | Weight            | Where used                               |
|--------------|------------------------------|-------------------|------------------------------------------|
| Body / UI    | **Arial, Helvetica, sans-serif** | 400 / 500 / 600 / 700 | All copy, buttons, labels           |
| Mono / timer | **ui-monospace** (via Tailwind `font-mono`) | 700 bold, `tabular-nums` | `09:57` big timer, `23:46:58` small timer |

### Shopify / Dog Book implementation
In the Dog Book theme, we should keep the **same families already used
by the storefront** (Bebas Neue display + Work Sans body per
`docs/wholesale/00-design-tokens.md`). Specifically:

- Big section headlines (`Add a book, save 20% off your next order`) →
  **Work Sans 700** (not Bebas) so it stays readable at small sizes and
  in email HTML; 20–28px desktop, 18–22px mobile.
- Small uppercase labels (`YOUR CART`, `COMPLETE YOUR COLLECTION`,
  `−20%`, `$0 EXTRA SHIPPING`, `CONFIRMED`, `THE DOG BOOK` email header)
  → **Work Sans 600–700, uppercase, letter-spacing 0.14em–0.25em**.
- Timer digits (`09:57`, `23:46:58`) → **monospaced** (`ui-monospace` or
  theme-level mono fallback), `font-variant-numeric: tabular-nums`,
  bold. This is non-negotiable — proportional fonts jitter when seconds
  tick.
- Body copy → **Work Sans 400/500**.

---

## Colors

All source values are OKLCH. Approximate hex given for Shopify color
pickers. **Eyedrop from the design screenshots to confirm final hex**.

| Token                   | OKLCH source                | Approx hex | Role in these UIs                                                |
|-------------------------|-----------------------------|-----------:|------------------------------------------------------------------|
| `--background`          | `oklch(0.99 0.002 80)`      | `#FDFCF8`  | Page background behind every mock (warm off-white)               |
| `--card`                | `oklch(1 0 0)`              | `#FFFFFF`  | White card surfaces (cart drawer, checkout left column, email body) |
| `--foreground`          | `oklch(0.16 0.006 70)`      | `#1E1C18`  | Primary text, black ADD button bg, `−20%` pill bg                 |
| `--primary-foreground`  | `oklch(0.99 0.002 80)`      | `#FDFCF8`  | Text on ADD button, text on `−20%` pill                           |
| `--muted`               | `oklch(0.965 0.004 80)`     | `#F6F4EF`  | Light-grey backgrounds (breed tile well, Beagle line row)        |
| `--muted-foreground`    | `oklch(0.48 0.01 70)`       | `#7B766D`  | Secondary text, `Swipe →`, `Order in the next…`, strikethrough `$120.00` |
| `--secondary`           | `oklch(0.95 0.015 85)`      | `#F0ECE2`  | Cart drawer cross-sell panel bg (`Complete your collection`), `CONFIRMED` email pill bg |
| `--accent` (green)      | `oklch(0.48 0.1 150)`       | `#2F6E3E`  | **The one highlight color** — countdown digits, `−20%` pill bg, `$0 EXTRA SHIPPING` border + text, offer-card border, `Order #3272 confirmed`, selected-breed ring + bg tint |
| `--accent-foreground`   | `oklch(0.98 0.01 80)`       | `#FBF9F2`  | Text on green `−20%` pill                                        |
| `--border`              | `oklch(0.89 0.006 75)`      | `#DED9CF`  | All hairline card borders, dividers, input borders              |
| `--input`               | `oklch(0.86 0.006 75)`      | `#D4CEBE`  | Checkout input borders                                           |

Named button-only colors (checkout express row):

| Button  | Hex       | Text color |
|---------|-----------|------------|
| Shop    | `#5A31F4` | white      |
| PayPal  | `#FFC439` | `#182E49`  |
| G Pay   | `#1E1C18` (foreground) | white |
| Venmo   | `#008CFF` | white      |

### Accent tint
`bg-accent/5` = **green at ~5% opacity** → the pale mint fill of every
offer card (post-purchase banner, checkout offer panel, tracking offer
panel, email offer panel, selected breed tile). In Liquid use
`rgba(47, 110, 62, 0.05)`.

---

## Spacing scale

Tailwind-derived; translated to px for Liquid/CSS.

| Token    | px  | Where                                                    |
|----------|-----|----------------------------------------------------------|
| `gap-1`  | 4   | Pill → pill, arrow nav buttons                           |
| `gap-1.5`| 6   | Icon → text inside `One click · ships together`          |
| `gap-2`  | 8   | Breed tile → breed tile, badge → badge                   |
| `gap-3`  | 12  | Book cover → text in action row                          |
| `gap-4`  | 16  | Cart drawer item cover → text                            |
| `gap-5`  | 20  | Banner headline → timer (desktop post-purchase)          |
| `gap-6`  | 24  | Breed strip → action row                                 |
| `gap-8`  | 32  | Checkout left col section → section                      |
| `p-3`    | 12  | Cross-sell card inner padding (small)                    |
| `p-4`    | 16  | Cart drawer cross-sell panel inner padding               |
| `p-5`    | 20  | Tracking + email offer panel inner padding               |
| `px-5 py-4` | 20/16 | Post-purchase banner inner padding (mobile)         |
| `px-6 py-5` | 24/20 | Cart drawer header padding                          |
| `py-6`   | 24  | Standard button vertical padding (CHECK OUT)             |
| `py-10`  | 40  | Checkout left-column vertical padding (desktop)          |

---

## Radii

**Everything is `rounded-none` (square corners)** inside the upsell UI —
breed tiles, offer cards, ADD / CHECK OUT buttons, arrow nav buttons,
all pills, every border.

Exceptions (keep rounded):
- Checkout input fields use `rounded-md` (6px) — matches native Shopify
  checkout.
- Round account icon in tracking header (`UserCircle` is naturally
  circular).
- The small `1` quantity badge on the Beagle thumbnail is a
  `rounded-full` dot.
- The checked "Confirmed" circle on the post-purchase page is a
  `rounded-full` border-2 ring.
- Thank-you page "Track order with Shop" button is `rounded-md` (that's
  Shopify's own button, we're not styling it).

In Liquid: set `--radius: 0` on the upsell block scope so nested Tailwind
`rounded-sm/md/lg` tokens all compute to 0, OR hardcode
`border-radius: 0 !important` on the block root.

---

## Max widths & containers

| Surface                               | Max width | Horizontal padding              |
|---------------------------------------|-----------|---------------------------------|
| Mock frame outer (every screen)       | 1500px    | `px-4` / `sm:px-6`              |
| Post-purchase inner column            | 900px     | `px-4` / `sm:px-8`              |
| Checkout + thank-you inner (two col)  | ~880px per side, split `1.08fr / .92fr` | `px-6` / `lg:px-10` |
| Order tracking inner                  | 6xl (1152px), grid `220px / 1fr`, right column `max-w-3xl` (768px) | `px-4` |
| Confirmation email body               | `max-w-xl` (576px), centered | `px-5` / `sm:px-10` |
| Cart drawer aside                     | **430px fixed** on desktop (`lg:grid-cols-[1fr_430px]`), full-width on mobile | `px-5` / `px-6` for header |

---

## Icons

All from `lucide-react` at `size-3` (12px) / `size-3.5` (14px) /
`size-4` (16px) / `size-5` (20px). In Liquid, swap for inline SVG with
`stroke-width:2`, `stroke:currentColor`, `fill:none`.

| Icon          | Source import         | Where                                           |
|---------------|-----------------------|-------------------------------------------------|
| `CheckCircle2`| lucide                | Order confirmed row, success state              |
| `Check`       | lucide                | Confirmed status pill in tracking + email, added-to-cart check |
| `LockKeyhole` | lucide                | `One click · ships together · no card details`  |
| `ArrowLeft/ArrowRight` | lucide       | Breed carousel prev/next arrow buttons          |
| `Minus/Plus`  | lucide                | Cart quantity stepper, cross-sell `+` add       |
| `X`           | lucide                | Cart drawer close                               |
| `UserCircle`  | lucide                | Order tracking header account icon              |
| `ArrowUpRight`| lucide                | Index page card arrows (not used in prod)       |

---

## Shared molecules (DO reuse)

All five upsell surfaces share these three molecules — build once in
Liquid, drop everywhere.

### 1. Headline + badges block
```
<h2>Add a book, save 20% off your next order</h2>
[−20%]  [$0 EXTRA SHIPPING]
```
- `−20%` pill: solid `--accent` bg, white text, 10–12px bold uppercase,
  tracking-wide, `px-2.5 py-1`, square.
- `$0 EXTRA SHIPPING` pill: 1px `--accent` border, `--accent` text,
  transparent bg, same geometry.

### 2. Breed carousel strip
- Horizontal scroll row, `snap-x snap-mandatory` on post-purchase,
  plain horizontal scroll elsewhere.
- Each tile: 118–158px wide (142px post-purchase mobile, 158px
  post-purchase desktop, 118px checkout, 126px tracking + email).
- Tile = book cover well (`bg-muted`, flex-center) + breed name label
  below (11–13px semibold, min-h 32–40px for 2 lines).
- Selected tile: `border-accent`, `bg-accent/5`, `ring-1 ring-accent`.
- Below strip: left = `Swipe →` or `All breeds available — scroll to see
  more →` hint (12px muted); right = `n / 13` counter + two square 32px
  arrow buttons (prev/next, disabled at ends).

### 3. Action row (cover + price + CTA)
- Book cover thumbnail (48×64 or 60×80).
- Breed name (14–16px semibold, truncate).
- Price line: `<s>$120.00</s> **$96.00**` baseline-aligned; strike is
  12–14px muted, bold price is 16–20px.
- CTA on the right: solid black (`--foreground`) bg, white text, bold
  uppercase, min-height 48–56px. Label swaps between `ADD`, `ADD —
  $96.00`, or `Add to my order` per surface — see each UI doc.
- Trust line below, centered, 12px muted:
  `🔒 One click · ships together · no card details`
  (tracking + email drop the "ships together" segment because it's
  implied by the order context).

---

## Responsive breakpoints

Tailwind defaults — do not override.

| Breakpoint | Min width | Primary effect in these UIs                                           |
|------------|-----------|-----------------------------------------------------------------------|
| `sm`       | 640px     | Post-purchase: timer size 48→60px, headline 20→24px, `ADD` → `ADD — $96.00`, "ships together" line widens, trust-row shows text next to `+` icon in cross-sell |
| `md`       | 768px     | Tracking: 220px sidebar appears                                       |
| `lg`       | 1024px    | Cart drawer: left preview column appears (BEAGLE cover + wordmark); Checkout + thank-you: splits into two columns 1.08fr / .92fr |

Mobile baseline (< 640px): single column everywhere, breed strip stays
horizontal-scroll, CTA goes full-width in tracking + email action rows.

---

## Motion

Only two animated things:

1. **Carousel snap** → `scrollTo({ behavior: "smooth" })`, overridden
   to `"instant"` under `prefers-reduced-motion: reduce`. In Liquid:
   same conditional via `matchMedia`.
2. **Countdown tick** → `setInterval(…, 1000)` driving a `role="timer"`
   span with `tabular-nums`. See per-UI docs for duration (10 min on
   post-purchase, ~24 h on tracking + email).

No fade-ins, no slide-ins, no bounce. The one gradient in use is the
fade-out at the bottom of the cart cross-sell scroll list
(`bg-gradient-to-t from-secondary via-secondary/80 to-transparent`,
height 48px) — purely a scroll affordance.

---

## Shared data

The 13 breeds (first 3 have real cover photos; the next 10 render as
numbered placeholder covers in `--secondary` / `--secondary-foreground`):

1. Golden Retriever (photo)
2. Dachshund (photo)
3. French Bulldog (photo)
4. Labrador Retriever
5. Cavalier King Charles Spaniel
6. Poodle
7. Border Collie
8. Corgi
9. German Shepherd
10. Shiba Inu
11. Boxer
12. Dalmatian
13. Bernese Mountain Dog

Prices are flat for every book: compare-at `$120.00`, discounted
`$96.00` (= 20% off). Shipping on the discounted upsell copy is always
"$0 extra shipping" / "Included" — the message is "ships with your
existing order".

The customer already has 1× **Beagle** in cart/order (fixed example).
That book has no real photo in the prototype — it renders as the
olive-green placeholder cover (`#4D543A` bg, cream text, 🐶 glyph).
