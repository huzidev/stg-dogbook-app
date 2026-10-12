/* eslint-disable react/prop-types */
import { useEffect, useState } from "react";
import {
  reactExtension,
  BlockStack,
  Button,
  Divider,
  Heading,
  Icon,
  Image,
  InlineStack,
  Pressable,
  Text,
  View,
  useApplyCartLinesChange,
  useCartLines,
  useShop,
} from "@shopify/ui-extensions-react/checkout";

import { COLORS, UPSELL_SOURCE_KEY, UPSELL_SOURCE_CHECKOUT } from "../../_shared/tokens.js";
import {
  APP_URL,
  fetchOffers,
  filterNotInCart,
  formatMoney,
} from "../../_shared/useOffers.js";

export default reactExtension(
  "purchase.checkout.cart-line-list.render-after",
  () => <CheckoutUpsell />,
);

function CheckoutUpsell() {
  const { myshopifyDomain } = useShop();
  const cartLines = useCartLines();
  const applyCartLinesChange = useApplyCartLinesChange();
  const appUrl = APP_URL;

  const [loading, setLoading] = useState(true);
  const [offers, setOffers] = useState([]);
  const [discountPercent, setDiscountPercent] = useState(20);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [added, setAdded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [debugMsg, setDebugMsg] = useState("mounted");

  const cartVariantGids = cartLines.map((l) => l.merchandise?.id).filter(Boolean);

  console.log("[upsell] mount", {
    myshopifyDomain,
    cartLineCount: cartLines.length,
    cartVariantGids,
    appUrl,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      console.log("[upsell] fetching", { appUrl, myshopifyDomain });
      setDebugMsg("fetching");
      try {
        const result = await fetchOffers(appUrl, {
          shopDomain: myshopifyDomain,
        });
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
    // ponytail: refetch on cart change — if the shopper manually adds the
    // upsell variant via Shopify's own UI, we want to disappear.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myshopifyDomain, cartLines.length]);

  // ponytail: visible banner while debugging. Shows mount + fetch state inline
  // so we can see what step the extension is in without needing a working
  // DevTools console. Remove once the panel renders.
  if (loading || !offers.length) {
    return (
      <View border="base" cornerRadius="none" padding="base" background="#F2F7F3">
        <BlockStack spacing="tight">
          <Text emphasized>[upsell debug] {debugMsg}</Text>
          <Text size="small" appearance="subdued">
            cart variants: {cartVariantGids.join(", ") || "(none)"}
          </Text>
        </BlockStack>
      </View>
    );
  }

  const selected = offers[selectedIdx];
  const compareAt = selected.compareAtPrice ?? selected.price;
  const discounted = computeDiscounted(selected.price ?? compareAt, discountPercent);

  const add = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const result = await applyCartLinesChange({
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
      // eslint-disable-next-line no-console
      console.error("[checkout-upsell] add failed", err);
      setError("Could not add this book.");
      setSubmitting(false);
    }
  };

  if (added) {
    return <AddedPanel breed={selected.productTitle} />;
  }

  const canPrev = selectedIdx > 0;
  const canNext = selectedIdx < offers.length - 1;

  return (
    <View
      border="base"
      cornerRadius="none"
      padding="base"
      background={COLORS.accentTint}
    >
      <BlockStack spacing="tight">
        <Heading level={3}>
          Add a book, save {discountPercent}% off your next order
        </Heading>

        <InlineStack spacing="tight">
          {/* −20% pill */}
          <View padding="extraTight" background={COLORS.accent} cornerRadius="none">
            <Text size="small" emphasized appearance="monochrome">
              −{discountPercent}%
            </Text>
          </View>
          {/* $0 EXTRA SHIPPING pill */}
          <View padding="extraTight" border="base" cornerRadius="none">
            <Text size="small" emphasized appearance="success">
              $0 EXTRA SHIPPING
            </Text>
          </View>
        </InlineStack>

        {/* ponytail: no horizontal-scroll primitive. Approximate the strip as a
            wrapping InlineStack. Native touch/trackpad scroll is lost; arrows
            still change selection. Upgrade path: Shopify's ScrollView when it
            lands on this target. */}
        <InlineStack spacing="tight">
          {offers.map((o, i) => (
            <Pressable
              key={o.variantId}
              onPress={() => setSelectedIdx(i)}
              accessibilityLabel={o.productTitle}
            >
              <View
                padding="tight"
                border="base"
                cornerRadius="none"
                background={i === selectedIdx ? COLORS.accentTint : COLORS.card}
              >
                <BlockStack spacing="tight" inlineAlignment="center">
                  {o.imageUrl ? (
                    <Image source={o.imageUrl} description={o.productTitle} />
                  ) : (
                    <View padding="base" background={COLORS.secondary}>
                      <Text size="small" emphasized>
                        {String(i + 1).padStart(2, "0")}
                      </Text>
                    </View>
                  )}
                  <Text size="small" emphasized>
                    {o.productTitle}
                  </Text>
                </BlockStack>
              </View>
            </Pressable>
          ))}
        </InlineStack>

        <InlineStack spacing="base" blockAlignment="center">
          <Text appearance="subdued" size="small">
            Swipe →
          </Text>
          <Text appearance="subdued" size="small" emphasized>
            {selectedIdx + 1} / {offers.length}
          </Text>
          <Button
            kind="plain"
            onPress={() => canPrev && setSelectedIdx(selectedIdx - 1)}
            disabled={!canPrev}
            accessibilityLabel="Previous breed"
          >
            ←
          </Button>
          <Button
            kind="plain"
            onPress={() => canNext && setSelectedIdx(selectedIdx + 1)}
            disabled={!canNext}
            accessibilityLabel="Next breed"
          >
            →
          </Button>
        </InlineStack>

        <Divider />

        <InlineStack spacing="base" blockAlignment="center">
          {selected.imageUrl && (
            <Image source={selected.imageUrl} description={selected.productTitle} />
          )}
          <BlockStack spacing="none">
            <Text emphasized>{selected.productTitle}</Text>
            <InlineStack spacing="tight">
              {compareAt && Number(compareAt) !== Number(discounted) && (
                <Text appearance="subdued" size="small">
                  {formatMoney(compareAt)}
                </Text>
              )}
              <Text size="base" emphasized>
                {formatMoney(discounted)}
              </Text>
            </InlineStack>
          </BlockStack>
          <Button
            kind="primary"
            onPress={add}
            loading={submitting}
            accessibilityLabel={`Add ${selected.productTitle}`}
          >
            ADD
          </Button>
        </InlineStack>

        {error && (
          <Text appearance="critical" size="small">
            {error}
          </Text>
        )}

        <View inlineAlignment="center">
          <Text size="small" appearance="subdued">
            🔒 One click · ships together · no card details
          </Text>
        </View>
      </BlockStack>
    </View>
  );
}

function AddedPanel({ breed }) {
  return (
    <View
      border="base"
      cornerRadius="none"
      padding="loose"
      background={COLORS.accentTint}
      minBlockSize={280}
    >
      <BlockStack spacing="base" inlineAlignment="center">
        <Icon source="checkmark" size="large" />
        <Heading level={3}>Added to your order</Heading>
        <Text appearance="subdued" size="small">
          Your {breed} ships with your order — $0 extra shipping.
        </Text>
      </BlockStack>
    </View>
  );
}

function computeDiscounted(price, discountPercent) {
  const n = Number(price);
  if (!Number.isFinite(n)) return price;
  return (n * (1 - discountPercent / 100)).toFixed(2);
}
