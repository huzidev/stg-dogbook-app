# 09 — Order confirmation email upsell

**Surface**: the "Order confirmation" transactional email Shopify sends
when an order is placed (Shopify Admin → Settings → Notifications → Order
confirmation).

**Design source**: `docs/post-purchase-design-lovable/src/routes/email.tsx`.

**Client requirement**: "Add to my order" must open the cart with the
product already in it and the discount applied.

---

## 1. The email ≠ a web page

The Lovable mock renders a scrollable carousel, a live countdown, a
"selected" tile with ring highlight, and a success-state swap. **None of
that works in email.** Clients (Gmail, Apple Mail, Outlook) strip JS,
treat CSS inconsistently, and have no concept of state. The honest
translation:

| Lovable element | Email reality |
|---|---|
| Scrollable 13-tile carousel | Static 2×2 (or 1×4) grid showing 4 tiles max |
| Live `23:47:04` countdown | Static "Offer ends on Oct 15, 3:00 PM" |
| Click tile → highlight → shared ADD button | Each tile is its own `<a>` link, no shared button |
| Success state after click | N/A — the click leaves the inbox |

So the email ships one tile per upsell variant, each tile is a clickable
link to a cart permalink. The "Add to my order" bar at the bottom
drops.

---

## 2. The one invariant (same as every other surface)

Every link in the email MUST pre-build a cart that carries the attribute:

```
?attributes[_upsell_source]=order-confirmation
```

The deployed Rust Discount Function already matches `checkout`, `cart`,
and `order-status`. We **add one more value** before launching this:
`order-confirmation`.

One-line change in `extensions/dogbook-upsell-discount/src/cart_lines_discounts_generate_run.rs`:

```rust
matches!(v.as_str(), "checkout" | "cart" | "order-status" | "order-confirmation")
```

Rebuild + redeploy. Omit this change and the email button lands the
customer on a cart with the right product but no discount.

---

## 3. Cart permalink format

Shopify's cart permalinks accept:
- `/cart/{variantId}:{quantity}` — builds a cart with that variant
- `?attributes[key]=value` — writes line/cart attributes
- `?discount=CODE` — applies a discount code (not needed; our Function
  handles the % off automatically)

The URL we embed in each email tile:

```
https://{shop}/cart/{variantId}:1?attributes[_upsell_source]=order-confirmation
```

Example:
```
https://thedogbook.myshopify.com/cart/44123456789:1?attributes[_upsell_source]=order-confirmation
```

Click → Shopify builds the cart with the variant + attribute → customer
proceeds to checkout → Discount Function sees the attribute → −20%.

---

## 4. Two implementation paths — pick one

### Path A: Shopify's native notification template (recommended)

- Zero backend. Zero email service. No new scopes.
- Merchant: Admin → Settings → Notifications → Order confirmation → **Edit code**.
- Paste a Liquid block at the bottom of the HTML template.
- Done.

**Blocker**: email Liquid needs structured access to the upsell variants
(title, price, image, GID). Our current shop metafield
`app.post_purchase_offer` stores a JSON string
(`{variantGids:[...], discountPercent:20}`). Liquid can parse JSON via
`| parse_json`, but then resolving each GID to a product requires
hitting `{{ all_products[handle] }}` — and we don't have the handles,
only variant IDs.

**Lazy fix**: add a second shop metafield
`app.email_upsell_variants` of type `list.variant_reference`. The
admin page writes it alongside the existing JSON. Email Liquid then
iterates:

```liquid
{% for variant in shop.metafields.app.email_upsell_variants.value limit: 4 %}
  <a href="{{ shop.url }}/cart/{{ variant.id }}:1?attributes[_upsell_source]=order-confirmation">
    <img src="{{ variant.image | img_url: '240x' }}" alt="{{ variant.product.title }}">
    <strong>{{ variant.product.title }}</strong>
    <span>{{ variant.compare_at_price | money }} {{ variant.price | times: 0.8 | money }}</span>
  </a>
{% endfor %}
```

Admin page change (`app/routes/app.post-purchase.jsx`): after
`metafieldsSet` on the JSON config, write a parallel
`list.variant_reference` metafield from the same `variantGids`.

### Path B: App-sent transactional email

- App subscribes to `orders/create` webhook.
- Webhook handler composes the email HTML server-side using the same
  `/api/post-purchase/offer` logic (we have full offer data in-memory).
- Sends via Shopify's `send_customer_notification` mutation OR an
  external ESP (SendGrid/Postmark/Resend).
- **Replaces** Shopify's native order confirmation (otherwise customer
  gets two emails).

Pros: full flexibility, click tracking, per-recipient logic, A/B tests.
Cons: new webhook + handler + email template file + ESP account + scope
`read_orders` (already present) + risk of Shopify sending the native
confirmation anyway if we don't disable it.

**Not recommended** for v1. Build path A first; move to B only if the
merchant needs analytics or dynamic personalization that Liquid can't
express.

---

## 5. Email template (Path A, drop-in Liquid)

Paste this at the bottom of the Order confirmation notification body,
right before the footer / closing `</body>` or the merchant's existing
sign-off:

