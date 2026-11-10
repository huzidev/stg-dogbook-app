// @ts-check
import { DiscountClass, ProductDiscountSelectionStrategy } from "../generated/api";

/**
 * @typedef {import("../generated/api").Input} CartInput
 * @typedef {import("../generated/api").CartLinesDiscountsGenerateRunResult} CartLinesDiscountsGenerateRunResult
 */

const VALID_SOURCES = ["order-confirmation", "order-status", "checkout", "cart"];

// Cart permalinks only support cart-level attributes (not line-level), so
// clicking an upsell tile sets `_upsell_source` on the whole cart. Discounting
// every matching-variant line in the cart would catch normal catalog adds too.
// Fix: embed the clicked variant id in a second attribute `_upsell_variant`
// and discount only the one line whose variant matches it (and is still in the
// merchant's configured upsell set as a tamper guard).
const toNumeric = (id) => String(id ?? "").split("/").pop();

/**
 * @param {CartInput} input
 * @returns {CartLinesDiscountsGenerateRunResult}
 */
export function cartLinesDiscountsGenerateRun(input) {
  if (!input.discount.discountClasses.includes(DiscountClass.Product)) {
    return { operations: [] };
  }

  const config = input.discount.metafield?.jsonValue;
  const percent = Number(config?.discountPercent);
  if (!Number.isFinite(percent) || percent <= 0) return { operations: [] };

  const source = input.cart.source?.value;
  if (!source || !VALID_SOURCES.includes(source)) return { operations: [] };

  const upsellVariant = toNumeric(input.cart.upsellVariant?.value);
  if (!upsellVariant) return { operations: [] };

  const configuredVariants = new Set(
    (config?.variantIds ?? []).map((v) => toNumeric(v)),
  );
  if (!configuredVariants.has(upsellVariant)) return { operations: [] };

  const targets = input.cart.lines
    .filter(
      (line) =>
        line.merchandise.__typename === "ProductVariant" &&
        toNumeric(line.merchandise.id) === upsellVariant,
    )
    .map((line) => ({ cartLine: { id: line.id } }));

  if (!targets.length) return { operations: [] };

  return {
    operations: [
      {
        productDiscountsAdd: {
          selectionStrategy: ProductDiscountSelectionStrategy.First,
          candidates: [
            {
              message: `Dog Book upsell -${percent}%`,
              targets,
              value: { percentage: { value: percent } },
            },
          ],
        },
      },
    ],
  };
}
