// Shopify Function — Cart line discount generator for the checkout upsell.
//
// Fires on every cart recalculation. For each line carrying the attribute
// `_upsell_source == "checkout"` (written by the dogbook-checkout-upsell
// extension when the shopper clicks ADD), emit a product discount for the
// configured percent.
//
// The percent lives on the DiscountNode as a metafield
// `app.upsell_discount_percent` so the admin app can keep it in sync with
// the configured discount_percent on the offer metaobject. If the metafield
// isn't set, fall back to 20.
//
// ponytail: hardcoded fallback 20. Upgrade path when a merchant changes the
// discount in admin: the Save handler in app.post-purchase.jsx should write
// the same value to this DiscountNode's metafield.

const DEFAULT_PERCENT = 20;
const UPSELL_SOURCE_KEY_VALUE = "checkout";

export function run(input) {
  const lines = input?.cart?.lines ?? [];
  const metafieldValue = input?.discount?.metafield?.value;
  const parsedPercent = Number(metafieldValue);
  const percent =
    Number.isFinite(parsedPercent) && parsedPercent > 0
      ? parsedPercent
      : DEFAULT_PERCENT;

  const targets = lines
    .filter((line) => line?.attribute?.value === UPSELL_SOURCE_KEY_VALUE)
    .map((line) => ({ cartLine: { id: line.id } }));

  if (!targets.length) return { operations: [] };

  return {
    operations: [
      {
        productDiscountsAdd: {
          candidates: [
            {
              message: `${percent}% off upsell`,
              targets,
              value: {
                percentage: { value: percent },
              },
            },
          ],
          selectionStrategy: "FIRST",
        },
      },
    ],
  };
}
