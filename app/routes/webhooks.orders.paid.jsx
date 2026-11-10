import { authenticate } from "../shopify.server";
import prisma from "../db.server";

const tag = "[orders-paid-webhook]";

export const action = async ({ request }) => {
  const { topic, shop, payload } = await authenticate.webhook(request);
  console.log(
    `${tag} received topic=${topic} shop=${shop} shopify_order_id=${payload?.id} name=${payload?.name}`,
  );

  if (topic !== "ORDERS_PAID") {
    return new Response("ignored", { status: 200 });
  }

  await Promise.all([
    handleWholesale(shop, payload),
    handleUpsellConversion(shop, payload),
  ]);

  return new Response("ok", { status: 200 });
};

async function handleWholesale(shop, payload) {
  const attr = payload?.note_attributes?.find(
    (a) => a.name === "wholesale_order_id",
  );
  if (!attr?.value) return;

  const result = await prisma.wholesaleOrder.updateMany({
    where: { id: attr.value, isPaid: false },
    data: {
      isPaid: true,
      shopifyOrderId: String(payload.id),
      shopifyOrderName: payload.name ?? null,
      paidAt: new Date(
        payload.processed_at ?? payload.updated_at ?? Date.now(),
      ),
    },
  });

  if (result.count === 0) {
    console.warn(
      `${tag}[wholesale] no match for wholesale_order_id=${attr.value} (already paid or missing)`,
    );
  } else {
    console.log(
      `${tag}[wholesale] marked paid: ${attr.value} shopify_order=${payload.name}`,
    );
  }
}

async function handleUpsellConversion(shop, payload) {
  const attrs = payload?.note_attributes ?? [];
  const source = attrs.find((a) => a.name === "_upsell_source")?.value;
  const upsellVariant = attrs.find((a) => a.name === "_upsell_variant")?.value;
  if (!source || !upsellVariant) return;

  const line = (payload?.line_items ?? []).find(
    (li) => String(li.variant_id) === String(upsellVariant),
  );
  if (!line) {
    console.warn(
      `${tag}[upsell] source=${source} but no line_item matches variant=${upsellVariant}`,
    );
    return;
  }

  const unitPrice = Math.round(Number(line.price ?? 0) * 100);
  const quantity = Number(line.quantity ?? 1);
  const linePrice = unitPrice * quantity;
  const discountAmount = Math.round(
    (line.total_discount_set?.shop_money?.amount
      ? Number(line.total_discount_set.shop_money.amount)
      : Number(line.total_discount ?? 0)) * 100,
  );

  try {
    await prisma.upsellConversion.create({
      data: {
        shop,
        shopifyOrderId: String(payload.id),
        orderName: payload.name ?? null,
        source,
        variantId: String(upsellVariant),
        productTitle: line.title ?? line.name ?? null,
        quantity,
        linePrice,
        discountAmount,
        customerEmail: payload.email ?? payload.contact_email ?? null,
      },
    });
    console.log(
      `${tag}[upsell] recorded source=${source} variant=${upsellVariant} order=${payload.name}`,
    );
  } catch (err) {
    // Unique (shop, shopifyOrderId) violation = webhook replay. Safe to ignore.
    if (err?.code === "P2002") return;
    console.error(`${tag}[upsell] insert failed`, err);
  }
}
