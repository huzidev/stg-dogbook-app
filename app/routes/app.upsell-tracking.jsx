import { useMemo } from "react";
import { Form, Link, useLoaderData, useSearchParams } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

const RANGES = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};
const DEFAULT_RANGE = "30d";
const SOURCES = ["all", "order-status", "order-confirmation"];

const money = (cents) => `$${(Number(cents || 0) / 100).toFixed(2)}`;
const pct = (num, denom) =>
  denom > 0 ? `${((num / denom) * 100).toFixed(1)}%` : "—";

const SOURCE_LABELS = {
  "order-status": "Order status",
  "order-confirmation": "Email",
  checkout: "Checkout",
  cart: "Cart",
};
const sourceLabel = (s) => SOURCE_LABELS[s] ?? s;

const AVATAR_PALETTE = [
  "#8A9CB0",
  "#B55A4C",
  "#5B6F3B",
  "#A68B5C",
  "#4F6B4F",
  "#C19A6B",
  "#6B5B95",
  "#88796A",
];
const avatarInitials = (title) =>
  (title ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("") || "?";
const avatarColor = (seed) => {
  const s = String(seed ?? "");
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length];
};

function toCsv(rows) {
  const header = [
    "order_id",
    "order_name",
    "created_at",
    "source",
    "variant_id",
    "product_title",
    "quantity",
    "line_price_cents",
    "discount_cents",
    "customer_email",
  ];
  const escape = (v) => {
    const s = v == null ? "" : String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.shopifyOrderId,
        r.orderName ?? "",
        r.createdAt.toISOString(),
        r.source,
        r.variantId,
        r.productTitle ?? "",
        r.quantity,
        r.linePrice,
        r.discountAmount,
        r.customerEmail ?? "",
      ]
        .map(escape)
        .join(","),
    );
  }
  return lines.join("\n");
}

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const rangeKey = RANGES[url.searchParams.get("range")] ? url.searchParams.get("range") : DEFAULT_RANGE;
  const sourceFilter = SOURCES.includes(url.searchParams.get("source"))
    ? url.searchParams.get("source")
    : "all";
  const days = RANGES[rangeKey];
  const since = new Date(Date.now() - days * 24 * 3600 * 1000);

  const where = {
    shop: session.shop,
    createdAt: { gte: since },
    ...(sourceFilter !== "all" ? { source: sourceFilter } : {}),
  };

  const rows = await prisma.upsellConversion.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  if (url.searchParams.get("format") === "csv") {
    const csv = toCsv(rows);
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="upsell-orders-${rangeKey}.csv"`,
      },
    });
  }

  const totalRevenue = rows.reduce((s, r) => s + r.linePrice, 0);
  const totalDiscount = rows.reduce((s, r) => s + r.discountAmount, 0);
  const totalOrders = rows.length;
  const avgDiscountPct =
    totalRevenue > 0 ? (totalDiscount / (totalRevenue + totalDiscount)) * 100 : 0;

  const byDay = new Map();
  for (let i = 0; i < days; i++) {
    const d = new Date(Date.now() - (days - 1 - i) * 24 * 3600 * 1000);
    const key = d.toISOString().slice(0, 10);
    byDay.set(key, { date: key, orderStatus: 0, email: 0, total: 0 });
  }
  for (const r of rows) {
    const key = r.createdAt.toISOString().slice(0, 10);
    const bucket = byDay.get(key);
    if (!bucket) continue;
    if (r.source === "order-status") bucket.orderStatus += r.linePrice;
    else if (r.source === "order-confirmation") bucket.email += r.linePrice;
    bucket.total += r.linePrice;
  }
  const chartData = Array.from(byDay.values());
  const chartMax = Math.max(1, ...chartData.map((d) => d.total));

  const byBook = new Map();
  for (const r of rows) {
    const key = r.productTitle ?? r.variantId;
    const prev = byBook.get(key) ?? { title: key, revenue: 0, orders: 0 };
    prev.revenue += r.linePrice;
    prev.orders += 1;
    byBook.set(key, prev);
  }
  const topBooks = Array.from(byBook.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);
  const topBooksMax = Math.max(1, ...topBooks.map((b) => b.revenue));

  const bySurface = {
    orderStatus: rows.filter((r) => r.source === "order-status").length,
    email: rows.filter((r) => r.source === "order-confirmation").length,
  };

  return {
    rangeKey,
    sourceFilter,
    totalRevenue,
    totalDiscount,
    totalOrders,
    avgDiscountPct,
    chartData,
    chartMax,
    topBooks,
    topBooksMax,
    bySurface,
    rows: rows.slice(0, 50).map((r) => ({
      id: r.id,
      shopifyOrderId: r.shopifyOrderId,
      orderName: r.orderName,
      createdAt: r.createdAt.toISOString(),
      source: r.source,
      productTitle: r.productTitle,
      quantity: r.quantity,
      linePrice: r.linePrice,
      discountAmount: r.discountAmount,
      customerEmail: r.customerEmail,
    })),
    totalRowCount: rows.length,
  };
};

export default function UpsellTracking() {
  const data = useLoaderData();
  const [params] = useSearchParams();
  const range = data.rangeKey;
  const source = data.sourceFilter;

  const exportHref = useMemo(() => {
    const u = new URLSearchParams(params);
    u.set("format", "csv");
    return `?${u.toString()}`;
  }, [params]);

  const buildRangeHref = (r) => {
    const u = new URLSearchParams(params);
    u.set("range", r);
    u.delete("format");
    return `?${u.toString()}`;
  };
  const buildSourceHref = (s) => {
    const u = new URLSearchParams(params);
    u.set("source", s);
    u.delete("format");
    return `?${u.toString()}`;
  };

  return (
    <s-page heading="Upsell tracking">
      <s-stack direction="block" gap="large-300">
        <s-stack
          direction="inline"
          gap="base"
          alignItems="center"
          justifyContent="space-between"
        >
          <s-paragraph tone="subdued">
            Every order where a customer bought a book from the upsell offer.
          </s-paragraph>
          <s-stack direction="inline" gap="small-200" alignItems="center">
            {Object.keys(RANGES).map((r) => (
              <Link key={r} to={buildRangeHref(r)} prefetch="intent">
                <s-button
                  type="button"
                  variant={range === r ? "primary" : "secondary"}
                >
                  {r === "7d" ? "Last 7 days" : r === "30d" ? "Last 30 days" : "Last 90 days"}
                </s-button>
              </Link>
            ))}
            <a href={exportHref} download>
              <s-button type="button">Export CSV</s-button>
            </a>
          </s-stack>
        </s-stack>

        {/* KPI CARDS */}
        <s-grid gridTemplateColumns="repeat(4, 1fr)" gap="base">
          <KpiCard label="Upsell revenue" value={money(data.totalRevenue)} />
          <KpiCard label="Upsell orders" value={String(data.totalOrders)} />
          <KpiCard
            label="Avg discount"
            value={
              data.totalOrders ? `${data.avgDiscountPct.toFixed(1)}%` : "—"
            }
          />
          <KpiCard label="Discount given" value={money(data.totalDiscount)} />
        </s-grid>

        {/* CHART + BY SURFACE */}
        <s-grid gridTemplateColumns="2fr 1fr" gap="large-300">
          <s-section heading="Upsell revenue over time">
            <s-stack direction="block" gap="base">
              <s-stack direction="inline" gap="base" alignItems="center">
                <LegendDot color="#4F56D1" />
                <s-text type="small">Order status page</s-text>
                <LegendDot color="#B9BCEF" />
                <s-text type="small">Confirmation email</s-text>
              </s-stack>
              {data.totalOrders === 0 ? (
                <EmptyChart message="No upsell orders in this period yet." />
              ) : (
                <BarChart data={data.chartData} max={data.chartMax} />
              )}
            </s-stack>
          </s-section>

          <s-section heading="By surface">
            <s-stack direction="block" gap="base">
              <SurfaceRow
                label="Order status page"
                count={data.bySurface.orderStatus}
                total={data.totalOrders}
                color="#4F56D1"
              />
              <SurfaceRow
                label="Confirmation email"
                count={data.bySurface.email}
                total={data.totalOrders}
                color="#B9BCEF"
              />
            </s-stack>
          </s-section>
        </s-grid>

        {/* TOP BOOKS */}
        <s-section heading="Top books">
          {data.topBooks.length === 0 ? (
            <s-paragraph tone="subdued">No upsell purchases yet.</s-paragraph>
          ) : (
            <s-stack direction="block" gap="base">
              {data.topBooks.map((b) => (
                <s-stack
                  key={b.title}
                  direction="inline"
                  gap="base"
                  alignItems="center"
                >
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 6,
                      background: avatarColor(b.title),
                      color: "white",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 600,
                      fontSize: 12,
                      flexShrink: 0,
                    }}
                  >
                    {avatarInitials(b.title)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <s-text type="strong">{b.title}</s-text>
                  </div>
                  <div style={{ width: "50%", maxWidth: 400 }}>
                    <Bar value={b.revenue} max={data.topBooksMax} color="#4F56D1" />
                  </div>
                  <div style={{ width: 80, textAlign: "right" }}>
                    <s-text type="strong">{money(b.revenue)}</s-text>
                  </div>
                </s-stack>
              ))}
            </s-stack>
          )}
        </s-section>

        {/* TABLE */}
        <s-section>
          <s-stack direction="block" gap="base">
            <s-stack
              direction="inline"
              gap="base"
              alignItems="center"
              justifyContent="space-between"
            >
              <s-stack direction="inline" gap="small-200" alignItems="center">
                {SOURCES.map((s) => (
                  <Link key={s} to={buildSourceHref(s)} prefetch="intent">
                    <s-button
                      type="button"
                      variant={source === s ? "primary" : "secondary"}
                    >
                      {s === "all" ? "All" : sourceLabel(s)}
                    </s-button>
                  </Link>
                ))}
              </s-stack>
              <s-text type="small" tone="neutral">
                Showing 1–{Math.min(data.rows.length, 50)} of{" "}
                {data.totalRowCount} upsell orders
              </s-text>
            </s-stack>

            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: 13,
                }}
              >
                <thead>
                  <tr style={{ textAlign: "left", color: "#616161" }}>
                    <Th>Order</Th>
                    <Th>Date</Th>
                    <Th>Customer</Th>
                    <Th>Book</Th>
                    <Th>Source</Th>
                    <Th style={{ textAlign: "right" }}>Discount</Th>
                    <Th style={{ textAlign: "right" }}>Revenue</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.length === 0 && (
                    <tr>
                      <td colSpan={7} style={{ padding: "16px 8px", color: "#616161" }}>
                        No upsell orders matching the filters.
                      </td>
                    </tr>
                  )}
                  {data.rows.map((r) => (
                    <tr
                      key={r.id}
                      style={{ borderTop: "1px solid #EDEDED" }}
                    >
                      <Td>
                        <s-text type="strong">
                          {r.orderName || `#${r.shopifyOrderId.slice(-6)}`}
                        </s-text>
                      </Td>
                      <Td>{new Date(r.createdAt).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}</Td>
                      <Td>{r.customerEmail || "—"}</Td>
                      <Td>
                        <s-stack direction="inline" gap="small-200" alignItems="center">
                          <div
                            style={{
                              width: 24,
                              height: 24,
                              borderRadius: 4,
                              background: avatarColor(r.productTitle),
                              color: "white",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: 10,
                              fontWeight: 600,
                              flexShrink: 0,
                            }}
                          >
                            {avatarInitials(r.productTitle)}
                          </div>
                          <s-text>
                            {r.productTitle ?? "—"}
                            {r.quantity > 1 ? ` ×${r.quantity}` : ""}
                          </s-text>
                        </s-stack>
                      </Td>
                      <Td>
                        <s-badge tone="info">{sourceLabel(r.source)}</s-badge>
                      </Td>
                      <Td style={{ textAlign: "right", color: "#B55A4C" }}>
                        {r.discountAmount
                          ? `-${money(r.discountAmount)}`
                          : "—"}
                      </Td>
                      <Td style={{ textAlign: "right" }}>
                        <s-text type="strong">{money(r.linePrice)}</s-text>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </s-stack>
        </s-section>
      </s-stack>
    </s-page>
  );
}

