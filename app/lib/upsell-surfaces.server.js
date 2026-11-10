import prisma from "../db.server";

// Shopify doesn't expose a reliable API to detect whether a customer-account
// UI extension block is installed on the Order status page. ponytail: use our
// own data as the signal — if we've recorded at least one upsell conversion
// from the order-status surface in the last 90 days, treat it as Live.
// Upgrade path: have the extension POST a "rendered" ping to a new endpoint
// and persist last-seen timestamp per shop.
export async function orderStatusBlockLiveStatus(shop) {
  const since = new Date(Date.now() - 90 * 24 * 3600 * 1000);
  const hit = await prisma.upsellConversion.findFirst({
    where: { shop, source: "order-status", createdAt: { gte: since } },
    select: { id: true },
  });
  return hit ? "live" : "not-added";
}
