// Shared offer loader for the post-purchase + checkout upsell extensions.
//
// Shape returned by GET /api/post-purchase/offer:
//   { offers: Offer[], discountPercent: number, orderName?: string, source?: string }
// where Offer = {
//   variantId: number,         // numeric id
//   variantGid: string,        // "gid://shopify/ProductVariant/..."
//   productTitle: string,
//   imageUrl: string|null,
//   price: string,             // "96.00"
//   compareAtPrice: string|null,
//   currencyCode: string,
// }
//
// Each extension's runtime is different (post-purchase has no React Query, no
// hooks-based API; checkout has useApi). So this file ships two helpers:
//   - fetchOffers(appUrl, {shopDomain, productIds, orderId})
//   - alreadyInCart(offers, cartLineVariantGids): filters offers already
//     present in the cart/order.

export const APP_URL = "https://stg-dogbook-app.vercel.app";

const toNumeric = (gidOrId) => {
  if (gidOrId == null) return null;
  const s = String(gidOrId);
  return s.includes("/") ? s.split("/").pop() : s;
};

export const toVariantGid = (id) =>
  id == null ? null : `gid://shopify/ProductVariant/${toNumeric(id)}`;

export async function fetchOffers(
  appUrl,
  { shopDomain, productIds = [], orderId = null } = {},
) {
  if (!shopDomain) return { offers: [], discountPercent: 20 };
  const params = new URLSearchParams({ shop: shopDomain });
  if (productIds.length) params.set("product_ids", productIds.join(","));
  if (orderId) params.set("order_id", String(orderId));
  try {
    const res = await fetch(
      `${appUrl ?? APP_URL}/api/post-purchase/offer?${params.toString()}`,
    );
    if (!res.ok) return { offers: [], discountPercent: 20 };
    const body = await res.json();
    return {
      offers: Array.isArray(body?.offers) ? body.offers : [],
      discountPercent: Number(body?.discountPercent) || 20,
      orderName: body?.orderName ?? null,
      source: body?.source ?? null,
    };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[useOffers] fetchOffers failed", err);
    return { offers: [], discountPercent: 20 };
  }
}

export function filterNotInCart(offers, cartVariantGids) {
  if (!offers?.length) return [];
  const inCart = new Set(cartVariantGids.map((g) => toNumeric(g)));
  return offers.filter((o) => !inCart.has(toNumeric(o.variantId)));
}

export function formatMoney(amount, currencyCode = "USD") {
  const n = Number(amount);
  if (!Number.isFinite(n)) return "";
  // Keep it dumb — Intl is available in both extension runtimes but Shopify's
  // post-purchase sandbox has occasionally polyfilled it inconsistently.
  const symbol =
    currencyCode === "USD" ? "$" : currencyCode === "EUR" ? "€" : "";
  return `${symbol}${n.toFixed(2)}`;
}

export function formatMMSS(secondsLeft) {
  const s = Math.max(0, Math.floor(secondsLeft));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}