function Th({ children, style }) {
  return (
    <th
      style={{
        padding: "10px 8px",
        fontWeight: 600,
        fontSize: 12,
        textTransform: "uppercase",
        letterSpacing: 0.4,
        ...(style ?? {}),
      }}
    >
      {children}
    </th>
  );
}

function Td({ children, style }) {
  return (
    <td style={{ padding: "12px 8px", verticalAlign: "middle", ...(style ?? {}) }}>
      {children}
    </td>
  );
}

function KpiCard({ label, value }) {
  return (
    <s-section>
      <s-stack direction="block" gap="small-200">
        <s-text type="small" tone="neutral">
          {label}
        </s-text>
        <div style={{ fontSize: 24, fontWeight: 700 }}>{value}</div>
      </s-stack>
    </s-section>
  );
}

function LegendDot({ color }) {
  return (
    <div
      style={{
        width: 10,
        height: 10,
        borderRadius: 2,
        background: color,
        display: "inline-block",
      }}
    />
  );
}

function EmptyChart({ message }) {
  return (
    <div
      style={{
        height: 180,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#8B8B8B",
        fontSize: 13,
      }}
    >
      {message}
    </div>
  );
}

function BarChart({ data, max }) {
  const barW = 100 / data.length;
  return (
    <svg
      viewBox="0 0 100 60"
      preserveAspectRatio="none"
      style={{ width: "100%", height: 180, display: "block" }}
    >
      {data.map((d, i) => {
        const osH = (d.orderStatus / max) * 56;
        const emH = (d.email / max) * 56;
        const x = i * barW + barW * 0.15;
        const w = barW * 0.7;
        return (
          <g key={d.date}>
            <rect
              x={x}
              y={60 - osH - emH}
              width={w}
              height={osH}
              fill="#4F56D1"
            />
            <rect
              x={x}
              y={60 - emH}
              width={w}
              height={emH}
              fill="#B9BCEF"
            />
          </g>
        );
      })}
    </svg>
  );
}

function Bar({ value, max, color }) {
  const w = max > 0 ? (value / max) * 100 : 0;
  return (
    <div
      style={{
        background: "#EEF0FA",
        borderRadius: 4,
        height: 8,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          width: `${w}%`,
          height: "100%",
          background: color,
        }}
      />
    </div>
  );
}

function SurfaceRow({ label, count, total, color }) {
  return (
    <s-stack direction="block" gap="small-200">
      <s-stack
        direction="inline"
        gap="base"
        alignItems="center"
        justifyContent="space-between"
      >
        <s-text>{label}</s-text>
        <s-text type="strong">{count}</s-text>
      </s-stack>
      <Bar value={count} max={total || 1} color={color} />
      <s-text type="small" tone="neutral">
        {pct(count, total)} of upsell orders
      </s-text>
    </s-stack>
  );
}
