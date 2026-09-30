const SHOP_DOMAIN = () => process.env.SHOPIFY_SHOP_DOMAIN;

// gid://shopify/ProductVariant/12345 or "44123456789012" → "12345" / "44123456789012"
export function numericVariantId(idOrGid) {
  const s = String(idOrGid);
  const m = s.match(/(\d+)$/);
  return m ? m[1] : s;
}

export function buildCheckoutUrl(order, lines) {
  const domain = SHOP_DOMAIN();
  if (!domain) {
    console.warn(`[wholesale] checkout_url=null: SHOPIFY_SHOP_DOMAIN env var is unset`);
    return null;
  }

  const linked = lines.filter((l) => l.variant_id);
  const unlinked = lines.filter((l) => !l.variant_id);
  if (linked.length === 0) {
    console.warn(
      `[wholesale] checkout_url=null: all ${lines.length} lines missing variant_id (attach Shopify products to these breeds: ${unlinked.map((l) => l.handle).join(", ")})`,
    );
    return null;
  }

  const cart = linked
    .map((l) => `${numericVariantId(l.variant_id)}:${l.count}`)
    .join(",");

  const noteParts = [
    `Shop: ${order.shopName}`,
    `URL: ${order.storeUrl}`,
    `Channel: ${order.channel}`,
    `Invoice: ${order.invoiceAddress}`,
  ];
  if (unlinked.length) {
    noteParts.push(
      `Unlinked breeds (add manually): ${unlinked.map((l) => `${l.name} x${l.count}`).join(", ")}`,
    );
  }

  const qs = new URLSearchParams({
    "attributes[wholesale_order_id]": order.id,
    "checkout[shipping_address][address1]": order.businessAddress,
    "note": noteParts.join(" | "),
  });

  return `https://${domain}/cart/${cart}?${qs.toString()}`;
}
