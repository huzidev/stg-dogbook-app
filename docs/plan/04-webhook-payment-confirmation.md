# 04 — Payment confirmation via `orders/paid` webhook

## Goal
When Shopify tells us an order got paid, find our `WholesaleOrder` and set `isPaid=true`.

## Subscription
Register the webhook in `shopify.app.toml`:
```toml
[[webhooks.subscriptions]]
topics = ["orders/paid"]
uri = "/webhooks/orders/paid"
```

Shopify template already wires up webhook HMAC verification via `authenticate.webhook(request)` from `@shopify/shopify-app-react-router`. We reuse it — no need to hand-verify signatures.

## Route
`app/routes/webhooks.orders.paid.jsx`:

```js
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export async function action({ request }) {
  const { topic, shop, payload } = await authenticate.webhook(request);
  if (topic !== "ORDERS_PAID") return new Response("ignored", { status: 200 });

  // note_attributes: [{ name: "wholesale_order_id", value: "clx..." }, ...]
  const attr = payload.note_attributes?.find((a) => a.name === "wholesale_order_id");
  if (!attr) return new Response("no wholesale attribute", { status: 200 });

  await prisma.wholesaleOrder.updateMany({
    where: { id: attr.value, isPaid: false },
    data: {
      isPaid: true,
      shopifyOrderId: String(payload.id),
      shopifyOrderName: payload.name,
      paidAt: new Date(payload.processed_at ?? payload.updated_at ?? Date.now()),
    },
  });

  return new Response("ok", { status: 200 });
}
```

Notes:
- `updateMany` with `where: { id, isPaid: false }` makes the webhook **idempotent** — Shopify retries on 5xx; a re-delivered event is a no-op.
- If the attribute is missing (someone paid without going through our flow), we return 200 so Shopify doesn't retry forever.
- Always 200 on non-fatal cases; 500 only on real DB errors, which triggers Shopify's retry.

## Local testing
Shopify CLI (`shopify app dev`) already forwards webhooks to localhost. No extra tunneling needed.

## Skipped, add when
- Handling `orders/cancelled` or `refunds/create` to flip `isPaid` back — skip, add when we actually care about refunds in this table.
- Email/notification on payment — skip until asked.
- Backfill for orders that predate the webhook — not needed for a new feature.
