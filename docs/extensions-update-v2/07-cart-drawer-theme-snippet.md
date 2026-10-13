# 07 — Cart drawer upsell (theme-direct implementation)

**For**: the Claude working inside the merchant's theme repository.
**Not** an app extension — this ships as a Liquid snippet + CSS + JS added
directly into the theme files, because the theme's cart drawer section
doesn't support app blocks (`{% content_for 'blocks' %}` missing).

Design source: `docs/post-purchase-design-lovable/src/routes/panier.tsx`.
Live example this must match: the Shopify app's own `dogbook-checkout-upsell`
and `dogbook-order-upsell` extensions render the same offers with the same
attribute convention.

---

## 1. The one invariant you MUST get right

When a user clicks `+` on an upsell row, the Ajax call to `/cart/add.js`
MUST include this property:

```json
{ "properties": { "_upsell_source": "cart" } }
```

A deployed Rust Shopify Discount Function matches that attribute and
applies the configured % off (currently 20%) to any cart line carrying it.
Omit the property and the discount silently never fires.

The attribute key is `_upsell_source` (with the leading underscore —
Shopify treats underscore-prefixed properties as hidden from the customer
in checkout). The value is `cart` on the cart surface; the checkout and
customer-account surfaces use `checkout` and `order-status` respectively.
All three are matched by the same Function.

---

## 2. Data source

Single GET to the app's offer endpoint:

```
https://stg-dogbook-app.vercel.app/api/post-purchase/offer?shop=<shop.permanent_domain>
```

- CORS is permissive on this endpoint — the browser call from the
  storefront works without any proxy.
- Response:
  ```json
  {
    "offers": [
      {
        "variantId": 1234567890,
        "variantGid": "gid://shopify/ProductVariant/1234567890",
        "productTitle": "Beagle",
        "imageUrl": "https://cdn.shopify.com/...",
        "price": "50.00",
        "compareAtPrice": null,
        "currencyCode": "USD"
      }
    ],
    "discountPercent": 20
  }
  ```
- The offer list comes from a shop metafield (`app.post_purchase_offer`)
  managed in the Dog Book app's admin page. Whatever the merchant picks
  there is what this snippet shows — do not hardcode variant IDs.

### Required filtering

After fetching, exclude variants already in the current cart so you don't
offer a book the user has already added. Fetch the cart with:

```
GET /cart.js
```

and remove any offer where `cart.items[i].variant_id === offer.variantId`.

---

## 3. UX contract (from Lovable's `panier.tsx`)

Inside the cart drawer, below the line items and above the subtotal row,
render a card with:

1. Header row: `COMPLETE YOUR COLLECTION` (left, small caps, letter-spaced)
   + `20% OFF` chip (right, filled accent).
2. Sub-line: `Add a second book and pay <s>$120.00</s> <strong>$96.00</strong>
   — you save $24.00.` Prices come from the first offer's `price` ×
   `(1 - discountPercent/100)`.
3. Scroll container (max 300px tall, overflow-y auto) listing every
   offer as a thin row: thumbnail (48×64), breed title, `+` button on
   the right.
4. Fade overlay at the bottom of the scroll container (linear gradient,
   48px tall, same color as card bg) — hide once the user has scrolled
   to the end (toggle via `scroll` listener comparing
   `scrollHeight - scrollTop - clientHeight < 8`).
5. On successful add: swap the `+` SVG to a `✓` SVG and set
   `data-added` on the button (purely visual — the real refresh is step 6).
6. Refresh the cart display. Theme-specific; strategies in priority order:
   - If the theme publishes a known event (Dawn: dispatch
     `cart:refresh` on `document`; others: `cart-notification:open`,
     `cart:update`), dispatch it after a 200 OK.
   - Fallback: `location.reload()` after a 400ms delay so the ✓ is
     visible for one frame before the reload.

Full Lovable markup is in
`docs/post-purchase-design-lovable/src/routes/panier.tsx` — copy the
Tailwind classes to vanilla CSS values if needed.

---

## 4. Files to add in the theme

Keep it to three files; do not touch anything else in the theme.

### `snippets/complete-collection.liquid`

```liquid
{% comment %}
  Dog Book cart upsell — "Complete your collection".
  Rendered inside the cart drawer, between line items and subtotal.
  Data: https://stg-dogbook-app.vercel.app/api/post-purchase/offer?shop=...
  Add action: POST /cart/add.js with properties._upsell_source=cart
  (required for the Shopify Discount Function to apply -20%).
{% endcomment %}

<div
  class="dbk-upsell"
  data-dbk-upsell
  data-app-url="https://stg-dogbook-app.vercel.app"
  data-shop-domain="{{ shop.permanent_domain }}"
></div>

{{ 'complete-collection.css' | asset_url | stylesheet_tag }}
<script src="{{ 'complete-collection.js' | asset_url }}" defer></script>
```

