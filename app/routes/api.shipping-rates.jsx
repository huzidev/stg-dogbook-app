import { data } from "react-router";
import prisma from "../db.server.js";

const tag = "[shipping-rates]";

export const loader = () =>
  data({ error: "Method not allowed" }, { status: 405 });

export async function action({ request }) {
  if (request.method !== "POST") {
    return data({ error: "Method not allowed" }, { status: 405 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return data({ rates: [] }, { status: 200 });
  }

  const shop = new URL(request.url).searchParams.get("shop");
  if (!shop) {
    console.log(`${tag} missing shop query param`);
    return data({ rates: [] }, { status: 200 });
  }

  const rule = await prisma.shippingRule.findUnique({ where: { shop } });
  if (!rule || !rule.percent) {
    console.log(`${tag} no rule for shop=${shop}`);
    return data({ rates: [] }, { status: 200 });
  }

  const rate = body?.rate ?? {};

  const items = Array.isArray(rate?.items) ? rate.items : [];
  const subtotalCents = items.reduce(
    (s, it) => s + (Number(it.price) || 0) * (Number(it.quantity) || 0),
    0,
  );
  const totalCents = Math.round(subtotalCents * (rule.percent / 100));
  const currency = rate?.currency || "USD";

  console.log(
    `${tag} shop=${shop} percent=${rule.percent} subtotal=${subtotalCents} total=${totalCents}`,
  );

  return data(
    {
      rates: [
        {
          service_name: `${rule.percent}% of subtotal`,
          service_code: "PERCENT_SUBTOTAL",
          total_price: String(totalCents),
          currency,
          description: `Shipping = ${rule.percent}% of cart subtotal`,
        },
      ],
    },
    { status: 200 },
  );
}
