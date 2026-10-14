# Email Template v3 — Order Confirmation (Lovable port, faithful pass)

**Source of truth:** `docs/post-purchase-design-lovable/src/routes/email.tsx`
**Current implementation:** `docs/order-confirmation-email.liquid`
**Target:** replace the current body of `docs/order-confirmation-email.liquid` so it visually matches `email.tsx` as closely as email HTML allows (Shopify Liquid + inline CSS + table layout, Apple Mail / iOS Mail / Gmail / Outlook).

The current file is already a port of the Lovable design, but a side-by-side read turned up ~10 concrete deviations. This plan lists each one, the exact Lovable value, the current Liquid value, and the fix. **No code yet** — this is the alignment pass to approve before I touch the Liquid.

---

## 1. Design tokens (from `styles.css` → inline hex equivalents)

Lovable uses oklch tokens via Tailwind. Email HTML can't use oklch (Outlook etc. will choke), so these are the hex equivalents already used in the current Liquid — keeping them, documented here for reference:

| Token              | oklch (Lovable)                 | Hex (email)   | Where it's used                                              |
| ------------------ | ------------------------------- | ------------- | ------------------------------------------------------------ |
| background         | `oklch(0.99 0.002 80)`          | `#FDFCF9`     | not used in email (outer uses `--muted`)                     |
| foreground         | `oklch(0.16 0.006 70)`          | `#1E1C18`     | all primary text, CTA bg, header wordmark                    |
| card               | `oklch(1 0 0)`                  | `#FFFFFF`     | main email card bg                                           |
| muted              | `oklch(0.965 0.004 80)`         | `#F6F4EF`     | outer page bg, line-item row bg, tile inner image area       |
| muted-foreground   | `oklch(0.48 0.01 70)`           | `#7B766D`     | subcopy, shipping note, counter text                         |
| border             | `oklch(0.89 0.006 75)`          | `#DED9CF`     | header/total/footer dividers, tile borders (unselected)      |
| accent (green)     | `oklch(0.48 0.1 150)`           | `#2F6E3E`     | CONFIRMED text, timer, badges, upsell border, selected tile  |
| accent-foreground  | `oklch(0.98 0.01 80)`           | `#FFFFFF`     | text on filled green badge                                   |
| accent/5 (5% tint) | `oklch(0.48 0.1 150 / 0.05)`    | `#F2F7F3`     | upsell panel bg, selected tile bg                            |
| secondary          | `oklch(0.95 0.015 85)`          | `#F0ECE2`     | CONFIRMED pill bg                                            |
| radius             | `0.25rem`                       | `4px`         | **not applied anywhere in email.tsx** (every box uses `rounded-none`) |

**Font stack.** Lovable `styles.css` sets `body { font-family: Arial, Helvetica, sans-serif; }`. The current Liquid uses `'Helvetica Neue', Helvetica, Arial, sans-serif` which is slightly fancier. **Decision needed:** keep `Helvetica Neue` (nicer where available) or match Lovable exactly with `Arial, Helvetica, sans-serif`? Recommend keeping `Helvetica Neue` — Lovable's choice is just a Tailwind default, not a deliberate brand pick.

**Radius.** Email.tsx explicitly uses `rounded-none` on tiles, CTA, and arrow buttons. The current Liquid is already radius-free. Keep it that way (no `border-radius` anywhere).

---

## 2. Section-by-section audit

For each section: `Lovable spec` → `Current Liquid` → `v3 action`.

### 2.1 Outer wrapper + card

- **Lovable:** outer `bg-muted px-3 py-5 sm:px-4 sm:py-8`, inner card `max-w-xl bg-card` (36rem = 576px, white).
- **Liquid:** outer bg `#F6F4EF`, container `width:576px`, white card. ✅ matches.
- **v3:** no change.

### 2.2 Header wordmark "THE DOG BOOK"

- **Lovable:** `text-sm font-bold tracking-[0.25em]` + border-b, py-4, centered.
  - 14px, weight 700, letter-spacing 3.5px, 16px vertical padding, bottom border `#DED9CF`.
- **Liquid:** 14px, weight 700, letter-spacing 3.5px, padding `16px 40px`, border-bottom `#DED9CF`. ✅ matches.
- **v3:** no change.

