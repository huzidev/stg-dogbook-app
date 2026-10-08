# Post-Purchase: Impact on the Baseline + Revert Plan

What the post-purchase work changes in the Dog Book baseline (see
`01-current-state.md`), what could break the existing wholesale flow, and
how to roll back on Vercel if we need to.

Updated as each build step lands. Scope = **staging only** right now.

---

## 1. Files added or modified by post-purchase work

### Added (safe — delete to revert)
| Path | Introduced in | Role |
|---|---|---|
| `docs/plan/07-post-purchase-extension.md` | step 0 (plan) | Design doc |
| `docs/dogbook-baseline/01-current-state.md` | step 0 (baseline) | This folder |
| `docs/dogbook-baseline/02-post-purchase-impact-and-revert.md` | step 0 (baseline) | This file |
| `shopify.app.pp-local.toml` | step 2.5 | Local/dev-store app config, isolated from baseline `shopify.app.toml` |
| `shopify.app.pp-staging.toml` | step 2.5 | Vercel-staging app config, isolated from baseline `shopify.app.staging.toml` |
| `app/lib/post-purchase-sign.server.js` | step 1 | HS256 JWT signer |
| `app/lib/post-purchase-sign.test.mjs` | step 1 | Signer tests |
| `app/routes/api.post-purchase.sign.jsx` | step 2 | `POST /api/post-purchase/sign` endpoint |
| `extensions/wholesale-post-purchase/**` | step 3 | Shopify extension bundle (scaffolded by CLI) |
| `app/routes/api.post-purchase.offer.jsx` *(if we add it)* | step 5 (optional) | Dynamic offer lookup |

### Modified (careful revert)
| Path | What changes | Revert note |
|---|---|---|
| `shopify.app.toml` | **Should stay untouched** — we switched to `shopify.app.pp-local.toml` for post-purchase work. If this file changes, the CLI switched configs unexpectedly; revert verbatim from `7ad30c4`. |
| `shopify.app.staging.toml` | **Should stay untouched** — see above, staging equivalent. |
| `package.json` | `extensions/*` workspace will pick up the new extension's deps indirectly | Workspace glob already exists — no change expected |
| `package-lock.json` | New transitive deps from `@shopify/post-purchase-ui-extensions-react` | Regenerate with `npm install` after revert, or `git checkout` the baseline lockfile |

