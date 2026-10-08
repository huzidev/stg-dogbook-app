# The Dog Book App — Baseline Snapshot

Point-in-time snapshot of the app **as it exists before the post-purchase work begins**. If post-purchase has to be ripped out, this doc + the git history is the reference for "what should be here instead."

**Baseline commit on `main`:** `7ad30c4` — "post purchase sell plan" (the plan file was added, but no code yet).
**Deployment:** Vercel staging. Public URL serves the live wholesale intake flow for the dog-book storefront theme.

Keep this file read-only. The post-purchase work introduces new files + edits to `shopify.app.toml`, `package.json`, and `package-lock.json` — all tracked in `02-post-purchase-impact-and-revert.md`.

---

## 1. What the app does (today)

A Shopify-embedded admin app for **The Dog Book**. One business purpose:
receive wholesale order submissions from the storefront theme's intake form,
persist them, and reconcile payment via a Shopify webhook.

Full theme-side contract: `docs/THEME_APP_LINK.md`. The plan docs
`docs/plan/00-overview.md` → `06-heroku-deployment.md` cover the original
build-out.

---

## 2. Baseline file inventory

Only files that carry **custom** logic (not framework scaffolding). Anything
not in this list is template-default.

### Public API
- `app/routes/api.wholesale-orders.jsx` — `POST /api/wholesale-orders`, called by the storefront theme. Validates, persists, returns `{ order_id, checkout_url: null }`.
- `middleware.js` (repo root) — Vercel edge CORS preflight, matcher `/api/wholesale-orders` only.
- `app/lib/cors.server.js` — route-level CORS headers.

### Validation + DB mapping
- `app/lib/wholesale-intake.server.js` — `validateIntake`, `toPrismaCreate`, `toCents`.
- `app/lib/wholesale-intake.test.mjs` — tests.

### Shopify integration
- `app/lib/shopify-checkout.server.js` — cart-permalink builder, currently **disabled** (route returns `checkout_url: null`).
- `app/lib/shopify-checkout.test.mjs` — tests.
- `app/routes/webhooks.orders.paid.jsx` — matches `note_attributes[wholesale_order_id]` and flips `WholesaleOrder.isPaid`.

### Admin UI (embedded)
- `app/routes/app._index.jsx` — list of wholesale orders with paid/unpaid badges.
- `app/routes/app.orders.$id.jsx` — single-order detail with Shopify admin deep link.

### Data model
- `prisma/schema.prisma` — `Session`, `WholesaleOrder`, `WholesaleOrderItem`. Postgres. Migrations in `prisma/migrations/`.

### One-off scripts
- `scripts/add-wholesale-variants.mjs` — adds Retail/Wholesale `Tier` option to every product. Idempotent. Not part of request/response path.

### Shopify app config
- `shopify.app.toml` — client_id `cca3b701af7d14ec22301d7e329100c8`, scopes `write_products, write_metaobjects, write_metaobject_definitions, read_orders`, three webhook subscriptions (`app/uninstalled`, `app/scopes_update`, `orders/paid`), API version `2026-10`.
- `shopify.app.staging.toml` — staging variant.
- `shopify.web.toml` — web process config.

### Build / deploy
- `react-router.config.js` — uses `vercelPreset()`.
- `package.json` — build runs `prisma generate && prisma migrate deploy && react-router build`. Workspace glob: `extensions/*` (currently empty).
- `Procfile`, `Dockerfile` — alt deploy targets.

---

## 3. Baseline runtime surface

| Path | Method | Who calls it |
|---|---|---|
| `/api/wholesale-orders` | `POST`, `OPTIONS` | Storefront theme (CORS allowlist) |
| `/webhooks/orders/paid` | `POST` | Shopify webhooks |
| `/webhooks/app/uninstalled` | `POST` | Shopify webhooks |
| `/webhooks/app/scopes_update` | `POST` | Shopify webhooks |
| `/app`, `/app/_index`, `/app/orders/:id`, `/app/additional` | `GET` | Shopify admin (embedded iframe) |
| `/auth`, `/auth/login` | `GET` | Shopify OAuth |

No other public routes exist today. **Any new route added by post-purchase work is additive and belongs on the revert list.**

---

## 4. Baseline Shopify scopes

```
write_products
write_metaobjects
write_metaobject_definitions
read_orders
```

Post-purchase extensions **do not require new scopes**. If the scope list
changes in a post-purchase commit, that's a flag — the baseline should hold.

---

## 5. Baseline deps (relevant subset)

Package.json tracks:
- `@prisma/client`, `prisma` — DB
- `@react-router/*`, `react-router` — framework
- `@shopify/app-bridge-react` — admin UI
- `@shopify/shopify-app-react-router` — app server
- `@shopify/shopify-app-session-storage-prisma` — session storage
- `@vercel/react-router` — Vercel preset (dev dep)

No `@shopify/post-purchase-ui-extensions-react` in the baseline. If `pnpm`/`npm ls` shows it, we're no longer at the baseline.

---

## 6. Baseline uncommitted drift (as of `main` HEAD)

Working tree currently has unstaged changes to:
- `app/lib/cors.server.js`
- `app/lib/wholesale-intake.server.js`
- `app/lib/wholesale-intake.test.mjs`
- `app/routes/api.wholesale-orders.jsx`
- `middleware.js`

These are **pre-existing** — not part of post-purchase work. Keep that in
mind when diffing a revert: they'll still be modified after a revert
unless explicitly reset.

---

## 7. How to verify you're at baseline

```bash
# 1. Correct commit (or earlier)
git log -1 --format=%H     # expect 7ad30c4 or an ancestor

# 2. No post-purchase files
ls app/lib/post-purchase-sign.server.js 2>/dev/null && echo "NOT BASELINE"
ls app/routes/api.post-purchase.sign.jsx 2>/dev/null && echo "NOT BASELINE"
ls -d extensions/wholesale-post-purchase 2>/dev/null && echo "NOT BASELINE"

# 3. shopify.app.toml has no [[extensions]] blocks beyond the scaffolded defaults
grep -c '\[\[extensions\]\]' shopify.app.toml   # expect 0

# 4. Wholesale endpoint still responds
curl -X OPTIONS https://<staging-host>/api/wholesale-orders -i | head -1
# expect: HTTP/2 204
```

If all four pass, you're at baseline.
