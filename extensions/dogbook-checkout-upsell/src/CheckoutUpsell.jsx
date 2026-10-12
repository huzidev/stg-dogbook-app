/** @jsxImportSource preact */
/* eslint-disable no-undef, react/no-unknown-property */
// Checkout UI extension, 2025-10 API.
// Pattern copied from docs/checkout-extension/PLAN.md (the earlier working
// extension in this repo).

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

export default function () {
  render(<Extension />, document.body);
}

function Extension() {
  const [lines, setLines] = useState(() => shopify.lines.value ?? []);
  const [shopInfo, setShopInfo] = useState(() => shopify.shop?.value ?? shopify.shop ?? {});

  useEffect(
    () => shopify.lines?.subscribe?.((n) => setLines(n ?? [])),
    [],
  );
  useEffect(
    () => shopify.shop?.subscribe?.((n) => setShopInfo(n ?? {})),
    [],
  );

  const myshopifyDomain = shopInfo?.myshopifyDomain;

  const [loading, setLoading] = useState(true);
  const [offers, setOffers] = useState([]);
  const [discountPercent, setDiscountPercent] = useState(20);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [added, setAdded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [debugMsg, setDebugMsg] = useState("mounted");

  const cartVariantGids = lines.map((l) => l.merchandise?.id).filter(Boolean);

  console.log("[upsell] mount", {
    myshopifyDomain,
    cartLineCount: lines.length,
    cartVariantGids,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      console.log("[upsell] fetching", { APP_URL, myshopifyDomain });
      setDebugMsg("fetching");
      try {
        const result = await fetchOffers(APP_URL, { shopDomain: myshopifyDomain });
        console.log("[upsell] fetched", result);
        if (cancelled) return;
        const filtered = filterNotInCart(result.offers, cartVariantGids);
        console.log("[upsell] filtered", {
          before: result.offers.length,
          after: filtered.length,
          cartVariantGids,
        });
        setOffers(filtered);
        setDiscountPercent(result.discountPercent);
        setDebugMsg(
          `fetched ${result.offers?.length ?? 0}, after filter ${filtered.length}`,
        );
      } catch (err) {
        console.error("[upsell] fetch threw", err);
        setDebugMsg(`fetch threw: ${err?.message ?? err}`);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [myshopifyDomain, lines.length]);

  if (loading || !offers.length) {
    return (
      <s-stack
        direction="block"
        gap="small-100"
        padding="base"
        border="base"
        background={COLORS.accentTint}
      >
        <s-text type="strong">[upsell debug] {debugMsg}</s-text>
        <s-text type="small" tone="neutral">
          cart variants: {cartVariantGids.join(", ") || "(none)"}
        </s-text>
      </s-stack>
    );
  }

  const selected = offers[selectedIdx];
  const compareAt = selected.compareAtPrice ?? selected.price;
  const discounted = computeDiscounted(
    selected.price ?? compareAt,
    discountPercent,
  );

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
    } catch (err) {
      console.error("[upsell] add failed", err);
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
        <s-text type="strong">−{discountPercent}%</s-text>
        <s-text type="strong" tone="positive">$0 EXTRA SHIPPING</s-text>
      </s-stack>

      <s-stack direction="inline" gap="small-100">
        {offers.map((o, i) => (
          <s-clickable
            key={o.variantId}
            onclick={() => setSelectedIdx(i)}
            accessibility-label={o.productTitle}
          >
            <s-stack
              direction="block"
              gap="small-100"
              padding="small-100"
              border="base"
              background={i === selectedIdx ? COLORS.accentTint : COLORS.card}
            >
              {o.imageUrl ? (
                <s-image source={o.imageUrl} alt={o.productTitle} />
              ) : (
                <s-text type="small" tone="neutral">
                  {String(i + 1).padStart(2, "0")}
                </s-text>
              )}
              <s-text type="small">{o.productTitle}</s-text>
            </s-stack>
          </s-clickable>
        ))}
      </s-stack>

      <s-stack direction="inline" gap="base">
        <s-text type="small" tone="neutral">Swipe →</s-text>
        <s-text type="small" tone="neutral">
          {selectedIdx + 1} / {offers.length}
        </s-text>
        <s-button
          variant="plain"
          onclick={() => canPrev && setSelectedIdx(selectedIdx - 1)}
          disabled={!canPrev || undefined}
          accessibility-label="Previous breed"
        >←</s-button>
        <s-button
          variant="plain"
          onclick={() => canNext && setSelectedIdx(selectedIdx + 1)}
          disabled={!canNext || undefined}
          accessibility-label="Next breed"
        >→</s-button>
      </s-stack>

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
        <s-stack gap="small-200">
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

      {error && (
        <s-text type="small" tone="critical">{error}</s-text>
      )}

      <s-text type="small" tone="neutral">
        🔒 One click · ships together · no card details
      </s-text>
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
    >
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
