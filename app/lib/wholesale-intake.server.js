const CHANNELS = new Set(["Online", "Offline", "Both"]);

const isNonEmptyString = (v) => typeof v === "string" && v.trim().length > 0;
const isPositiveInt = (v) => Number.isInteger(v) && v > 0;
const isNonNegNumber = (v) => typeof v === "number" && Number.isFinite(v) && v >= 0;

export const toCents = (dollars) => Math.round(dollars * 100);

export function validateIntake(body) {
  const errors = {};
  if (!body || typeof body !== "object") return { _root: "body must be a JSON object" };

  if (!isNonEmptyString(body.shop_name)) errors.shop_name = "required";
  if (!isNonEmptyString(body.store_url)) errors.store_url = "required";
  if (!isNonEmptyString(body.business_address)) errors.business_address = "required";
  if (!isNonEmptyString(body.invoice_address)) errors.invoice_address = "required";
  if (!CHANNELS.has(body.channel)) errors.channel = "must be Online, Offline, or Both";

  if (!body.totals || typeof body.totals !== "object") {
    errors.totals = "required object with units and price";
  } else {
    if (!isPositiveInt(body.totals.units)) errors["totals.units"] = "positive integer required";
    if (!isNonNegNumber(body.totals.price)) errors["totals.price"] = "non-negative number required";
  }

  if (!Array.isArray(body.lines) || body.lines.length === 0) {
    errors.lines = "non-empty array required";
  } else {
    body.lines.forEach((l, i) => {
      if (!l || typeof l !== "object") { errors[`lines[${i}]`] = "must be object"; return; }
      if (!isNonEmptyString(l.handle)) errors[`lines[${i}].handle`] = "required";
      if (!isNonEmptyString(l.name)) errors[`lines[${i}].name`] = "required";
      if (!isPositiveInt(l.count)) errors[`lines[${i}].count`] = "positive integer required";
      if (!isNonNegNumber(l.price)) errors[`lines[${i}].price`] = "non-negative number required";
      if (l.variant_id != null && typeof l.variant_id !== "string") errors[`lines[${i}].variant_id`] = "string or null";
      if (l.product_title != null && typeof l.product_title !== "string") errors[`lines[${i}].product_title`] = "string or null";
    });
  }

  return Object.keys(errors).length ? errors : null;
}

export function toPrismaCreate(body) {
  return {
    shopName: body.shop_name.trim(),
    storeUrl: body.store_url.trim(),
    channel: body.channel,
    businessAddress: body.business_address.trim(),
    invoiceAddress: body.invoice_address.trim(),
    currency: body.currency ?? "USD",
    totalUnits: body.totals.units,
    totalAmount: toCents(body.totals.price),
    items: {
      create: body.lines.map((l) => ({
        handle: l.handle,
        name: l.name,
        variantId: l.variant_id ?? null,
        productTitle: l.product_title ?? null,
        quantity: l.count,
        unitPrice: toCents(l.price),
      })),
    },
  };
}