### 2.3 Greeting row + CONFIRMED pill

- **Lovable:** 2-col flex, left = `text-lg font-bold` (18px/700) + `text-xs text-muted-foreground` (12px/#7B766D), right = pill `bg-secondary px-2.5 py-1.5 text-[10px] font-bold text-accent` + check icon.
  - Pill: bg `#F0ECE2`, text `#2F6E3E` (green), 10px/700. **Lovable does NOT letter-space the pill** (just relies on the literal uppercase text "CONFIRMED").
- **Liquid:** matches greeting; pill adds `letter-spacing:1.2px; text-transform:uppercase`.
- **v3 action:** keep `letter-spacing:1.2px` on the pill — Lovable's letter is already bold caps and reads similar; the extra 1.2px helps email rendering clarity. **No change**, but note Lovable omits it.

### 2.4 Line-item rows

- **Lovable:** `flex items-center gap-3 bg-muted p-3` with:
  - Book cover: **`h-14 w-11`** → **44px wide × 56px tall** (portrait book).
  - Title: `truncate text-sm font-bold` (14px/700).
  - Subtitle: `text-xs text-muted-foreground` (12px/#7B766D) — "Your Dog Book".
  - Price: `text-sm font-bold` (14px/700).
- **Liquid:** cover `width:56; height:44` — **this is landscape 56×44**, i.e. the dimensions are swapped. The real covers are portrait.
- **v3 action — FIX:** change line-item `<img>` to `width="44" height="56"` with inline `width:44px; height:56px`. Keep `object-fit:cover` so the cropped area still looks like a book cover.

### 2.5 Totals block

- **Lovable:** `space-y-1.5 text-sm` wrapper; each `Subtotal`/`Shipping` row is `flex justify-between px-1`. **Labels inherit the default foreground color (`#1E1C18`), not muted.** The small shipping-note at the bottom (`Ships to … arriving …`) is the only `text-muted-foreground` element here.
- **Liquid:** labels (`Subtotal`, `Shipping`, `Tax`) are set to `color:#7B766D` (muted). The amounts next to them are default color.
- **v3 action — FIX:** remove `color:#7B766D` from the Subtotal / Shipping / Tax label cells. Keep muted only on the "Ships to … arriving in 8–12 weeks, tracked." sentence.
- **Discount row:** Lovable doesn't show this (no live discount in the mock). Liquid shows it in green `#2F6E3E` when present. Keep as-is.
- **Total row:** `border-t border-border pt-2 text-base font-bold` (16px/700, top border). Liquid matches. ✅

### 2.6 Upsell panel container

- **Lovable:** `mt-5 border border-accent bg-accent/5 p-5` → 1px green border `#2F6E3E`, bg `#F2F7F3`, padding 20px, top margin 20px.
- **Liquid:** border `#2F6E3E`, bg `#F2F7F3`, padding 20px. ✅ matches.
- **v3:** no change.

### 2.7 Upsell headline + sub

- **Lovable:** headline `text-2xl font-bold leading-tight` → 24px/700/line-height 1.25.
- **Liquid:** 24px/700/line-height 1.2. ✅ matches (1.2 vs 1.25 is imperceptible).
- **Sub (Lovable):** 14px muted + inline timer styled as `font-mono text-base font-bold tabular-nums text-accent` → 16px/700/green/monospace with tabular-nums.
- **Sub (Liquid):** 14px muted + strong green bold (**no size bump, no monospace**).
- **v3 action — minor fix:** bump the deadline date to `font-size:16px; color:#2F6E3E; font-weight:700; font-family: 'SF Mono', Menlo, Consolas, monospace; font-variant-numeric: tabular-nums;` inside the subcopy. This is a date not a countdown, but matching the Lovable styling preserves the visual rhythm.
  - **Decision:** worth it? Monospace in the middle of a sentence can look jarring on dates like "October 15, 2:30 PM". Alternative: keep sans-serif, just bold + green + 16px. **Recommend:** bold + green + 16px, drop the monospace.

### 2.8 Badges

- **Lovable:** two inline badges, `px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide`, filled `−20%` (`bg-accent text-accent-foreground`) + outlined `$0 extra shipping` (`border border-accent text-accent`), `gap-2` between.
- **Liquid:** filled green `#2F6E3E` with white `−20%` + outlined green `$0 Extra Shipping`, 10px/700/uppercase, letter-spacing 1px, 8px gap. ✅ matches.
- **v3:** no change. (`tracking-wide` ≈ 0.025em ≈ 1px at 10px, close enough.)

### 2.9 Breed scroll strip (the slider)

This is the most visually distinctive piece and where the current Liquid diverges most.

**Lovable (`email.tsx:71-79`):**
- Container: `flex gap-2 overflow-x-auto overscroll-x-contain pb-2 [scrollbar-width:thin]` — 8px gap, horizontal scroll with thin scrollbar.
- Each tile (`Button variant="outline"`): `h-auto w-[126px] shrink-0 flex-col items-stretch gap-2 whitespace-normal rounded-none p-2 text-left` + hover/selected `border-accent bg-accent/5 ring-1 ring-accent`.
  - Width 126px, padding 8px, left-aligned text, no radius, border 1px (gray default, green when selected).
- Inner image area: `flex h-20 items-center justify-center bg-muted` → 80px tall, centered, bg `#F6F4EF`.
- Book image inside: `h-18 w-[54px]` → **54px wide × 72px tall** (portrait).
- Label: `min-h-8 text-[11px] font-semibold leading-tight` → 32px min height, 11px/600 label text.

**Liquid (`order-confirmation-email.liquid:213-237`):**
- Scrollable div with `overflow-x:auto`, `white-space:nowrap`, `font-size:0` for inline-block alignment.
- Tiles are `<a>` tags with `width:126px; margin-right:8px`. ✅ good.
- Inner image area: `padding:12px bg #F6F4EF; text-align:center`. Image is **`width:80 height:100`** — too big (80×100 vs Lovable's 54×72).
- Label: `padding:8px 10px; font-size:11px; font-weight:600; min-height:32px`. ✅ matches.

**v3 action — FIX:**
1. Change tile `<img>` to `width="54" height="72"` with inline `width:54px; height:72px; object-fit:cover`.
2. Set inner image area to a fixed `height:80px` (not padding-driven) with vertical centering so the image sits in an 80px band with 4px padding above/below — matches `h-20` + centered content.
3. Keep `padding:8px` on the tile `<a>` itself (matches `p-2` on the button).
4. Keep the "first tile = selected" visual (green border + light green bg `#F2F7F3`) since email can't know which the user wants. Consider adding a 1px inner ring to mimic Lovable's `ring-1 ring-accent` — can be done with a 1px inset box-shadow or a nested table border. Not critical.

### 2.10 Counter row ("All breeds — scroll" + N/N + arrows)

- **Lovable:** 2-col flex. Left = `text-xs text-muted-foreground` "All breeds available — scroll to see more →". Right = `text-xs font-semibold tabular-nums text-muted-foreground` "`{selected+1} / {total}`" **+ two outline icon buttons** (prev / next), `size-8 rounded-none`.
- **Liquid:** left text ✅; right shows "`N breeds`" instead of "`1 / N`" and **omits the arrow buttons entirely** (comment says "arrows are decorative — JS is stripped").
- **v3 action — FIX (partial):**
  - Change right-side text from "`{{ upsell_variants.size }} breeds`" to "`1 / {{ upsell_variants.size }}`" (always first tile).
  - **Add decorative arrow buttons:** two 32×32 (`size-8`) square `<span>` or `<a>` elements with 1px `#DED9CF` border, white bg, no radius, containing `←` and `→` glyphs (centered, 14px, foreground color). The "prev" is disabled-styled (opacity 50%) since we're on tile 1. These are purely decorative; no `href` or `href="#"`.
  - **Decision needed:** should the arrows be `<a href>` links to the first/second variant's cart URL (functional-ish), or purely decorative `<span>`? Recommend **decorative spans** — functional-feeling buttons that silently do nothing are a worse UX than clearly ornamental ones.

### 2.11 Action row (featured book + CTA)

- **Lovable (`email.tsx:90-99`):**
  - Flex column on mobile, row on `sm:`. Border-top `#DED9CF`, pt-4 (16px).
  - Book cover: `h-16 w-12` → **48px wide × 64px tall** (portrait).
  - Title: `truncate text-sm font-semibold` → 14px/600.
  - Price row: `<s class="text-xs text-muted-foreground">$120.00</s><strong class="text-base">$96.00</strong>` → 12px struck muted + 16px bold.
  - CTA button: `min-h-12 w-full shrink-0 rounded-none px-4 text-sm font-bold sm:w-auto` → min-height 48px, bg `#1E1C18`, white text, 14px/700, 16px horizontal padding, **no letter-spacing**.
- **Liquid:**
  - Book cover `width:64 height:80` → 64×80 (also portrait, but too big).
  - Title 14px/600 ✅.
  - Prices 12px struck + 16px bold ✅.
  - CTA has `letter-spacing:0.5px`.
- **v3 action — FIX:**
  1. Resize action-row cover to `width:48 height:64` (inline + attribute).
  2. Remove `letter-spacing:0.5px` from the CTA — Lovable doesn't track it.
  3. Current CTA padding `14px 12px` ≈ 48px tall ✅ matches `min-h-12`.

### 2.12 Trust line "One click · no card details"

- **Lovable:** `text-xs text-muted-foreground` + `LockKeyhole` SVG icon size-3. Centered.
- **Liquid:** 12px muted + 🔒 emoji + text. Centered. ✅ matches (emoji is the only portable option in email).
- **v3:** no change.

### 2.13 Track order + footer (email-only additions)

Not present in Lovable prototype; kept in Liquid because the email needs them. **No change** — leave `Track your order →` link, footer with Reply / FAQ / Returns / Contact / copyright.

---

## 3. Summary of concrete fixes for v3

Ordered by visual impact:

1. **Breed tile images:** 80×100 → **54×72**, inside an **80px tall** centered image band (not padding-based).
2. **Action row cover:** 64×80 → **48×64**.
3. **Line-item cover:** 56×44 (landscape) → **44×56** (portrait).
4. **Totals labels:** remove muted color from "Subtotal", "Shipping", "Tax" — use default `#1E1C18`.
5. **Counter text:** "`N breeds`" → "`1 / N`".
6. **Decorative prev/next arrows** added to the counter row (32×32, outlined, no radius, "prev" dimmed).
7. **Deadline date styling** in sub-copy: bump to 16px, keep bold green. (Monospace: skipped — recommend sans.)
8. **CTA letter-spacing:** remove `0.5px` → match Lovable's bare `text-sm font-bold`.
9. *(Optional cosmetic)* 1px inner ring on the selected tile to mimic `ring-1 ring-accent` — box-shadow inset.

---

## 4. Open decisions before I code it

1. **Font stack:** keep `'Helvetica Neue', Helvetica, Arial` or switch to Lovable's `Arial, Helvetica, sans-serif`? → Recommend **keep Helvetica Neue**.
2. **Deadline date styling:** monospace tabular (literal Lovable match) or sans-serif bold green? → Recommend **sans-serif bold green 16px**.
3. **Decorative arrows:** inert `<span>` or `<a href>` to first/second variant? → Recommend **inert `<span>`**.
4. **Selected tile ring:** add inset box-shadow for the extra ring, or keep border-only? → Recommend **border-only** (box-shadow has shaky Outlook support; the green border already reads as selected).

---

## 5. Email-client gotchas to re-verify after v3 lands

- **Outlook** (desktop): horizontal scroll won't work; tiles will wrap. Current `table-layout:fixed` wrapper handles this. Re-check the resized 54×72 image doesn't blow the 126px tile width.
- **Gmail (web)** strips `<style>` sometimes — all critical styles are already inline. The media queries in `<style>` are mobile-only cosmetic (padding + CTA stack). Low risk.
- **iOS Mail dark mode:** forced inversion will shift `#1E1C18` CTA to a lighter tone. Current `meta name="color-scheme" content="light"` already locks to light. Keep.
- **Scrollbar styling** (`[scrollbar-width:thin]`): not supported in email. Default scrollbar is fine where scroll works at all.

---

**Please review and flag any of §3 or §4 you disagree with. Once approved, I'll apply all nine fixes in one edit to `docs/order-confirmation-email.liquid` and nothing else.**
