# 03 — Shopify checkout redirect with prefill

## Two paths, pick one

### Path A — Cart permalink (recommended: simplest, no admin API call)
Shopify supports a public URL that adds items to the cart and forwards to checkout:

```
https://<shop>.myshopify.com/cart/<variantId1>:<qty1>,<variantId2>:<qty2>
  ?attributes[wholesale_order_id]=<our-order-id>
  &checkout[email]=<optional>
  &checkout[shipping_address][address1]=<line1>
  &checkout[shipping_address][city]=<city>
  &checkout[shipping_address][zip]=<zip>
  &checkout[shipping_address][country]=<country>
  &note=<free text>
```

Pros: one string, no server-to-Shopify call, works from any origin.
Cons: needs **numeric variant IDs** (not GIDs — the `/cart/` route wants the plain numeric part) and only supports the shipping-address prefill fields Shopify's checkout accepts.

Address prefill limits: the checkout query params are **structured** — line1, city, zip, country, etc. The form's `businessAddress` is one freeform textarea. Two ways to handle:
1. **Ship as-is** — put the whole address string into `checkout[shipping_address][address1]`. Buyer sees it prefilled in the first line and can split it themselves. Lazy. Works.
2. **Split on the client** — before POSTing, the storefront form breaks the address into fields. Requires form changes on the caller side.

Default recommendation: **option 1** (dump into `address1`). Zero extra code, matches what a single-textarea input really represents. Revisit if merchants complain.

### Path B — Draft Order via Admin API
Server calls `draftOrderCreate` mutation with line items + shipping address, receives an `invoiceUrl`, redirects buyer there.

Pros: full control over prices, discounts, custom line items, structured address.
Cons: requires Admin API auth (offline access token stored for the app's shop), one extra network round trip on submit, more moving parts.

Only worth it if we need per-order custom pricing or non-catalog items. From the screenshots (all items are catalog products with fixed unit price), **we don't need this yet**. Skip until required.

## Building the URL (Path A)
Helper at `app/lib/shopify-checkout.server.js`. Returns `null` when no line has a `variant_id` (rare edge — merchant hasn't attached any breeds to Shopify products yet).

```js
const SHOP_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN; // e.g. "thedogbook.myshopify.com"

export function buildCheckoutUrl(order, lines) {
  const linked = lines.filter((l) => l.variant_id);
  const unlinked = lines.filter((l) => !l.variant_id);
  if (linked.length === 0) return null;

  const cart = linked
    .map((l) => `${numericId(l.variant_id)}:${l.count}`)
    .join(",");

  const noteParts = [
    `Shop: ${order.shopName}`,
    `URL: ${order.storeUrl}`,
    `Channel: ${order.channel}`,
    `Invoice: ${order.invoiceAddress}`,
  ];
  if (unlinked.length) {
    noteParts.push(
      `Unlinked breeds (add manually): ${unlinked.map((l) => `${l.name} x${l.count}`).join(", ")}`,
    );
  }

  const qs = new URLSearchParams({
    "attributes[wholesale_order_id]": order.id,
    "checkout[shipping_address][address1]": order.businessAddress,
    "note": noteParts.join(" | "),
  });

  return `https://${SHOP_DOMAIN}/cart/${cart}?${qs}`;
}

// Handles both GIDs ("gid://shopify/ProductVariant/12345") and plain numeric strings ("44123456789012").
function numericId(gidOrNumeric) {
  const s = String(gidOrNumeric);
  const m = s.match(/(\d+)$/);
  return m ? m[1] : s;
}
```

## Carrying `wholesale_order_id` through checkout
The `attributes[wholesale_order_id]=...` cart attribute persists onto the Shopify Order as a **note attribute**. That's how the `orders/paid` webhook (`04-*`) looks up our record.

## How the theme actually redirects (assumption, needs confirm)
Theme calls this endpoint via `fetch`, so it can't follow a 3xx automatically. Our response body carries `checkout_url` (string or `null`) — the theme reads it and does:
```js
if (data.checkout_url) window.location.href = data.checkout_url;
else /* show "we'll follow up" message */
```
Flagged as remaining open item in `00-overview.md`.

## Env vars added
```
SHOPIFY_SHOP_DOMAIN="thedogbook.myshopify.com"
```

## Skipped, add when
- Draft Order path — skip, add when we need per-order pricing / discounts.
- Structured address split — skip, add when merchants complain about the freeform prefill.
- Email prefill — skip, add when we ask for buyer email on the form.

## Open item
Confirm the caller sends numeric variant IDs or GIDs (either works with `numericId()` above). If it sends only product titles, we'd need Admin API lookups per submit — flag before implementing.
