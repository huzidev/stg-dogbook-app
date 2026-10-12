/** @jsxImportSource preact */
/* eslint-disable no-undef, react/no-unknown-property */
// Checkout UI extension, 2025-10 API.
// Layout mirrors docs/post-purchase/03-checkout-cross-sell.md as closely as
// Shopify's Polaris checkout web components allow (fixed component library,
// no arbitrary CSS).

import "@shopify/ui-extensions/preact";
import { render } from "preact";
import { useEffect, useState } from "preact/hooks";

import {
  COLORS,
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

export default function () {
  render(<Extension />, document.body);
}

function Extension() {
  const [lines, setLines] = useState(() => shopify.lines.value ?? []);
  const [shopInfo, setShopInfo] = useState(() => shopify.shop?.value ?? shopify.shop ?? {});

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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await fetchOffers(APP_URL, { shopDomain: myshopifyDomain });
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

  // ponytail: silent fallback instead of a debug stack; nothing to show = nothing rendered
  if (loading || !offers.length) return null;

  const selected = offers[selectedIdx];
  const compareAt = selected.compareAtPrice ?? selected.price;
  const discounted = computeDiscounted(selected.price ?? compareAt, discountPercent);

  const add = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const result = await shopify.applyCartLinesChange({
        type: "addCartLine",
        merchandiseId: selected.variantGid,
        quantity: 1,
        attributes: [{ key: UPSELL_SOURCE_KEY, value: UPSELL_SOURCE_CHECKOUT }],
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

  if (added) return <AddedPanel breed={selected.productTitle} />;

  const canPrev = selectedIdx > 0;
  const canNext = selectedIdx < offers.length - 1;

  return (
    <s-stack
      direction="block"
      gap="base"
      padding="base"
      border="base"
      background={COLORS.accentTint}
    >
      <s-heading size="large-100">
        Add a book, save {discountPercent}% off your next order
      </s-heading>

      <s-stack direction="inline" gap="small-100">
        <s-badge size="small">−{discountPercent}%</s-badge>
        <s-badge size="small" tone="neutral">$0 EXTRA SHIPPING</s-badge>
      </s-stack>

      <s-scroll-box overflow="auto hidden">
        <s-stack direction="inline" gap="small-100">
          {offers.map((o, i) => (
            <s-clickable
              key={o.variantId}
              onclick={() => setSelectedIdx(i)}
              accessibility-label={o.productTitle}
            >
              <s-box
                minInlineSize={TILE_WIDTH}
                maxInlineSize={TILE_WIDTH}
                padding="small-100"
                border="base"
                background={i === selectedIdx ? COLORS.accentTint : COLORS.card}
              >
                <s-stack direction="block" gap="small-100" alignInline="center">
                  {o.imageUrl ? (
                    <s-image source={o.imageUrl} alt={o.productTitle} />
                  ) : (
                    <s-box
                      padding="small-100"
                      background={COLORS.secondary}
                      minBlockSize="80px"
                    >
                      <s-text type="small" tone="neutral">
                        {String(i + 1).padStart(2, "0")}
                      </s-text>
                    </s-box>
                  )}
                  <s-text type="small">{o.productTitle}</s-text>
                </s-stack>
              </s-box>
            </s-clickable>
          ))}
        </s-stack>
      </s-scroll-box>

      <s-grid gridTemplateColumns="1fr auto" gap="base" alignItems="center">
        <s-text type="small" tone="neutral">Swipe →</s-text>
        <s-stack direction="inline" gap="small-100" alignItems="center">
          <s-text type="small" tone="neutral">
            {selectedIdx + 1} / {offers.length}
          </s-text>
          <s-button
            variant="secondary"
            onclick={() => canPrev && setSelectedIdx(selectedIdx - 1)}
            disabled={!canPrev || undefined}
            accessibility-label="Previous breed"
            icon="arrow-left"
          />
          <s-button
            variant="secondary"
            onclick={() => canNext && setSelectedIdx(selectedIdx + 1)}
            disabled={!canNext || undefined}
            accessibility-label="Next breed"
            icon="arrow-right"
          />
        </s-stack>
      </s-grid>

      <s-divider />

      <s-grid gridTemplateColumns="auto 1fr auto" gap="base" alignItems="center">
        {selected.imageUrl ? (
          <s-product-thumbnail
            src={selected.imageUrl}
            alt={selected.productTitle}
            size="base"
          />
        ) : (
          <s-box />
        )}
        <s-stack direction="block" gap="small-200">
          <s-text type="strong">{selected.productTitle}</s-text>
          <s-stack direction="inline" gap="small-100">
            {compareAt && Number(compareAt) !== Number(discounted) && (
              <s-text type="small" tone="neutral">{formatMoney(compareAt)}</s-text>
            )}
            <s-text type="strong">{formatMoney(discounted)}</s-text>
          </s-stack>
        </s-stack>
        <s-button
          variant="primary"
          onclick={add}
          loading={submitting || undefined}
          accessibility-label={`Add ${selected.productTitle}`}
        >ADD</s-button>
      </s-grid>

      {error && <s-text type="small" tone="critical">{error}</s-text>}

      <s-stack direction="inline" gap="small-100" alignInline="center" alignItems="center">
        <s-icon type="lock" size="small" />
        <s-text type="small" tone="neutral">
          One click · ships together · no card details
        </s-text>
      </s-stack>
    </s-stack>
  );
}

function AddedPanel({ breed }) {
  return (
    <s-stack
      direction="block"
      gap="base"
      padding="base"
      border="base"
      background={COLORS.accentTint}
      alignInline="center"
    >
      <s-icon type="check-circle" size="large" />
      <s-heading size="large-100">Added to your order</s-heading>
      <s-text type="small" tone="neutral">
        Your {breed} ships with your order — $0 extra shipping.
      </s-text>
    </s-stack>
  );
}

function computeDiscounted(price, discountPercent) {
  const n = Number(price);
  if (!Number.isFinite(n)) return price;
  return (n * (1 - discountPercent / 100)).toFixed(2);
}