### `assets/complete-collection.css`

```css
.dbk-upsell { font: inherit; color: #1e1c18; }
.dbk-upsell[hidden] { display: none; }

.dbk-upsell-card { background: #f0ece2; padding: 16px; margin-top: 24px; }
.dbk-upsell-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.dbk-upsell-title { font-size: 12px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; margin: 0; }
.dbk-upsell-chip { background: #2f6e3e; color: #fbf9f2; padding: 4px 10px; font-size: 12px; font-weight: 700; letter-spacing: 0.03em; text-transform: uppercase; }
.dbk-upsell-sub { font-size: 14px; color: #7b766d; margin: 8px 0 0; }
.dbk-upsell-sub s { color: rgba(123, 118, 109, 0.7); }
.dbk-upsell-sub strong { margin-left: 4px; color: #1e1c18; }

.dbk-upsell-list-wrap { position: relative; margin-top: 16px; }
.dbk-upsell-list { max-height: 300px; overflow-y: auto; overscroll-behavior: contain; padding-right: 4px; display: flex; flex-direction: column; gap: 8px; scrollbar-width: thin; }
.dbk-upsell-list-fade { position: absolute; inset: auto 0 0 0; height: 48px; background: linear-gradient(to top, #f0ece2, rgba(240, 236, 226, 0.8), transparent); pointer-events: none; }
.dbk-upsell-list-wrap[data-at-end] .dbk-upsell-list-fade { display: none; }

.dbk-upsell-row { display: flex; align-items: center; gap: 12px; background: #fff; border: 1px solid #ded9cf; padding: 12px; }
.dbk-upsell-row-thumb { width: 48px; height: 64px; flex: 0 0 48px; background: #f6f4ef; object-fit: cover; display: block; }
.dbk-upsell-row-title { flex: 1 1 auto; min-width: 0; font-size: 14px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dbk-upsell-row-btn { flex: 0 0 auto; width: 36px; height: 36px; border: 1px solid #ded9cf; background: #fff; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; padding: 0; color: inherit; font: inherit; }
.dbk-upsell-row-btn[disabled] { opacity: 0.6; cursor: wait; }
.dbk-upsell-row-btn[data-added] { background: #f0ece2; }
.dbk-upsell-row-btn svg { width: 16px; height: 16px; }
```

### `assets/complete-collection.js`

