# Checkout Price Calculation — Extension Plan

## Purpose
Render a per-line price breakdown (base, tax, 2.9% service fee, total) inside the Shopify checkout, driven by product metafields. Visual only — does **not** mutate cart totals.

## Surface
- **API version:** `2025-10`
- **Type:** `ui_extension` (Preact runtime)
- **Target:** `purchase.checkout.block.render` — merchant drags the block where they want it in checkout editor.
- **Entry:** `src/Checkout.jsx` → `render(<Extension />, document.body)`.
- **Handle:** `checkout-price-calculation`.

### `shopify.extension.toml`
```toml
api_version = "2025-10"
uid = "234b23d5-2afb-06c5-5c18-5dcea16ed7d154eced31"

[[extensions]]
type = "ui_extension"
name = "Checkout price calculation"
handle = "checkout-price-calculation"

[[extensions.targeting]]
target = "purchase.checkout.block.render"
module = "./src/Checkout.jsx"

[[extensions.metafields]]
namespace = "custom"
key = "custom_tax_included"

[[extensions.metafields]]
namespace = "custom"
key = "tax"

[[extensions.metafields]]
namespace = "custom"
key = "actual_ticket_price_without_tax"

[extensions.settings]

[[extensions.settings.fields]]
key = "heading"
type = "single_line_text_field"
name = "Heading"
description = "Heading shown above the custom price breakdown."
```

### `package.json`
```json
{
  "name": "checkout-price-calculation",
  "dependencies": {
    "preact": "^10.10.x",
    "@shopify/ui-extensions": "~2025.10.0"
  }
}
```

## Inputs
1. **Cart lines** — `shopify.lines.value` + `.subscribe`. Each line gives `cost.totalAmount`, `quantity`, `merchandise.product.id`, image, selectedOptions.
2. **App metafields** (`useAppMetafields`, `namespace: "custom"`, `type: "product"`):
   - `custom_tax_included` (bool) — if true, tax is computed on top of a stored net price.
   - `tax` (number, percent, e.g. `13` → 13%) — tax rate.
   - `actual_ticket_price_without_tax` (money/number) — net price per unit. Values ≥ 100 are treated as cents.
3. **Block setting:** `heading` (single_line_text_field) — optional heading above the breakdown.

All three metafields are declared in `shopify.extension.toml` so the extension has read access.

### Reading lines, settings, metafields
```jsx
import "@shopify/ui-extensions/preact";
import {useAppMetafields} from "@shopify/ui-extensions/checkout/preact";
import {render} from "preact";
import {useEffect, useMemo, useState} from "preact/hooks";

const DEFAULT_SERVICE_FEE_RATE = 0.029;
const TAX_METAFIELD = "tax";
const CUSTOM_TAX_INCLUDED_METAFIELD = "custom_tax_included";
const ACTUAL_PRICE_WITHOUT_TAX_METAFIELD = "actual_ticket_price_without_tax";

export default function () {
  render(<Extension />, document.body);
}

function Extension() {
  const [lines, setLines] = useState(() => shopify.lines.value ?? []);
  const [settings, setSettings] = useState(() => shopify.settings.value ?? {});

  const customTaxIncludedMetafields = useAppMetafields({
    namespace: "custom", key: CUSTOM_TAX_INCLUDED_METAFIELD, type: "product",
  });
  const taxMetafields = useAppMetafields({
    namespace: "custom", key: TAX_METAFIELD, type: "product",
  });
  const actualPriceWithoutTaxMetafields = useAppMetafields({
    namespace: "custom", key: ACTUAL_PRICE_WITHOUT_TAX_METAFIELD, type: "product",
  });

  useEffect(() => shopify.lines?.subscribe?.((n) => setLines(n ?? [])), []);
  useEffect(() => shopify.settings?.subscribe?.((n) => setSettings(n ?? {})), []);
  // ...
}
```

## Calculation
Per line, in `calculateLineBreakdown`:

- `finalTotal = line.cost.totalAmount.amount` (what the customer actually pays — unchanged).
- **If `custom_tax_included == true` and `actual_ticket_price_without_tax` present:**
  - `basePrice = net * quantity`
  - `tax = basePrice * taxRate`
