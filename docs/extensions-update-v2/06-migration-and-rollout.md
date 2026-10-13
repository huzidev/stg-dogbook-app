# 06 — Migration + rollout

Four steps, each a self-contained PR. Each is reversible by `git
revert` alone (no data migration beyond the metafield seed in step 1).

## Step 1 — Data model switch (invisible to buyers)

**PR scope:**

- Add shop metafield write path in `app/routes/app.post-purchase.jsx`
  action.
- Keep the loader reading from BOTH the metaobject (existing) and the
  shop metafield (new), preferring the metafield.
- Add a one-time admin button or script that reads the current
  metaobject and writes its contents to the metafield (seed).
- `extensions/_shared/useOffers.js` and the backend keep working off
  the old shape — no reader changes yet.

**Verify:** admin page saves; `/api/post-purchase/offer` still returns
exactly what it used to; no visible change on either extension.

**Rollback:** revert the PR, metafield write still exists but nothing
reads it.

## Step 2 — Backend simplification

**PR scope:**

- Rewrite `api.post-purchase.offer.jsx` loader to read the shop
  metafield only. Delete the metaobject reader, the legacy JSON
  reader, and `normalizeLegacyOffer`.
- Delete the metaobject admin UI shape in `app.post-purchase.jsx`
  loader (switch to reading the metafield; the picker UI stays).
- Remove `write_metaobjects, write_metaobject_definitions` from
  `shopify.app.toml` scopes.
- Remove the `[metaobjects.app.example]` template cruft from
  `shopify.app.toml`.

**Verify:**

- Reinstall app on dev store to accept the new scope set.
- Admin page loads, saves, and reflects a change on the next
  extension render.
- Both extensions still render exactly as before (visual bugs
  included — we haven't fixed those yet).

**Rollback:** revert; existing merchants need another re-install
cycle to get the scopes back.

## Step 3 — Checkout extension visual fix + metafield read

**PR scope:**

- Add `[[extensions.metafields]]` block to
  `extensions/dogbook-checkout-upsell/shopify.extension.toml`.
- Rewrite `CheckoutUpsell.jsx` per section 03 (banner,
  horizontal-scroll grid, image sizing, keyword backgrounds, product
  thumbnail).
- Decide: read metafield directly via `useAppMetafields` + Storefront
  variant hydration, OR keep calling `/api/post-purchase/offer`.
  Default is the direct read; fall back to the API call if Storefront
  access to variants-by-GID is noisy.
- Delete the hex-color consumption from the file; keep `COLORS` import
  only if any value is actually used.

**Verify:** full UI matches Lovable mock within primitive limits; ADD
button still writes the line attribute; the pill still says the
configured percent.

**Rollback:** revert.

## Step 4 — Post-purchase extension visual fix

**PR scope:**

- Rewrite `extensions/wholesale-post-purchase/src/index.jsx` per
  section 02 (banner background keywords, pager, drop "Back to the
  offer" ghost reset, drop misleading "Swipe →").
- No data layer change — this extension still fetches from the
  simplified `/api/post-purchase/offer`.

**Verify:**

- Place a test order, land on thank-you, confirm UI matches section 02
  spec.
- Accept flow: `calculateChangeset` → sign → `applyChangeset` still
  works, pricing shows discount.
- Decline + expire panels no longer show the dev-only "Back to the
  offer" link.

**Rollback:** revert.

## Step 5 — Discount Function (optional, parallel)

**PR scope:**

- Scaffold `extensions/dogbook-upsell-discount` per section 05.
- Document the one-time merchant setup in README.
- Optionally wire a button in the admin page that calls
  `discountAutomaticAppCreate` to activate the Function automatically
  (adds `write_discounts` scope).

**Verify:** section 05 testing checklist.

**Rollback:** revert; the extension keeps writing the attribute,
discount silently stops being applied (same as today).

## Dependencies between steps

- **Steps 1 → 2 → 3 is a chain.** Each depends on the previous.
- **Step 4 is independent of 2 and 3.** The post-purchase extension
  doesn't care how the data is stored — it fetches a JSON contract
  from the app.
- **Step 5 is independent of everything else.** Can ship any time
  after step 1 (needs the metafield to exist for the Function to read).

## What stays constant

- The `/api/post-purchase/sign` route and the JWT verify/resign flow.
  Do not touch — it's correct and brittle to change.
- The `_upsell_source=checkout` attribute. Both the Function (step 5)
  and any future analytics path key off it.
- The deadline-based post-purchase countdown (survives tab
  backgrounding). Keep.
- `extensions/_shared/useOffers.js` for `formatMoney`, `formatMMSS`,
  `toVariantGid`. The `fetchOffers` export may become a thin wrapper
  or disappear from the checkout extension side.

## Decisions (resolved)

1. **Batch the scope changes.** Step 2 (`-write_metaobjects`,
   `-write_metaobject_definitions`) and Step 5 (`+write_discounts`)
   land in the same PR so there is one re-grant prompt total. Staging
   store, no live install coordination required.
2. **Scripted Function activation.** On install (and defensively on
   first admin-page load), call `discountAutomaticAppCreate` to wire
   the automatic discount to our Function. Idempotent — check for an
   existing discount with our handle first. Zero merchant chores.
3. **No feature flags.** Each PR rolls back via `git revert`. Staging
   store, no live customers to protect.