### Not touched (confirmed)
- `prisma/schema.prisma` and `prisma/migrations/` — no new tables unless the client confirms dynamic offer rules. No migration risk at this stage.
- `middleware.js` — matcher is still `/api/wholesale-orders` only. New endpoint has its own CORS, no edge-middleware change.
- Any existing route under `app/routes/` — untouched.
- Scopes — unchanged (post-purchase doesn't need new ones).

---

## 2. What post-purchase could break in the wholesale flow

### 2a. `orders/paid` webhook — mostly safe

Current logic (`app/routes/webhooks.orders.paid.jsx`): finds
`note_attributes[wholesale_order_id]`, flips `WholesaleOrder.isPaid`,
stores `shopifyOrderId` / `shopifyOrderName`.

Post-purchase upsells **modify the existing order via `applyChangeset`** —
Shopify does **not** fire a second `orders/paid`. Our existing flow stays
intact for the initial payment.

**But:** `WholesaleOrder.totalAmount` in our DB will no longer match the
final Shopify order total if a buyer accepts a post-purchase upsell.
Admin UI (`app/routes/app._index.jsx`, `app.orders.$id.jsx`) shows our
stored total, not Shopify's — so the merchant sees the pre-upsell amount.
Low severity; flag to merchant.

### 2b. Vercel deploys — additive, not destructive

The new `/api/post-purchase/sign` is a new route — the wholesale route and
all webhook routes remain unchanged. A Vercel deploy of post-purchase
work:
- **Does not** change the `/api/wholesale-orders` behaviour.
- **Does not** change DB schema.
- **Adds** build footprint (~1 route + extension bundle at build time; extension itself ships to Shopify's CDN, not Vercel).

### 2c. Shopify app config deploy — needs explicit action

`shopify app deploy` publishes a new app version in the Partner Dashboard,
including the extension. **The extension doesn't go live until the merchant
selects it** in Admin → Settings → Checkout → Post-purchase page.

- If the merchant selected it: reverting the Vercel deploy alone is
  **not enough** — the extension still shows at checkout, and its calls
  to `/api/post-purchase/sign` would 404 after revert.
- Required merchant action on revert: deselect the post-purchase app in
  the same admin settings panel, or we publish a new app version with the
  extension removed via `shopify app deploy`.

### 2d. Env vars — none new required

Reuses `SHOPIFY_API_KEY` + `SHOPIFY_API_SECRET` (already set in Vercel for
the base app). No new secrets to add or revoke.

### 2e. CORS allowlists — no overlap

The wholesale CORS allowlist (`middleware.js` + `app/lib/cors.server.js`)
is matched to `/api/wholesale-orders`. The post-purchase sign endpoint has
its own CORS block inside the route. No shared state, no accidental
loosening of the wholesale allowlist.

---

## 3. Revert procedure (staging on Vercel)

Pick one of the three paths based on how deep the post-purchase work got.

### Path A — nothing deployed to Shopify yet (steps 1–2 only)

```bash
# Drop the post-purchase files from the working tree
git checkout 7ad30c4 -- shopify.app.toml package.json package-lock.json
rm -rf app/lib/post-purchase-sign.server.js \
       app/lib/post-purchase-sign.test.mjs \
       app/routes/api.post-purchase.sign.jsx

git commit -am "revert: remove post-purchase scaffolding"
git push                      # Vercel auto-deploys
```

Vercel's next build serves the baseline. Done.

### Path B — extension scaffolded + CLI deployed, merchant hasn't selected it

```bash
# Local
rm -rf extensions/wholesale-post-purchase
git checkout 7ad30c4 -- shopify.app.toml package.json package-lock.json
rm -rf app/lib/post-purchase-sign.* app/routes/api.post-purchase.*
git commit -am "revert: remove post-purchase extension"
git push

# Shopify app registry
shopify app deploy            # publishes the reverted (= extension-free) app version
```

The extension disappears from the Partner Dashboard's active version.
Merchant can't accidentally enable it.

### Path C — merchant already selected the extension in Admin → Checkout settings

```bash
# 1. First, have the merchant deselect it:
#    Shopify admin → Settings → Checkout → Post-purchase page → "None"
#    (Or: pick a different app, if they had one before ours.)

# 2. Then run Path B.
```

Order of operations matters: if we deploy the extension-free app version
*before* the merchant deselects, their checkout tries to render a
post-purchase page from an app that no longer declares the extension —
Shopify's runtime handles this gracefully (falls through to Thank-you), but
it's a 2-minute window of ugly UX. Deselect first, then deploy.

---

## 4. Sanity check after revert

Run the same four checks from `01-current-state.md` §7:

```bash
git log -1 --format=%H                                   # expect 7ad30c4 or ancestor
ls app/lib/post-purchase-sign.server.js 2>/dev/null      # expect nothing
ls -d extensions/wholesale-post-purchase 2>/dev/null     # expect nothing
grep -c '\[\[extensions\]\]' shopify.app.toml            # expect 0
curl -X OPTIONS https://<staging-host>/api/wholesale-orders -i | head -1
# expect: HTTP/2 204
```

Plus one more:
```bash
curl -X POST https://<staging-host>/api/post-purchase/sign -i | head -1
# expect: HTTP/2 404      (route is gone)
```

---

## 5. Running impact log (filled as each step lands)

### Step 1 — JWT signer lib
- Added: `app/lib/post-purchase-sign.server.js`, `app/lib/post-purchase-sign.test.mjs`
- Modified: none
- Risk to wholesale flow: **none** (pure lib, nothing imports it yet)

### Step 2 — Sign endpoint
- Added: `app/routes/api.post-purchase.sign.jsx`
- Modified: none
- Risk to wholesale flow: **none** (new route, independent CORS)

### Step 3 — Extension scaffold (pending)
- Will add: `extensions/wholesale-post-purchase/**`
- Will modify: `shopify.app.toml`, `package-lock.json`
- Risk to wholesale flow: **low** — `shopify.app.toml` edit is the only shared file; keep diff reviewable before commit

### Step 2.5 — npm cleanup after scaffold
- Modified: `package.json` (removed `packageManager: pnpm@...` field added by scaffold)
- Deleted: `pnpm-lock.yaml` (untracked, created by scaffold)
- Left alone: `pnpm-workspace.yaml` (pre-existing in repo; npm ignores it)
- Risk to wholesale flow: **none** — pure tooling tidy

### Step 3 — Extension scaffold
- Added: `extensions/wholesale-post-purchase/` (shopify.extension.toml + package.json + src/index.jsx stub)
- Modified: none in baseline (CLI's config prompt doesn't rewrite `shopify.app.toml`)
- Risk to wholesale flow: **none** — isolated under `extensions/`

### Step 4 — Real extension code
- Replaced: `extensions/wholesale-post-purchase/src/index.jsx` (scaffold boilerplate → working ShouldRender + Render wired to `/api/post-purchase/sign`)
- Modified: none
- Risk to wholesale flow: **none** — extension runtime is isolated to Shopify's checkout flow
- **Still to configure before running:** hardcoded `OFFER.variantId` (TODO at top of file) and `APP_URL` (local-dev needs the `shopify app dev` tunnel URL; staging default already set)

### Step 5 — Offer source: shop metafield (Part A of three)
- Added: `app/routes/api.post-purchase.offer.jsx` — GET endpoint reading `shop.metafield(namespace:"app", key:"post_purchase_offer")` via Admin GraphQL (public read, CORS open; returns `{offer:null}` when unset)
- Modified: `shopify.app.pp-local.toml`, `shopify.app.pp-staging.toml` — new `[shop.metafields.app.post_purchase_offer]` JSON metafield definition
- Modified: `extensions/wholesale-post-purchase/src/index.jsx` — removed hardcoded `OFFER`; `ShouldRender` fetches `/api/post-purchase/offer?shop=<domain>`, returns `{render:false}` when metafield unset or invalid
- Risk to wholesale flow: **none** — new independent endpoint, no shared state. Scopes unchanged (app-owned shop metafields are readable by the owning app).
- Operational note: after deploy the metafield is empty → extension does not render. Merchant seeds it manually (Admin → Settings → Custom data → Shop → Post-purchase offer) OR waits for Part C (embedded settings page).

### Step 6 — Embedded settings page (Part C of three)
- Added: `app/routes/app.post-purchase.jsx` — Polaris web-component form; loader reads shop metafield via Admin GraphQL, action writes via `metafieldsSet`
- Modified: `app/routes/app.jsx` — added `s-link href="/app/post-purchase"` nav entry
- Risk to wholesale flow: **none** — new embedded page under `/app`, uses the same `authenticate.admin(request)` as the baseline. Variant selection uses App Bridge's `window.shopify.resourcePicker` (no new deps).

### Step 7 — Metaobject multi-offer with trigger rules (Part B of three)
- Added metaobject `app--post_purchase_offer` to both pp-local and pp-staging tomls with fields: `offer` (json, required), `trigger_product` (product_reference, optional), `priority` (number_integer), `enabled` (boolean)
- Modified: `app/routes/api.post-purchase.offer.jsx` — resolver now (1) queries metaobject entries, filters by `enabled` + trigger product match (empty trigger = applies to all), picks highest priority; (2) falls back to shop metafield (A) when no metaobject match. Response includes `source: "metaobject"|"metafield"` for debugging.
- Modified: `extensions/wholesale-post-purchase/src/index.jsx` — `ShouldRender` now also sends `product_ids` (from `initialPurchase.lineItems[].product.id`) to the offer endpoint for trigger matching.
- Risk to wholesale flow: **none** — all additive. Metafield fallback (A) still works when no metaobject entries exist.
- Merchant workflow: Admin → Content → Metaobjects → Post-purchase offer → Add entry. Set the `offer` JSON (same shape as the metafield), optionally pick a trigger product, set priority and enabled.

### Step 8+ — TBD
- Fill in as each step lands
