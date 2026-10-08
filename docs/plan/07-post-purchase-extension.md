# Post-Purchase Extension — Build Plan

Add a Shopify **post-purchase upsell page** (shown between order confirmation and the Thank-you page) to this app. Custom app for a single client's store — no public listing, no App Store review.

Context: this app is already a React Router + Shopify-React-Router + Prisma (Postgres) app deployed on Vercel. The post-purchase extension lives inside `extensions/` and uses this app's server to sign changesets.

---

## 1. What a post-purchase extension actually is

A separate Shopify extension type (not a regular checkout UI extension). Two extension points, both in the same bundle:

- **`Checkout::PostPurchase::ShouldRender`** — runs server-side-ish right after payment. Returns `{ render: true, storage: { … } }` to decide whether to show the page. Receives `inputData` (order id, customer, shipping, cart) but **no access to the merchant's app DB directly** — it fetches from your app via `fetch(...)` with an auto-attached signed token.
- **`Checkout::PostPurchase::Render`** — the actual upsell page UI. Uses `calculateChangeset()` to preview tax/shipping for the proposed add-on, then `applyChangeset(jwt)` to commit the add-on to the already-paid order. The JWT **must be signed by our app server** with the Shopify API secret.

Docs:
- https://shopify.dev/docs/apps/build/checkout/product-offers
- https://shopify.dev/docs/apps/build/checkout/product-offers/build-a-post-purchase-offer
- JWT spec: https://shopify.dev/docs/api/checkout-extensions/post-purchase (JWT specification page)

---

## 2. Hard constraints to know up front

| Limit | Value |
|---|---|
| Minimum order total to qualify | **$0.50** |
| Max accepted offers per checkout | 3 |
| Pages per extension | 1 (single-page app, can paginate internally) |
| Sales channel | **Online Store only** (POS / Shop app → skipped) |
| Local delivery / local pickup | Not supported |
| Orders without shipping address | Not supported (digital-only, local pickup → skipped) |
| Live-store use | **Beta — must request access** from Shopify. Works freely on dev / Plus dev stores. |
| Post-purchase apps per store | Merchant picks **one default** in Admin → Settings → Checkout → Post-purchase page. |
| Shop Pay quirk | Storage API values written in `ShouldRender` are **not readable** from `Render` under Shop Pay (different domains). Pass data through the server instead. |

The "request access for live store" step is the biggest blocker — flag it to the client up front. For a custom app on a single store, Shopify usually grants it, but it is **not instant**.

---

## 3. Scaffold

```bash
shopify app generate extension --template checkout_post_purchase_ui --name wholesale-post-purchase
```

(If the CLI prompts with a different template id, pick the one labelled "Post-purchase UI". It generates under `extensions/wholesale-post-purchase/` with `shopify.extension.toml`, `src/index.jsx`, and `package.json`.)

Expected toml shape:

```toml
api_version = "2026-10"   # match app's shopify.app.toml

[[extensions]]
name = "wholesale-post-purchase"
handle = "wholesale-post-purchase"
type = "checkout_post_purchase"

  [[extensions.targeting]]
  module = "./src/index.jsx"
  target = "Checkout::PostPurchase::ShouldRender"

  [[extensions.targeting]]
  module = "./src/index.jsx"
  target = "Checkout::PostPurchase::Render"

  [extensions.capabilities]
  api_access = true           # Storefront API access, if needed
  network_access = true       # required to call our own backend
```

Dependencies the scaffold adds: `@shopify/post-purchase-ui-extensions-react`, `react`, `react-dom`.

---

## 4. Architecture — three moving parts

```
┌─────────────────────┐   fetch (signed)   ┌──────────────────────────────┐
│ Post-purchase ext   │ ─────────────────▶ │ app: /api/post-purchase/sign │
│  (runs in Shopify)  │ ◀───── JWT ─────── │  (signs changeset JWT)        │
└──────────┬──────────┘                    └──────────────────────────────┘
           │ applyChangeset(JWT)
           ▼
     Shopify adds the
     line item to the
     already-paid order
```