- **Else:**
  - `basePrice = finalTotal / (1 + 0.029)` (strip service fee out of the total)
  - `tax = 0`
- `serviceFee = basePrice * 0.029` (`DEFAULT_SERVICE_FEE_RATE`).
- Display: thumbnail+qty, title, variant subtitle, line total, tax row (if any), service fee row, grand total.

Service fee rate is a module constant. Tax rate comes from the metafield (parsed as percent; `%` stripped; JSON `{amount|value}` shapes supported).

```jsx
function calculateLineBreakdown(line, metafields) {
  const currency = line.cost?.totalAmount?.currencyCode ?? "USD";
  const finalTotal = parseAmount(line.cost?.totalAmount?.amount);
  const quantity = line.quantity ?? 1;

  const customTaxIncluded = parseBooleanMetafield(metafields[CUSTOM_TAX_INCLUDED_METAFIELD]);
  const taxRate = parsePercentMetafield(metafields[TAX_METAFIELD]);
  const actualPriceWithoutTax = parseMoneyMetafield(metafields[ACTUAL_PRICE_WITHOUT_TAX_METAFIELD]);

  let basePrice, tax = 0;
  if (customTaxIncluded && actualPriceWithoutTax !== null) {
    basePrice = actualPriceWithoutTax * quantity;
    tax = roundMoney(basePrice * taxRate);
  } else {
    basePrice = removeServiceFeeFromTotal(finalTotal); // finalTotal / 1.029
  }
  const serviceFee = roundMoney(basePrice * DEFAULT_SERVICE_FEE_RATE);

  return { id: line.id, title: ..., quantity, currency,
           originalPrice: finalTotal, serviceFee, serviceFeeRate: DEFAULT_SERVICE_FEE_RATE,
           tax, taxRate, hasTax: taxRate > 0, finalTotal };
}

function removeServiceFeeFromTotal(total) {
  const basePriceInCents = Math.ceil((total * 100) / (1 + DEFAULT_SERVICE_FEE_RATE));
  return basePriceInCents / 100;
}
```

## Metafield matching
`getMetafieldsForLine` matches by product id with a loose GID compare (`===` or suffix match either direction) to tolerate `gid://shopify/Product/123` vs bare id drift between Storefront and Admin shapes.

```jsx
function getMetafieldsForLine(line, metafields) {
  const productId = line.merchandise?.product?.id ?? "";
  const matched = metafields.filter((entry) => {
    const entryId = entry.target?.id ?? "";
    if (!entryId || !productId) return false;
    return entryId === productId
        || productId.endsWith(entryId)
        || entryId.endsWith(productId);
  });
  return matched.reduce((acc, entry) => {
    acc[entry.metafield.key] = entry.metafield.value;
    return acc;
  }, {});
}
```

### Metafield parsers (handle JSON-shaped and `%`-suffixed values)
```jsx
function parseBooleanMetafield(v) {
  if (v === true) return true;
  if (typeof v !== "string") return false;
  const s = v.trim().toLowerCase();
  return s === "true" || s === "1";
}

function parsePercentMetafield(v) {
  const n = parseNumericMetafield(v);
  return Number.isFinite(n) ? n / 100 : 0;
}

function parseMoneyMetafield(v) {
  if (v == null || v === "") return null;
  const n = parseNumericMetafield(v);
  if (!Number.isFinite(n)) return null;
  return n >= 100 ? n / 100 : n; // ponytail: cents-vs-dollars heuristic
}

function parseNumericMetafield(v) {
  if (typeof v === "number") return v;
  if (typeof v !== "string") return NaN;
  const s = v.trim();
  if (s.startsWith("{")) {
    try {
      const p = JSON.parse(s);
      return parseNumericMetafield(p.amount ?? p.value ?? p);
    } catch { return NaN; }
  }
  return Number(s.replace("%", ""));
}
```

## Rendering
Polaris checkout web components only: `s-stack`, `s-box`, `s-grid`, `s-divider`, `s-text`, `s-heading`, `s-product-thumbnail`. No external UI deps. Returns `null` when cart is empty.

