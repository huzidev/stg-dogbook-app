/** @jsxImportSource preact */
/* eslint-disable no-undef, react/no-unknown-property */
// Order status / customer account upsell.
// Design: docs/post-purchase-design-lovable/src/routes/tracking.tsx
//
// Note: Shopify does not let a customer-side extension amend a placed order.
// Clicking "Add to my order" opens a cart permalink in the storefront with
// the variant + _upsell_source=order-status attribute. The Rust Discount
// Function then applies the % off on that new checkout.

import "@shopify/ui-extensions/preact";
import { render } from "preact";
import { useEffect, useState } from "preact/hooks";

import { UPSELL_SOURCE_KEY } from "../../_shared/tokens.js";
import {
  APP_URL,
  fetchOffers,
  formatMoney,
} from "../../_shared/useOffers.js";

const UPSELL_SOURCE_ORDER = "order-status";
const OFFER_SECONDS = 24 * 3600;
const COVER_WIDTH = "90px";
const COVER_HEIGHT = "118px";
// Lay out as a single row up to this count; beyond, wrap into a 2-column grid.
// Avoids the s-scroll-box carousel entirely — Shopify's customer-account
// runtime hides the real scroll container inside shadow DOM, which makes
// arrow-driven scrolling unreliable.
const ROW_MAX = 4;

export default async () => {
  render(<Extension />, document.body);
};

