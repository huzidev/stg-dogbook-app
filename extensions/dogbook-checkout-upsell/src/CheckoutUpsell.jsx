/** @jsxImportSource preact */
/* eslint-disable no-undef, react/no-unknown-property */
// Checkout UI extension, 2025-10 API.
// Closest possible match to the Lovable / design mock.

import "@shopify/ui-extensions/preact";
import { render } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";

import {
  UPSELL_SOURCE_KEY,
  UPSELL_SOURCE_CHECKOUT,
} from "../../_shared/tokens.js";
import {
  APP_URL,
  fetchOffers,
  filterNotInCart,
  formatMoney,
} from "../../_shared/useOffers.js";

const TILE_WIDTH = "118px";
const COVER_WIDTH = "80px";
const COVER_HEIGHT = "100px";

export default function () {
  render(<Extension />, document.body);
}

function Extension() {
  const [lines, setLines] = useState(() => shopify.lines.value ?? []);
  const [shopInfo, setShopInfo] = useState(
    () => shopify.shop?.value ?? shopify.shop ?? {},
  );

  useEffect(() => shopify.lines?.subscribe?.((n) => setLines(n ?? [])), []);
  useEffect(() => shopify.shop?.subscribe?.((n) => setShopInfo(n ?? {})), []);

  const myshopifyDomain = shopInfo?.myshopifyDomain;

  const [loading, setLoading] = useState(true);
  const [offers, setOffers] = useState([]);
  const [discountPercent, setDiscountPercent] = useState(20);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [added, setAdded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const cartVariantGids = lines.map((l) => l.merchandise?.id).filter(Boolean);
  const tileRefs = useRef([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await fetchOffers(APP_URL, {
          shopDomain: myshopifyDomain,
        });
        if (cancelled) return;
        const filtered = filterNotInCart(result.offers, cartVariantGids);
        setOffers(filtered);
        setDiscountPercent(result.discountPercent);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [myshopifyDomain, lines.length]);

  if (loading || !offers.length) return null;

  const selected = offers[selectedIdx];
  const compareAt = selected.compareAtPrice ?? selected.price;
  const discounted = computeDiscounted(
    selected.price ?? compareAt,
    discountPercent,
  );

  const addOffer = async (offer) => {
    setSubmitting(true);
    setError(null);
    try {
      const result = await shopify.applyCartLinesChange({
        type: "addCartLine",
        merchandiseId: offer.variantGid,
        quantity: 1,
        attributes: [
          { key: UPSELL_SOURCE_KEY, value: UPSELL_SOURCE_CHECKOUT },
        ],
      });
      if (result?.type === "error") {
        setError(result.message || "Could not add this book.");
        setSubmitting(false);
        return;
      }
      setAdded(true);
    } catch {
      setError("Could not add this book.");
      setSubmitting(false);
    }
  };

  const add = () => addOffer(selected);

  const atFirst = selectedIdx === 0;
  const atLast = selectedIdx === offers.length - 1;

  useEffect(() => {
    const el = tileRefs.current[selectedIdx];
    el?.scrollIntoView?.({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [selectedIdx]);

  const goPrev = () => {
    if (atFirst) return;
    setSelectedIdx((i) => i - 1);
  };

  const goNext = () => {
    if (atLast) return;
    setSelectedIdx((i) => i + 1);
  };

  if (added) {
    return (
      <s-box
        padding="base"
        border="base"
        borderRadius="base"
        background="subdued"
      >
        <s-stack direction="block" gap="small-100">
          <s-heading>Added to your order</s-heading>
          <s-paragraph>
            Your {selected.productTitle} ships with your order — $0 extra
            shipping.
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
        {/* Heading */}
        <s-heading>
          Add a book, save {discountPercent}% off your next order
        </s-heading>

        {/* Badges – solid success + outline-style */}
        <s-stack direction="inline" gap="small-100">
          <s-badge tone="success">−{discountPercent}%</s-badge>
          <s-badge> $0 EXTRA SHIPPING</s-badge>
        </s-stack>

        {/* Horizontal carousel */}
        <s-scroll-box overflow="hidden auto">
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
                  <s-stack
                    direction="block"
                    gap="none"
                    alignInline="center"
                  >
                    <s-clickable
                      onclick={() => setSelectedIdx(i)}
                      accessibility-label={o.productTitle}
                    >
                      <s-stack
                        direction="block"
                        gap="small-200"
                        alignInline="center"
                      >
                        <s-box
                          inlineSize={COVER_WIDTH}
                          blockSize={COVER_HEIGHT}
                        >
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

                        <s-box minBlockSize="28px">
                          <s-text
                            type="small"
                            tone={isSelected ? "success" : undefined}
                          >
                            {o.productTitle}
                          </s-text>
                        </s-box>
                      </s-stack>
                    </s-clickable>

                    <s-clickable
                      onclick={() => addOffer(o)}
                      accessibility-label={`Add ${o.productTitle}`}
                    >
                      <s-box
                        padding="small-100"
                        background="strong"
                        borderRadius="base"
                        inlineSize="fill"
                      >
                        <s-stack
                          direction="inline"
                          alignInline="center"
                          alignItems="center"
                        >
                          <s-text type="strong" tone="inverse">
                            + ADD
                          </s-text>
                        </s-stack>
                      </s-box>
                    </s-clickable>
                  </s-stack>
                </s-box>
              );
            })}
          </s-grid>
        </s-scroll-box>

        {/* Swipe hint + counter + arrows */}
        <s-stack
          direction="inline"
          gap="base"
          alignItems="center"
          justifyContent="space-between"
        >
          <s-text type="small" tone="neutral">
            Swipe →
          </s-text>

          <s-stack direction="inline" gap="small-100" alignItems="center">
            <s-text type="small" tone="neutral">
              {selectedIdx + 1} / {offers.length}
            </s-text>

            <s-button
              variant="secondary"
              size="small"
              onclick={goPrev}
              disabled={atFirst || undefined}
              accessibility-label="Previous book"
            >
              ←
            </s-button>
            <s-button
              variant="secondary"
              size="small"
              onclick={goNext}
              disabled={atLast || undefined}
              accessibility-label="Next book"
            >
              →
            </s-button>
          </s-stack>
        </s-stack>

        <s-divider />

        {/* Selected product + ADD */}
        <s-grid
          gridTemplateColumns="auto 1fr auto"
          gap="base"
          alignItems="center"
        >
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
            onclick={add}
            loading={submitting || undefined}
            accessibility-label={`Add ${selected.productTitle}`}
          >
            ADD
          </s-button>
        </s-grid>

        {error && (
          <s-text type="small" tone="critical">
            {error}
          </s-text>
        )}

        {/* Footer */}
        <s-stack
          direction="inline"
          gap="small-100"
          alignInline="center"
          alignItems="center"
        >
          <s-icon type="lock" size="small" />
          <s-text type="small" tone="neutral">
            One click · ships together · no card details
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