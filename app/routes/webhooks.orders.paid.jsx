import { authenticate } from "../shopify.server";
import prisma from "../db.server";

const tag = "[wholesale-webhook]";

export const action = async ({ request }) => {
  const { topic, shop, payload } = await authenticate.webhook(request);
  console.log(`${tag} received topic=${topic} shop=${shop} shopify_order_id=${payload?.id} name=${payload?.name}`);

  if (topic !== "ORDERS_PAID") {
    console.log(`${tag} ignored: wrong topic`);
    return new Response("ignored", { status: 200 });
  }

  const attr = payload?.note_attributes?.find((a) => a.name === "wholesale_order_id");
  if (!attr?.value) {
    console.log(`${tag} no wholesale_order_id attribute — not our order`);
    return new Response("no wholesale attribute", { status: 200 });
  }

  const result = await prisma.wholesaleOrder.updateMany({
    where: { id: attr.value, isPaid: false },
    data: {
      isPaid: true,
      shopifyOrderId: String(payload.id),
      shopifyOrderName: payload.name ?? null,
      paidAt: new Date(payload.processed_at ?? payload.updated_at ?? Date.now()),
    },
  });

  if (result.count === 0) {
    console.warn(`${tag} no match for wholesale_order_id=${attr.value} (already paid or missing)`);
  } else {
    console.log(`${tag} marked paid: wholesale_order_id=${attr.value} shopify_order=${payload.name}`);
  }

  return new Response("ok", { status: 200 });
};
