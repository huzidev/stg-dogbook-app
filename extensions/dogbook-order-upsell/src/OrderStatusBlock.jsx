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
import { useEffect, useRef, useState } from "preact/hooks";

import { UPSELL_SOURCE_KEY } from "../../_shared/tokens.js";
import {
  APP_URL,
  fetchOffers,
  filterNotInCart,
  formatMoney,
} from "../../_shared/useOffers.js";

const UPSELL_SOURCE_ORDER = "order-status";
const OFFER_SECONDS = 24 * 3600;
const TILE_WIDTH = "126px";
const COVER_WIDTH = "90px";
const COVER_HEIGHT = "118px";

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
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [added, setAdded] = useState(null);
  const [secondsLeft, setSecondsLeft] = useState(OFFER_SECONDS);
  const tileRefs = useRef([]);

  const myshopifyDomain = shopInfo?.myshopifyDomain;
  const purchasedLines = order?.lineItems ?? [];

  useEffect(() => {
    if (!myshopifyDomain || !order) return;
    let cancelled = false;
    const purchasedProductIds = purchasedLines
      .map((li) => li.productId ?? li.merchandise?.product?.id)
      .filter(Boolean)
      .map(String);
    const purchasedVariantGids = purchasedLines
      .map((li) => li.variantId ?? li.merchandise?.id)
      .filter(Boolean);
    (async () => {
      const result = await fetchOffers(APP_URL, {
        shopDomain: myshopifyDomain,
        productIds: purchasedProductIds,
      });
      if (cancelled) return;
      const filtered = filterNotInCart(result.offers, purchasedVariantGids);
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

  useEffect(() => {
    tileRefs.current[selectedIdx]?.scrollIntoView?.({
      behavior: "smooth",
      inline: "center",
      block: "nearest",
    });
  }, [selectedIdx]);

  if (loading || !offers.length) return null;

  const selected = offers[selectedIdx];
  const compareAt = selected.compareAtPrice ?? selected.price;
  const discounted = computeDiscounted(
    selected.price ?? compareAt,
    discountPercent,
  );
  const atFirst = selectedIdx === 0;
  const atLast = selectedIdx === offers.length - 1;

  const addToOrder = () => {
    const variantId = String(selected.variantId).split("/").pop();
    const url = `https://${myshopifyDomain}/cart/${variantId}:1?attributes%5B${UPSELL_SOURCE_KEY}%5D=${UPSELL_SOURCE_ORDER}&note=bundle_with_${encodeURIComponent(order?.name ?? "")}`;
    try {
      if (shopify.navigation?.navigate) shopify.navigation.navigate(url);
      else window.top.location.href = url;
    } catch {
      window.top.location.href = url;
    }
    setAdded(selected.productTitle);
  };

  if (added) {
    return (
      <s-box padding="base" border="base" borderRadius="base" background="subdued">
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
    <s-box padding="base" border="base" borderRadius="base" background="subdued">
      <s-stack direction="block" gap="base">
        <s-heading>Add a book, save {discountPercent}% off your next order</s-heading>

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

        <s-scroll-box overflow="auto hidden">
          <s-grid
            gridTemplateColumns={`repeat(${offers.length}, ${TILE_WIDTH})`}
            gap="small-100"
          >
            {offers.map((o, i) => {
              const isSelected = i === selectedIdx;
              return (
                <s-box
                  key={o.variantGid}
                  ref={(el) => {
                    tileRefs.current[i] = el;
                  }}
                  padding="small-100"
                  border="base"
                  borderRadius="base"
                  background={isSelected ? "subdued" : "base"}
                >
                  <s-stack direction="block" gap="small-200" alignInline="center">
                    <s-clickable
                      onclick={() => setSelectedIdx(i)}
                      accessibility-label={o.productTitle}
                    >
                      <s-stack
                        direction="block"
                        gap="small-200"
                        alignInline="center"
                      >
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
                        <s-text
                          type="strong"
                          tone={isSelected ? "success" : undefined}
                        >
                          {o.productTitle}
                        </s-text>
                      </s-stack>
                    </s-clickable>
                  </s-stack>
                </s-box>
              );
            })}
          </s-grid>
        </s-scroll-box>

        <s-stack
          direction="inline"
          gap="base"
          alignItems="center"
          justifyContent="space-between"
        >
          <s-text type="small" tone="neutral">
            All breeds available — scroll to see more →
          </s-text>
          <s-stack direction="inline" gap="small-100" alignItems="center">
            <s-text type="small" tone="neutral">
              {selectedIdx + 1} / {offers.length}
            </s-text>
            <s-button
              variant="secondary"
              size="small"
              onclick={() => !atFirst && setSelectedIdx((i) => i - 1)}
              disabled={atFirst || undefined}
              accessibility-label="Previous breed"
            >
              ←
            </s-button>
            <s-button
              variant="secondary"
              size="small"
              onclick={() => !atLast && setSelectedIdx((i) => i + 1)}
              disabled={atLast || undefined}
              accessibility-label="Next breed"
            >
              →
            </s-button>
          </s-stack>
        </s-stack>

        <s-divider />

        <s-grid gridTemplateColumns="auto 1fr auto" gap="base" alignItems="center">
          <s-product-thumbnail
            src={selected.imageUrl}
            alt={selected.productTitle}
            size="base"
          />
          <s-stack direction="block" gap="small-200">
            <s-text type="strong">{selected.productTitle}</s-text>
            <s-stack direction="inline" gap="small-100">
              {compareAt && Number(compareAt) !== Number(discounted) && (
                <s-text type="small" tone="neutral">
                  {formatMoney(compareAt)}
                </s-text>
              )}
              <s-text type="strong">{formatMoney(discounted)}</s-text>
            </s-stack>
          </s-stack>
          <s-button
            variant="primary"
            onclick={addToOrder}
            accessibility-label={`Add ${selected.productTitle} to my order`}
          >
            Add to my order
          </s-button>
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