Three things we own:

1. **Extension bundle** — `extensions/wholesale-post-purchase/`. Two targets in one file.
2. **Sign endpoint** — `app/routes/api.post-purchase.sign.jsx`. POSTs in a `referenceId` + proposed `changes` and returns `{ token }` (a JWT signed with the Shopify API secret).
3. **(Optional) offer-config endpoint** — `app/routes/api.post-purchase.offer.jsx`. If offers are dynamic per order (e.g. "if cart contains Wholesale breed X, upsell crate accessory Y"), the `ShouldRender` target calls this to decide what to show. If the offer is a fixed product, skip this and hardcode it in the extension.

---

## 5. Server endpoints (new)

### 5a. `POST /api/post-purchase/sign`

Signs the changeset. Request body:
```json
{
  "referenceId": "<Shopify order reference, from inputData.initialPurchase.referenceId>",
  "changes": [
    { "type": "add_variant", "variantId": 123456789, "quantity": 1, "discount": { "value": 10, "valueType": "percentage", "title": "Post-purchase 10% off" } }
  ]
}
```

Response: `{ "token": "<JWT>" }`.

JWT claims (per Shopify's spec):
- `iss` = Shopify API key
- `jti` = UUID (one-time use)
- `iat` / `exp` = now / now + ~60s (short-lived)
- `sub` = `referenceId`
- `changes` = the changes array

Signed HS256 with `process.env.SHOPIFY_API_SECRET`.

Lazy implementation: use Node's built-in `node:crypto` (`createHmac`) + hand-rolled base64url — a JWT is three dot-separated base64url strings. No new dep. ~20 lines.

```js
// ponytail: hand-rolled HS256 JWT, 20 lines beats pulling jsonwebtoken for one endpoint.
// Upgrade path: swap for `jsonwebtoken` if we need RS256 or more claim validation.
```

**Auth on this endpoint:** the extension sends a Shopify-signed session token in `Authorization: Bearer <token>` (post-purchase runtime attaches it when `network_access = true`). Verify it with `shopify.authenticate.public.checkout(request)` — the same package already used elsewhere in the app exposes this. Reject anything else.

### 5b. (optional) `POST /api/post-purchase/offer`

Looks up the order's cart (passed in from `inputData`) and returns the upsell to show, or `{ render: false }`. Reads from the existing `WholesaleOrder` table or a new small `PostPurchaseOffer` table — decide once we know the client's offer rules.

---

## 6. Extension code sketch

Single file: `extensions/wholesale-post-purchase/src/index.jsx`.

```jsx
import { extend, render, BlockStack, Button, CalloutBanner, Heading, Image, Layout, Text, TextContainer, Tiles, View } from "@shopify/post-purchase-ui-extensions-react";

extend("Checkout::PostPurchase::ShouldRender", async ({ inputData, storage }) => {
  // Decide whether to show the page. Fetch offer config from app backend.
  const res = await fetch(`${inputData.extensionPoint.apiUrl}/api/post-purchase/offer`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ referenceId: inputData.initialPurchase.referenceId }),
  });
  if (!res.ok) return { render: false };
  const offer = await res.json();
  if (!offer.show) return { render: false };
  await storage.update(offer);           // passed into Render as inputData.storage.initialData
  return { render: true };
});

render("Checkout::PostPurchase::Render", () => <App />);

function App() {
  // Full example in docs: https://shopify.dev/docs/apps/build/checkout/product-offers/build-a-post-purchase-offer
  // Flow:
  // 1. useExtensionInput() → read inputData.storage.initialData (the offer)
  // 2. calculateChangeset({ changes }) → preview total/tax/shipping
  // 3. acceptOffer():
  //     a. POST /api/post-purchase/sign  { referenceId, changes } → { token }
  //     b. applyChangeset(token)
  //     c. done() to go to the Thank-you page
  // 4. declineOffer() → done()
}
```

Keep component tree flat. Post-purchase has its **own** component library (`@shopify/post-purchase-ui-extensions-react`), **not** the `s-*` Polaris web components used in regular checkout extensions.

---

## 7. Shopify app config changes

### 7a. `shopify.app.toml`

No new scope strictly required for the extension (post-purchase bundles its own permissions via `applyChangeset`), **but**:

- If `/api/post-purchase/offer` needs to look up Shopify order data, add `read_orders` (already present).
- If offers reference variants we create on the fly, keep `write_products` (already present).

Nothing else to add in the toml at the app level. The extension's own `shopify.extension.toml` carries its config.

### 7b. Merchant must manually enable it

After `shopify app deploy`, the merchant goes to:
**Shopify admin → Settings → Checkout → Post-purchase page → select "wholesale-post-purchase"**.

Document this in the client handover — easy to miss.

---

## 8. Dev + testing

Local dev:
```bash
shopify app dev
```
`shopify app dev` tunnels the backend and the extension together; place a real test order on the dev store, pay with Shopify's test gateway (Bogus Gateway, card `1`), and the post-purchase page appears before Thank-you. The extension can only be exercised against a **real order** — there is no mock/preview UI.

Automated test (ponytail-level): a single `app/lib/post-purchase-sign.test.mjs` using `node:test` that round-trips a JWT: build → verify → confirm claims. That's enough — the rest is Shopify runtime behaviour.

```js
// ponytail: one JWT round-trip test. The real integration test is a dev-store order.
```

---

## 9. Prod rollout checklist

1. **Request live-store beta access** for post-purchase extensions (via Partner Dashboard support request) — do this day 1, it has lead time.
2. Confirm the client store is **Online Store** channel (not POS-only / wholesale-channel-only).
3. Confirm the typical order total is reliably **≥ $0.50** (yes for Dog Book — wholesale totals are much higher).
4. Build + deploy to the staging app first; run through 3–5 test orders.
5. Have the merchant toggle this app as the default post-purchase app in Admin → Settings → Checkout.
6. Verify the `orders/paid` webhook still fires correctly **after** a post-purchase add-on is accepted (the order total changes; `applyChangeset` updates the same order, it does not create a new one).

---

## 10. Env vars (new)

| Var | Purpose |
|---|---|
| `SHOPIFY_API_SECRET` | Already set — used to sign the changeset JWT. |
| `SHOPIFY_API_KEY` | Already set — becomes the JWT `iss` claim. |

No new secrets.

---

## 11. File checklist (what we'll add)

- `extensions/wholesale-post-purchase/shopify.extension.toml`
- `extensions/wholesale-post-purchase/src/index.jsx`
- `extensions/wholesale-post-purchase/package.json`
- `app/routes/api.post-purchase.sign.jsx`
- `app/lib/post-purchase-sign.server.js` (JWT signer — pure fn, testable)
- `app/lib/post-purchase-sign.test.mjs`
- *(optional)* `app/routes/api.post-purchase.offer.jsx`
- *(optional)* new Prisma model `PostPurchaseOffer` if offers are DB-driven — hold off until the client confirms the offer rules

---

## 12. Open questions for the client (ask before building)

1. **What's the upsell?** Fixed product (hardcode it), or dynamic by cart contents (needs DB-driven offer config)?
2. **Discount?** Any discount applied on the post-purchase offer, and is it percentage or fixed amount?
3. **Which store is this going on** — dev store or a live store? If live, start the beta-access request **today**.
4. Should the post-purchase offer interact with the existing **wholesale order flow** (§ `docs/THEME_APP_LINK.md`) — e.g. only show for wholesale buyers — or is it for retail Thank-you only?

---

## 13. Rough effort

- **Day 1:** scaffold extension, write JWT signer + endpoint + test, hardcoded offer in extension — working end-to-end on a dev store.
- **Day 2:** wire dynamic offer config (if needed), styling polish per Shopify UX guidelines, deploy to staging, test matrix (shop pay / regular / shipping-less).
- **Day 3:** client review, docs, prod toggle.

Beta-access turnaround on Shopify's side can add days — kick that off in parallel on day 1.
