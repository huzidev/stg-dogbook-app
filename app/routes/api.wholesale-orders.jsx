import { data } from "react-router";
import prisma from "../db.server.js";
import { corsHeaders, preflight } from "../lib/cors.server.js";
import { validateIntake, toPrismaCreate } from "../lib/wholesale-intake.server.js";
import { buildCheckoutUrl } from "../lib/shopify-checkout.server.js";

export const loader = ({ request }) => {
  if (request.method === "OPTIONS") return preflight(request);
  return data({ error: "Method not allowed" }, { status: 405, headers: corsHeaders(request) });
};

export async function action({ request }) {
  if (request.method === "OPTIONS") return preflight(request);
  if (request.method !== "POST") {
    return data({ error: "Method not allowed" }, { status: 405, headers: corsHeaders(request) });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return data({ error: "Invalid JSON" }, { status: 400, headers: corsHeaders(request) });
  }

  const errors = validateIntake(body);
  if (errors) {
    return data({ error: "Invalid payload", fields: errors }, { status: 400, headers: corsHeaders(request) });
  }

  const expectedTotalCents = body.lines.reduce((s, l) => s + Math.round(l.price * 100) * l.count, 0);
  if (expectedTotalCents !== Math.round(body.totals.price * 100)) {
    console.warn(`[wholesale] totals mismatch: expected ${expectedTotalCents} cents, got ${Math.round(body.totals.price * 100)}`);
  }

  let order;
  try {
    order = await prisma.wholesaleOrder.create({ data: toPrismaCreate(body) });
  } catch (err) {
    console.error("[wholesale] create failed", err);
    return data({ error: "Internal error" }, { status: 500, headers: corsHeaders(request) });
  }

  const checkout_url = buildCheckoutUrl(order, body.lines);
  return data({ order_id: order.id, checkout_url }, { status: 200, headers: corsHeaders(request) });
}