```liquid
{% assign upsell_variants = shop.metafields.app.email_upsell_variants.value %}
{% if upsell_variants.size > 0 %}
  {% assign offer_cfg = shop.metafields.app.post_purchase_offer | parse_json %}
  {% assign percent = offer_cfg.discountPercent | default: 20 %}

  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:24px;border:1px solid #2f6e3e;background:#f2f7f3;">
    <tr><td style="padding:20px;">
      <h2 style="margin:0 0 8px;font-family:Helvetica,Arial,sans-serif;font-size:22px;line-height:1.25;color:#1e1c18;">
        Add a book, save {{ percent }}% off your next order
      </h2>
      <p style="margin:0 0 12px;font-family:Helvetica,Arial,sans-serif;font-size:13px;color:#7b766d;">
        Offer ends in 24 hours.
      </p>

      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:12px;">
        {% assign row_open = false %}
        {% for variant in upsell_variants limit: 4 %}
          {% assign variant_num_id = variant.id | split: '/' | last %}
          {% assign discounted = variant.price | times: 1.0 | times: 100 | minus: variant.price | times: percent | divided_by: 100 %}
          {% assign cart_url = shop.url | append: '/cart/' | append: variant_num_id | append: ':1?attributes[_upsell_source]=order-confirmation' %}

          {% if forloop.index0 == 0 or forloop.index0 == 2 %}
            {% unless row_open == false and forloop.index0 == 0 %}</tr>{% endunless %}
            <tr>{% assign row_open = true %}
          {% endif %}

          <td width="50%" valign="top" style="padding:6px;">
            <a href="{{ cart_url }}" style="display:block;text-decoration:none;color:#1e1c18;background:#fff;border:1px solid #ded9cf;padding:12px;">
              <img src="{{ variant.image | img_url: '240x' }}" alt="{{ variant.product.title }}" width="100%" style="display:block;max-width:200px;margin:0 auto 8px;">
              <strong style="display:block;font-family:Helvetica,Arial,sans-serif;font-size:14px;margin:0 0 4px;">{{ variant.product.title }}</strong>
              <span style="font-family:Helvetica,Arial,sans-serif;font-size:13px;">
                <s style="color:#7b766d;">{{ variant.price | money }}</s>
                <strong>{{ variant.price | times: 100 | minus: variant.price | times: percent | divided_by: 100 | money }}</strong>
              </span>
            </a>
          </td>
        {% endfor %}
        </tr>
      </table>

      <p style="margin:16px 0 0;text-align:center;font-family:Helvetica,Arial,sans-serif;font-size:12px;color:#7b766d;">
        🔒 One click · no card details
      </p>
    </td></tr>
  </table>
{% endif %}
```

Pricing math is intentionally inline — Liquid's `money` filter formats
by the shop's currency setting. The `times/minus/divided_by` chain
computes `price × (1 - percent/100)`.

---

## 6. Admin backend change (prerequisite for Path A)

In `app/routes/app.post-purchase.jsx`, inside the existing `action`
handler (where it currently writes the JSON config metafield), add a
second `metafieldsSet` call writing the variant GIDs as a
`list.variant_reference` on the same shop:

```js
await admin.graphql(
  `#graphql
  mutation SetEmailUpsell($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      userErrors { field message }
    }
  }`,
  {
    variables: {
      metafields: [{
        ownerId: shopGid,                        // need to resolve via `query { shop { id } }` once
        namespace: "app",
        key: "email_upsell_variants",
        type: "list.variant_reference",
        value: JSON.stringify(variantGids),       // array of gid://shopify/ProductVariant/...
      }],
    },
  },
);
```

Idempotent — safe to call on every save. Metafield definition
auto-created on first write.

---

## 7. Merchant setup (one-time)

1. **Deploy the app** (`shopify app deploy`) with the Function change
   (+ `order-confirmation` matcher) and the admin backend change.
2. Open the Dog Book admin page → **Save** once to populate the new
   `email_upsell_variants` metafield.
3. Shopify Admin → Settings → Notifications → **Order confirmation** →
   Edit code → paste the Liquid block from §5 into the HTML body.
4. **Preview** using the "Send test email" button to a real address.
5. Click a tile in the test email → verify:
   - URL is `/cart/{variantId}:1?attributes[_upsell_source]=order-confirmation`
   - Cart loads with the variant
   - Checkout shows `−20%` on that line.

---

## 8. Non-goals

- No live countdown in the email. The timer in Lovable is a web-only
  affordance.
- No scrollable 13-breed carousel. Email layout is a static 2×2 grid of
  4 tiles max. If the metafield has >4 variants, we show the first 4.
- No per-customer personalization (e.g. "skip breeds already in orders")
  until Path B.
- No translation. English-only until the storefront internationalizes.

---

## 9. Known ceiling

- Static end-time string, not a counter. Replace with a server-rendered
  countdown GIF only if the merchant explicitly asks (and accepts the
  render-pipeline cost).
- The 2×2 grid is fixed. If merchant wants 1 tile or 6, change the
  `limit: 4` in the Liquid and adjust the row-split logic.
- Click tracking requires Path B. Shopify's email open/click stats are
  not exposed to apps for native notification emails.
