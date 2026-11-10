# Percent-of-subtotal shipping — port guide

Replicate this feature on the live store. Scope is **shipping only** — no other changes.

At checkout, shipping cost = `percent × cart subtotal`. Merchant sets the percent in the embedded admin; a Shopify Carrier Service callback computes the per-cart rate.

---

## 1. Prisma schema

**File:** `prisma/schema.prisma`

Add this model (place it anywhere in the file — it has no relations):

```prisma
model ShippingRule {
  shop       String   @id
  percent    Float    @default(0)
  serviceId  String?
  updatedAt  DateTime @updatedAt
}
```

Then:

```bash
pnpm prisma migrate dev --name shipping_rule
```

(or `npx prisma migrate deploy` for production.)

---

## 2. Access scope

Add `write_shipping` to the `scopes` line in **both**:

- `shopify.app.toml`
- `shopify.app.staging.toml` *(if present on live — skip otherwise)*

Final value in each file:

```toml
[access_scopes]
scopes = "write_products,write_discounts,read_orders,write_shipping"
```

> Adjust the existing scopes list — only `write_shipping` is the new addition.

After editing, run `shopify app deploy` and re-authorize the app on the shop so the new scope is granted.

---

## 3. Admin settings route

**File (create):** `app/routes/app.shipping-rule.jsx`

Purpose:
- Loader reads the shop's `ShippingRule` row.
- `intent=save` → upserts `percent` (clamped 0–100 server-side).
- `intent=register` → runs the `carrierServiceCreate` GraphQL mutation and stores the returned `id` as `serviceId`.
- UI uses Shopify Polaris web components (`<s-page>`, `<s-section>`, `<s-text-field>`, `<s-button>`, `<s-badge>`, `<s-banner>`, `<s-table>`, `<s-link>`, `<s-box>`).
- Input clamped 0–100 client-side as the user types; shows live preview of shipping on $25/$50/$100/$250 subtotals; surfaces callback URL and service ID.

**Critical detail:** intent is passed via `<input type="hidden" name="intent" value="save|register" />` *inside* each `<Form>`. Do **not** rely on `<s-button name="intent" value="...">` — Shopify's `<s-button>` web component does not propagate submitter attrs to form submission.

Registration mutation payload:

```graphql
mutation CarrierServiceCreate($input: DeliveryCarrierServiceCreateInput!) {
  carrierServiceCreate(input: $input) {
    carrierService { id name }
    userErrors { field message }
  }
}
```

Input variables:

```js
{
  name: "Percent of subtotal",
  callbackUrl: `${process.env.SHOPIFY_APP_URL}/api/shipping-rates?shop=${encodeURIComponent(session.shop)}`,
  supportsServiceDiscovery: true,
  active: true,
}
```

Full reference file to copy: see the dev copy at `app/routes/app.shipping-rule.jsx` in the staging repo.

---

## 4. Public Carrier Service callback

**File (create):** `app/routes/api.shipping-rates.jsx`

Purpose: Shopify POSTs cart contents here at checkout; we reply with a shipping rate.

Behavior:
- Read `shop` from URL query (`?shop=`), **not** from request body — Shopify doesn't send shop in the body. The callback URL was registered with the shop appended as a query string.
- Look up `ShippingRule` for that shop.
- Compute `subtotalCents = Σ (item.price × item.quantity)` across `rate.items[]`.
- `totalCents = Math.round(subtotalCents × percent / 100)`.
- Reply with:

```json
{
  "rates": [{
    "service_name": "<percent>% of subtotal",
    "service_code": "PERCENT_SUBTOTAL",
    "total_price": "<cents as string>",
    "currency": "<rate.currency || USD>",
    "description": "Shipping = <percent>% of cart subtotal"
  }]
}
```

- On any failure (missing shop, no rule, percent === 0, malformed JSON) return `{ rates: [] }` with 200. **Do not throw** — Shopify's timeout is ~10 s and any error suppresses the rate silently with no fallback.

Full reference file to copy: see `app/routes/api.shipping-rates.jsx` in the staging repo.

---

## 5. Nav link

**File:** `app/routes/app.jsx`

Inside `<s-app-nav>`, add:

```jsx
<s-link href="/app/shipping-rule">Shipping rule</s-link>
```

---

## 6. Environment variable

`SHOPIFY_APP_URL` must be the **public HTTPS URL** of the deployed app. Shopify's checkout calls that URL directly from its servers. If the URL is a tunnel that's gone down, or HTTP instead of HTTPS, no rate will appear — Shopify fails silently.

Verify on the live host.

---

## 7. Merchant setup after deploy

1. Open the embedded app → **Shipping rule** → set percent → **Save**.
2. Click **Register carrier service** (once per shop).
3. In Shopify admin → **Settings → Shipping and delivery** → shipping profile → zone → **Manage rates** → under **Carrier and app rates**, enable **Percent of subtotal**.
4. (Optional) Remove existing flat/free rates in that zone if the percent rate should be the only option.

---

## Known ceilings

- Percent applies to **pre-discount** line prices from `rate.items[].price`. For post-discount, subtract `discount_allocations` in the callback.
- Uninstall + reinstall leaves a stale `serviceId` in Prisma — next register attempt fails with a duplicate error. Fix: null the `serviceId` column (or delete the row) and re-register. Wire into the `app/uninstalled` webhook if this becomes common.
- One global percent per shop. No per-country / per-collection / per-weight overrides — add only when a merchant asks.

---

## Files touched (checklist for the port)

| Path                                   | Action    |
| -------------------------------------- | --------- |
| `prisma/schema.prisma`                 | add model |
| `shopify.app.toml`                     | add scope |
| `shopify.app.staging.toml`             | add scope *(if present on live)* |
| `app/routes/app.shipping-rule.jsx`     | create    |
| `app/routes/api.shipping-rates.jsx`    | create    |
| `app/routes/app.jsx`                   | add nav link |

Nothing else in the repo is shipping-related. Do not touch wholesale, email, webhooks, or any other routes.
