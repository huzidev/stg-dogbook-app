import { data } from "react-router";
import prisma from "../db.server.js";
import { corsHeaders, preflight } from "../lib/cors.server.js";
import { validateIntake, toPrismaCreate } from "../lib/wholesale-intake.server.js";
import { buildCheckoutUrl } from "../lib/shopify-checkout.server.js";

const tag = "[wholesale]";

export const loader = ({ request }) => {
  if (request.method === "OPTIONS") return preflight(request);
  console.log(`${tag} ${request.method} rejected (loader): 405`);
  return data({ error: "Method not allowed" }, { status: 405, headers: corsHeaders(request) });
};

export async function action({ request }) {
  const origin = request.headers.get("origin") ?? "(no origin)";
  console.log(`${tag} ${request.method} /api/wholesale-orders origin=${origin}`);

  if (request.method === "OPTIONS") {
    console.log(`${tag} preflight`);
    return preflight(request);
  }
  if (request.method !== "POST") {
    console.log(`${tag} rejected: 405`);
    return data({ error: "Method not allowed" }, { status: 405, headers: corsHeaders(request) });
  }

  let body;
  try {
    body = await request.json();
  } catch (err) {
    console.warn(`${tag} invalid JSON: ${err?.message}`);
    return data({ error: "Invalid JSON" }, { status: 400, headers: corsHeaders(request) });
  }

  console.log(
    `${tag} payload shop="${body?.shop_name}" channel=${body?.channel} lines=${body?.lines?.length ?? 0} totals=${JSON.stringify(body?.totals ?? null)}`,
  );

  const errors = validateIntake(body);
  if (errors) {
    console.warn(`${tag} validation failed: ${JSON.stringify(errors)}`);
    return data({ error: "Invalid payload", fields: errors }, { status: 400, headers: corsHeaders(request) });
  }

  const expectedTotalCents = body.lines.reduce((s, l) => s + Math.round(l.price * 100) * l.count, 0);
  const gotTotalCents = Math.round(body.totals.price * 100);
  if (expectedTotalCents !== gotTotalCents) {
    console.warn(`${tag} totals mismatch: expected ${expectedTotalCents} cents, got ${gotTotalCents}`);
  }

  let order;
  try {
    order = await prisma.wholesaleOrder.create({ data: toPrismaCreate(body) });
    console.log(
      `${tag} created order_id=${order.id} totalAmount=${order.totalAmount} totalUnits=${order.totalUnits} isPaid=${order.isPaid}`,
    );
  } catch (err) {
    console.error(`${tag} create failed`, err);
    return data({ error: "Internal error" }, { status: 500, headers: corsHeaders(request) });
  }

  const checkout_url = buildCheckoutUrl(order, body.lines);
  console.log(`${tag} → 200 order_id=${order.id} checkout_url=${checkout_url ? "set" : "null"}`);
  return data({ order_id: order.id, checkout_url }, { status: 200, headers: corsHeaders(request) });
}