### Markup
```jsx
<s-stack gap="base">
  {heading && <s-heading size="large-300">{heading}</s-heading>}

  {breakdown.map((line) => (
    <s-box key={line.id} padding="large-100" border="base" borderRadius="large" background="transparent">
      <s-stack gap="small-100">

        {/* Row 1: thumbnail (with qty badge) | title + variant | line price */}
        <s-grid gridTemplateColumns="auto 1fr auto" gap="base" alignItems="center">
          <s-product-thumbnail
            src={line.imageUrl}
            alt={line.title}
            size="base"
            totalItems={line.quantity}
          />
          <s-stack gap="small-200">
            <s-text type="strong">{line.title}</s-text>
            {line.subtitle && <s-text tone="neutral">{line.subtitle}</s-text>}
          </s-stack>
          <s-text type="strong">{formatMoney(line.originalPrice, line.currency)}</s-text>
        </s-grid>

        <s-divider />

        {/* Fee rows */}
        <s-stack gap="small-100">
          {line.hasTax && (
            <s-grid gridTemplateColumns="1fr auto" gap="base">
              <s-text type="small">Taxes ({formatPercent(line.taxRate)})</s-text>
              <s-text type="small">{formatMoney(line.tax, line.currency)}</s-text>
            </s-grid>
          )}
          <s-grid gridTemplateColumns="1fr auto" gap="base">
            <s-text type="small">Service fee ({formatPercent(line.serviceFeeRate)})</s-text>
            <s-text type="small">{formatMoney(line.serviceFee, line.currency)}</s-text>
          </s-grid>
        </s-stack>

        <s-divider />

        {/* Total */}
        <s-grid gridTemplateColumns="1fr auto" gap="base">
          <s-text type="strong">Total</s-text>
          <s-text type="strong">{formatMoney(line.finalTotal, line.currency)}</s-text>
        </s-grid>
      </s-stack>
    </s-box>
  ))}
</s-stack>
```

### Formatters
```jsx
function formatMoney(amount, currencyCode) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currencyCode }).format(amount);
}
function formatPercent(rate) {
  return `${(rate * 100).toFixed(1)}%`;
}
```

## Dev / Deploy
- `shopify app dev` from repo root — tunnels and auto-loads the extension in the dev store's checkout editor.
- `shopify app deploy` — ships a new extension version; merchant must publish in Partners.
- Build output lives in `dist/` (git-ignored artifact; do not hand-edit).
- Config files: `shopify.extension.toml` (targets, metafields, settings), `package.json` (preact + ui-extensions), `tsconfig.json`, `shopify.d.ts` (global `shopify` typings).

## Merchant setup checklist
1. Install app on store.
2. On each ticket product, set metafields in `custom` namespace: `tax` (e.g. `13`), `custom_tax_included` (`true`/`false`), `actual_ticket_price_without_tax` if applicable.
3. In checkout editor, add the "Checkout price calculation" block where desired and set the heading.

## Known limitations / ponytail notes
- Service fee rate is hardcoded at 2.9%. If it ever varies by product or region, promote to a metafield or extension setting.
- Breakdown is **display-only** — real tax/fees must still be enforced by Shopify Functions or product pricing. This block only explains the number, it does not change it.
- `console.log` calls in `Extension` and `getMetafieldsForLine` are dev aids; strip before a production deploy if log noise matters.
- `parseMoneyMetafield` guesses cents vs dollars by the `>= 100` threshold — fine for ticket prices, would misread a $100+ net price stored as dollars. Switch to the `money` metafield type if that ever bites.
- Loose GID suffix match in `getMetafieldsForLine` is deliberate (handles id-shape drift); tighten to strict `===` once both sides are confirmed to use full GIDs.

## Files
- `shopify.extension.toml` — target, metafield reads, settings schema.
- `src/Checkout.jsx` — single-file extension (render + calc + helpers).
- `package.json` — `preact`, `@shopify/ui-extensions`.
- `shopify.d.ts`, `tsconfig.json` — types.
- `dist/` — build output.
