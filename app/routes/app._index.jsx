import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }) => {
  await authenticate.admin(request);

  const orders = await prisma.wholesaleOrder.findMany({
    orderBy: { createdAt: "desc" },
    include: { items: true },
    take: 100,
  });

  return {
    orders: orders.map((o) => ({
      id: o.id,
      shopName: o.shopName,
      storeUrl: o.storeUrl,
      channel: o.channel,
      businessAddress: o.businessAddress,
      invoiceAddress: o.invoiceAddress,
      currency: o.currency,
      totalUnits: o.totalUnits,
      totalAmount: o.totalAmount,
      isPaid: o.isPaid,
      shopifyOrderName: o.shopifyOrderName,
      paidAt: o.paidAt ? o.paidAt.toISOString() : null,
      createdAt: o.createdAt.toISOString(),
      itemCount: o.items.length,
    })),
  };
};

const money = (cents, currency) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD" }).format(cents / 100);

const shortDate = (iso) =>
  new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });

export default function Index() {
  const { orders } = useLoaderData();
  const paidCount = orders.filter((o) => o.isPaid).length;
  const unpaidCount = orders.length - paidCount;

  return (
    <s-page heading="Wholesale orders">
      <s-section heading={`${orders.length} orders — ${paidCount} paid, ${unpaidCount} unpaid`}>
        {orders.length === 0 ? (
          <s-paragraph>No wholesale orders yet. Submissions from the storefront intake form will appear here.</s-paragraph>
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header>Created</s-table-header>
              <s-table-header>Shop</s-table-header>
              <s-table-header>Store URL</s-table-header>
              <s-table-header>Channel</s-table-header>
              <s-table-header>Units</s-table-header>
              <s-table-header>Total</s-table-header>
              <s-table-header>Paid</s-table-header>
              <s-table-header>Shopify order</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {orders.map((o) => (
                <s-table-row key={o.id}>
                  <s-table-cell>{shortDate(o.createdAt)}</s-table-cell>
                  <s-table-cell>{o.shopName}</s-table-cell>
                  <s-table-cell>{o.storeUrl}</s-table-cell>
                  <s-table-cell>{o.channel}</s-table-cell>
                  <s-table-cell>{o.totalUnits}</s-table-cell>
                  <s-table-cell>{money(o.totalAmount, o.currency)}</s-table-cell>
                  <s-table-cell>
                    <s-badge tone={o.isPaid ? "success" : "warning"}>
                      {o.isPaid ? "Paid" : "Unpaid"}
                    </s-badge>
                  </s-table-cell>
                  <s-table-cell>{o.shopifyOrderName ?? "—"}</s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
