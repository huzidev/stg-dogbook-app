import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const action = async ({ request }) => {
  const { topic, shop, payload } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  if (topic !== "ORDERS_PAID") return new Response("ignored", { status: 200 });

  const attr = payload?.note_attributes?.find((a) => a.name === "wholesale_order_id");
  if (!attr?.value) return new Response("no wholesale attribute", { status: 200 });

  await prisma.wholesaleOrder.updateMany({
    where: { id: attr.value, isPaid: false },
    data: {
      isPaid: true,
      shopifyOrderId: String(payload.id),
      shopifyOrderName: payload.name ?? null,
      paidAt: new Date(payload.processed_at ?? payload.updated_at ?? Date.now()),
    },
  });

  return new Response("ok", { status: 200 });
};
