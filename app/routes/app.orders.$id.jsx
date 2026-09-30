import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request, params }) => {
  await authenticate.admin(request);

  const order = await prisma.wholesaleOrder.findUnique({
    where: { id: params.id },
    include: { items: true },
  });

  if (!order) {
    throw new Response("Order not found", { status: 404 });
  }

  return {
    shopDomain: process.env.SHOPIFY_SHOP_DOMAIN ?? "",
    order: {
      ...order,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
      paidAt: order.paidAt ? order.paidAt.toISOString() : null,
    },
  };
};

const money = (cents, currency) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD" }).format(cents / 100);

const fullDate = (iso) =>
  new Date(iso).toLocaleString("en-US", { dateStyle: "long", timeStyle: "short" });

const adminOrderUrl = (shopDomain, orderId) =>
  shopDomain && orderId ? `https://${shopDomain}/admin/orders/${orderId}` : null;

export default function OrderDetail() {
  const { order, shopDomain } = useLoaderData();
  const adminUrl = adminOrderUrl(shopDomain, order.shopifyOrderId);

  return (
    <s-page heading={`Wholesale order — ${order.shopName}`} backAction={{ content: "Wholesale orders", url: "/app" }}>
      <s-section heading="Status">
        <s-stack direction="inline" gap="base">
          <s-badge tone={order.isPaid ? "success" : "warning"}>
            {order.isPaid ? "Paid" : "Unpaid"}
          </s-badge>
          {adminUrl && (
            <s-link href={adminUrl} target="_blank">
              Open Shopify order {order.shopifyOrderName ?? `#${order.shopifyOrderId}`}
            </s-link>
          )}
        </s-stack>
        {order.isPaid && order.paidAt && (
          <s-paragraph>Paid on {fullDate(order.paidAt)}</s-paragraph>
        )}
        {!order.isPaid && (
          <s-paragraph>Awaiting Shopify checkout completion. This will flip to Paid once the orders/paid webhook fires.</s-paragraph>
        )}
      </s-section>

      <s-section heading="Shop details">
        <s-paragraph><strong>Shop name:</strong> {order.shopName}</s-paragraph>
        <s-paragraph><strong>Store URL:</strong> {order.storeUrl}</s-paragraph>
        <s-paragraph><strong>Sales channel:</strong> {order.channel}</s-paragraph>
        <s-paragraph><strong>Business address:</strong> {order.businessAddress}</s-paragraph>
        <s-paragraph><strong>Invoice address:</strong> {order.invoiceAddress}</s-paragraph>
      </s-section>

      <s-section heading={`Line items (${order.items.length})`}>
        <s-table>
          <s-table-header-row>
            <s-table-header>Breed</s-table-header>
            <s-table-header>Handle</s-table-header>
            <s-table-header>Qty</s-table-header>
            <s-table-header>Unit price</s-table-header>
            <s-table-header>Subtotal</s-table-header>
            <s-table-header>Variant ID</s-table-header>
          </s-table-header-row>
          <s-table-body>
            {order.items.map((i) => (
              <s-table-row key={i.id}>
                <s-table-cell>{i.name}</s-table-cell>
                <s-table-cell>{i.handle}</s-table-cell>
                <s-table-cell>{i.quantity}</s-table-cell>
                <s-table-cell>{money(i.unitPrice, order.currency)}</s-table-cell>
                <s-table-cell>{money(i.unitPrice * i.quantity, order.currency)}</s-table-cell>
                <s-table-cell>{i.variantId ?? <s-badge tone="critical">unlinked</s-badge>}</s-table-cell>
              </s-table-row>
            ))}
          </s-table-body>
        </s-table>
      </s-section>

      <s-section slot="aside" heading="Totals">
        <s-paragraph><strong>Units:</strong> {order.totalUnits}</s-paragraph>
        <s-paragraph><strong>Total:</strong> {money(order.totalAmount, order.currency)}</s-paragraph>
        <s-paragraph><strong>Currency:</strong> {order.currency}</s-paragraph>
      </s-section>

      <s-section slot="aside" heading="Meta">
        <s-paragraph><strong>Order ID:</strong> {order.id}</s-paragraph>
        <s-paragraph><strong>Created:</strong> {fullDate(order.createdAt)}</s-paragraph>
        <s-paragraph><strong>Updated:</strong> {fullDate(order.updatedAt)}</s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