```js
// Dog Book cart drawer upsell.
// Data source: APP_URL/api/post-purchase/offer?shop=<domain>
// Add action: /cart/add.js with properties._upsell_source=cart.
// The _upsell_source=cart property is REQUIRED — a deployed Shopify
// Discount Function matches it and applies -20%. Omit it and the
// discount silently never fires.

(() => {
  const mount = document.querySelector("[data-dbk-upsell]");
  if (!mount || mount.dataset.dbkMounted) return;
  mount.dataset.dbkMounted = "1";

  const APP_URL = mount.dataset.appUrl;
  const SHOP_DOMAIN = mount.dataset.shopDomain;

  const money = (v) =>
    new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: window.Shopify?.currency?.active || "USD",
    }).format(Number(v));

  const gidFromVariantId = (id) => `gid://shopify/ProductVariant/${id}`;

  const PLUS_SVG = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3v10M3 8h10"/></svg>';
  const CHECK_SVG = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 8l3 3 7-7"/></svg>';

  const main = async () => {
    const [cart, offersResp] = await Promise.all([
      fetch("/cart.js", { credentials: "same-origin" }).then((r) => r.json()),
      fetch(
        `${APP_URL}/api/post-purchase/offer?shop=${encodeURIComponent(SHOP_DOMAIN)}`,
      ).then((r) => r.json()),
    ]);

    const cartVariantGids = (cart?.items ?? []).map((i) => gidFromVariantId(i.variant_id));
    const offers = (offersResp?.offers ?? []).filter((o) => !cartVariantGids.includes(o.variantGid));
    const percent = Number(offersResp?.discountPercent) || 20;

    if (!offers.length) { mount.hidden = true; return; }
    render(offers, percent);
  };

  const render = (offers, percent) => {
    const first = offers[0];
    const original = Number(first.compareAtPrice ?? first.price);
    const discounted = (original * (1 - percent / 100)).toFixed(2);
    const saved = (original - Number(discounted)).toFixed(2);

    const card = document.createElement("section");
    card.className = "dbk-upsell-card";
    card.innerHTML = `
      <div class="dbk-upsell-head">
        <p class="dbk-upsell-title">Complete your collection</p>
        <span class="dbk-upsell-chip">${percent}% off</span>
      </div>
      <p class="dbk-upsell-sub">
        Add a second book and pay <s>${money(original)}</s>
        <strong>${money(discounted)}</strong> — you save ${money(saved)}.
      </p>
      <div class="dbk-upsell-list-wrap">
        <div class="dbk-upsell-list" role="list"></div>
        <div class="dbk-upsell-list-fade"></div>
      </div>
    `;
    const list = card.querySelector(".dbk-upsell-list");
    const wrap = card.querySelector(".dbk-upsell-list-wrap");

    for (const offer of offers) {
      const row = document.createElement("div");
      row.className = "dbk-upsell-row";
      row.setAttribute("role", "listitem");
      const img = offer.imageUrl
        ? `<img class="dbk-upsell-row-thumb" src="${offer.imageUrl}" alt="" loading="lazy">`
        : `<div class="dbk-upsell-row-thumb" aria-hidden="true"></div>`;
      row.innerHTML = `
        ${img}
        <span class="dbk-upsell-row-title">${offer.productTitle}</span>
        <button type="button" class="dbk-upsell-row-btn" aria-label="Add ${offer.productTitle}">${PLUS_SVG}</button>
      `;
      row.querySelector("button").addEventListener("click", (e) => addLine(offer, e.currentTarget));
      list.appendChild(row);
    }

    const updateFade = () => {
      const atEnd = list.scrollHeight - list.scrollTop - list.clientHeight < 8;
      wrap.toggleAttribute("data-at-end", atEnd);
    };
    list.addEventListener("scroll", updateFade);
    updateFade();

    mount.replaceChildren(card);
  };

  const addLine = async (offer, btn) => {
    btn.disabled = true;
    try {
      const id = Number(String(offer.variantGid).split("/").pop());
      const resp = await fetch("/cart/add.js", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          id,
          quantity: 1,
          properties: { _upsell_source: "cart" },
        }),
      });
      if (!resp.ok) throw new Error(`cart/add failed: ${resp.status}`);
      btn.setAttribute("data-added", "");
      btn.innerHTML = CHECK_SVG;
      document.dispatchEvent(new CustomEvent("cart:refresh", { bubbles: true }));
      setTimeout(() => location.reload(), 400);
    } catch (err) {
      console.error("[dbk-upsell]", err);
      btn.disabled = false;
    }
  };

  main().catch((err) => { console.error("[dbk-upsell]", err); mount.hidden = true; });
})();
```

---

## 5. Where to call the snippet

Open the theme's cart drawer file. It's commonly one of:
- `sections/cart-drawer.liquid`
- `snippets/cart-drawer.liquid`
- `sections/header.liquid` (if the drawer is nested in header)

Find the end of the line-items loop and the start of the subtotal row.
Insert:

```liquid
{% render 'complete-collection' %}
```

between them.

Do the same inside the `/cart` page template if you want the upsell there
too — the Dog Book app's app-block version was already installed on the
cart **page**, so if it still renders there via the app block, don't
double-add. Pick one path per surface.

---

## 6. Verification

1. Open the storefront → add any book to cart → open the cart drawer.
2. The "COMPLETE YOUR COLLECTION / 20% OFF" card renders.
3. DevTools → Network → click `+` on a row:
   - Request: `POST /cart/add.js`
   - Payload includes `"properties": {"_upsell_source": "cart"}`
   - Response: 200
4. Page reloads → the new line is in the cart.
5. Click Checkout → the Shopify Discount Function fires → the upsell
   line shows `-$10.00` (or whatever −20% evaluates to).

If step 5 fails: the app's automatic discount isn't active yet. In the
Dog Book app admin, open the Post-Purchase settings page once and hit
Save — that triggers `syncFunctionDiscount` which creates the
automatic discount pointing at the function.

---

## 7. Explicit non-goals

- No merchant settings (position, color, copy). Match Lovable 1:1.
- No React, no Preact, no framework. Vanilla JS in a single asset file.
- No module bundler, no build step. The three files above are the whole
  implementation.
- No translation/i18n layer. English only; add later only if the merchant
  internationalizes the storefront.
- No drag-and-drop placement in the theme editor. Hard-coded render
  position between line items and subtotal.

---

## 8. Known ceiling (replace when it hurts)

- `location.reload()` after add is the universal fallback. If this
  theme has a documented cart event (check `assets/*cart*.js` for
  `dispatchEvent` calls), replace the `reload()` with that event dispatch
  and keep only the visual `✓` swap.
- Fetching `/cart.js` + `/api/post-purchase/offer` in parallel on every
  drawer open is cheap; cache for a session if the drawer opens 10+
  times.