function Extension() {
  const [order, setOrder] = useState(
    () => shopify.order?.value ?? shopify.order ?? null,
  );
  const [shopInfo, setShopInfo] = useState(
    () => shopify.shop?.value ?? shopify.shop ?? {},
  );
  useEffect(() => shopify.order?.subscribe?.((n) => setOrder(n ?? null)), []);
  useEffect(() => shopify.shop?.subscribe?.((n) => setShopInfo(n ?? {})), []);

  const [offers, setOffers] = useState([]);
  const [discountPercent, setDiscountPercent] = useState(20);
  const [loading, setLoading] = useState(true);
  const [added, setAdded] = useState(null);
  const [secondsLeft, setSecondsLeft] = useState(OFFER_SECONDS);

  const myshopifyDomain = shopInfo?.myshopifyDomain;
  const purchasedLines = order?.lineItems ?? [];

  useEffect(() => {
    if (!myshopifyDomain || !order) return;
    let cancelled = false;
    // eslint-disable-next-line no-console
    console.log("[upsell] raw lineItems sample:", purchasedLines[0]);
    const purchasedProductIds = purchasedLines
      .map((li) => li.productId ?? li.merchandise?.product?.id ?? li.product?.id)
      .filter(Boolean)
      .map(String);
    const purchasedVariantGids = purchasedLines
      .map((li) => li.variantId ?? li.merchandise?.id ?? li.variant?.id)
      .filter(Boolean);
    (async () => {
      const result = await fetchOffers(APP_URL, {
        shopDomain: myshopifyDomain,
        productIds: purchasedProductIds,
      });
      if (cancelled) return;
      const purchasedVariantNumeric = new Set(
        purchasedVariantGids.map((g) => String(g).split("/").pop()),
      );
      const purchasedProductNumeric = new Set(
        purchasedProductIds.map((p) => String(p).split("/").pop()),
      );
      const filtered = (result.offers ?? []).filter((o) => {
        const vId = String(o.variantId ?? "").split("/").pop();
        if (purchasedVariantNumeric.has(vId)) return false;
        if (o.productId == null) return true;
        const pId = String(o.productId).split("/").pop();
        return !purchasedProductNumeric.has(pId);
      });
      // eslint-disable-next-line no-console
      console.log("[upsell] offers:", result.offers?.length, "purchased variants:", [...purchasedVariantNumeric], "purchased products:", [...purchasedProductNumeric], "→ filtered:", filtered.length);
      setOffers(filtered);
      setDiscountPercent(result.discountPercent);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [myshopifyDomain, order?.id]);

  useEffect(() => {
    const deadline = Date.now() + secondsLeft * 1000;
    const tick = setInterval(() => {
      const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setSecondsLeft(left);
    }, 1000);
    return () => clearInterval(tick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading || !offers.length) return null;

  const useGrid = offers.length > ROW_MAX;
  const gridTemplate = useGrid
    ? "repeat(2, minmax(0, 1fr))"
    : `repeat(${offers.length}, minmax(0, 1fr))`;

  const addToOrder = (offer) => {
    const variantId = String(offer.variantId).split("/").pop();
    const url = `https://${myshopifyDomain}/cart/${variantId}:1?attributes%5B${UPSELL_SOURCE_KEY}%5D=${UPSELL_SOURCE_ORDER}&attributes%5B_upsell_variant%5D=${variantId}&note=bundle_with_${encodeURIComponent(order?.name ?? "")}`;
    try {
      if (shopify.navigation?.navigate) shopify.navigation.navigate(url);
      else window.top.location.href = url;
    } catch {
      window.top.location.href = url;
    }
    setAdded(offer.productTitle);
  };

  if (added) {
    return (
      <s-box
        padding="base"
        border="base"
        borderRadius="base"
        style={{ backgroundColor: "rgba(44, 109, 62, 0.05)" }}
      >
        <s-stack direction="block" gap="base" alignInline="center">
          <s-icon type="checkmark" size="large" tone="success" />
          <s-heading>Added to your order</s-heading>
          <s-paragraph>
            Your {added} book ships with your {firstTitle(purchasedLines)} —
            $0 extra shipping.
          </s-paragraph>
        </s-stack>
      </s-box>
    );
  }

  return (
    <s-box
      padding="base"
      border="base"
      borderRadius="base"
      background="subdued"
    >
      <s-stack direction="block" gap="base">
        <s-heading>{discountPercent}% off any book you add</s-heading>

        <s-paragraph>
          Order in the next{" "}
          <s-text type="strong" tone="success">
            {formatHHMMSS(secondsLeft)}
          </s-text>{" "}
          to get {discountPercent}% off.
        </s-paragraph>

        <s-stack direction="inline" gap="small-100">
          <s-badge tone="success">−{discountPercent}%</s-badge>
          <s-badge>$0 EXTRA SHIPPING</s-badge>
        </s-stack>

        <s-grid gridTemplateColumns={gridTemplate} gap="small-100">
          {offers.map((o, i) => {
            const compareAt = o.compareAtPrice ?? o.price;
            const discounted = computeDiscounted(
              o.price ?? compareAt,
              discountPercent,
            );
            const showCompare =
              compareAt && Number(compareAt) !== Number(discounted);
            return (
              <s-box
                key={o.variantGid}
                padding="small-100"
                border="base"
                borderRadius="base"
                background="base"
              >
                <s-stack direction="block" gap="small-200" alignInline="center">
                  <s-box inlineSize={COVER_WIDTH} blockSize={COVER_HEIGHT}>
                    {o.imageUrl ? (
                      <s-image
                        src={o.imageUrl}
                        alt={o.productTitle}
                        inlineSize="fill"
                        blockSize="fill"
                        objectFit="cover"
                      />
                    ) : (
                      <s-box
                        inlineSize="fill"
                        blockSize="fill"
                        background="subdued"
                      >
                        <s-text type="small">
                          {String(i + 1).padStart(2, "0")}
                        </s-text>
                      </s-box>
                    )}
                  </s-box>
                  <s-text type="strong">{o.productTitle}</s-text>
                  <s-stack direction="inline" gap="small-100" alignItems="center">
                    {showCompare && (
                      <s-text
                        type="small"
                        tone="subdued"
                        text-decoration-line="line-through"
                      >
                        {formatMoney(compareAt)}
                      </s-text>
                    )}
                    <s-text type="strong">{formatMoney(discounted)}</s-text>
                  </s-stack>
                  <s-button
                    variant="primary"
                    onclick={() => addToOrder(o)}
                    accessibility-label={`Add ${o.productTitle} to my order`}
                  >
                    Add
                  </s-button>
                </s-stack>
              </s-box>
            );
          })}
        </s-grid>

        <s-stack
          direction="inline"
          gap="small-100"
          alignInline="center"
          alignItems="center"
        >
          <s-icon type="lock" size="small" />
          <s-text type="small" tone="neutral">
            One click · no card details
          </s-text>
        </s-stack>
      </s-stack>
    </s-box>
  );
}

function computeDiscounted(price, discountPercent) {
  const n = Number(price);
  if (!Number.isFinite(n)) return price;
  return (n * (1 - discountPercent / 100)).toFixed(2);
}

function formatHHMMSS(secondsLeft) {
  const s = Math.max(0, Math.floor(secondsLeft));
  const hh = String(Math.floor(s / 3600)).padStart(2, "0");
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function firstTitle(lines) {
  const first = lines?.[0];
  return first?.title ?? first?.merchandise?.product?.title ?? "order";
}
