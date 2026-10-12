/* eslint-disable react/prop-types */
import { useEffect, useState } from "react";
import {
  extend,
  render,
  useExtensionInput,
  BlockStack,
  Button,
  Heading,
  Image,
  InlineStack,
  Layout,
  Separator,
  Text,
  TextBlock,
  Tiles,
  View,
} from "@shopify/post-purchase-ui-extensions-react";

import {
  COLORS,
  POST_PURCHASE_OFFER_SECONDS,
} from "../../_shared/tokens.js";
import {
  fetchOffers,
  filterNotInCart,
  formatMMSS,
  formatMoney,
  toVariantGid,
} from "../../_shared/useOffers.js";

// Switch per environment: local tunnel URL for `shopify app dev`,
// stg-dogbook-app for Vercel preview, prod URL for prod.
const APP_URL = "https://stg-dogbook-app.vercel.app";

extend("Checkout::PostPurchase::ShouldRender", async ({ inputData, storage }) => {
  const shopDomain = inputData?.shop?.domain;
  const purchasedProductIds = (inputData?.initialPurchase?.lineItems ?? [])
    .map((li) => li?.product?.id)
    .filter(Boolean)
    .map(String);
  const purchasedVariantGids = (inputData?.initialPurchase?.lineItems ?? [])
    .map((li) => li?.product?.variant?.id ?? li?.productVariantId)
    .filter(Boolean)
    .map(toVariantGid);

  const { offers, discountPercent } = await fetchOffers(APP_URL, {
    shopDomain,
    productIds: purchasedProductIds,
  });
  const filtered = filterNotInCart(offers, purchasedVariantGids);
  if (!filtered.length) return { render: false };

  const orderId = inputData?.initialPurchase?.referenceId ?? null;
  await storage.update({
    offers: filtered,
    discountPercent,
    orderName: orderId ? `#${String(orderId).slice(-4)}` : null,
  });
  return { render: true };
});

render("Checkout::PostPurchase::Render", () => <App />);

export function App() {
  const { storage, inputData, applyChangeset, done } = useExtensionInput();
  const { offers = [], discountPercent = 20, orderName } = storage.initialData ?? {};

  const [selectedIdx, setSelectedIdx] = useState(0);
  // browsing | accepted | declined | expired
  const [state, setState] = useState("browsing");
  const [secondsLeft, setSecondsLeft] = useState(POST_PURCHASE_OFFER_SECONDS);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Deadline-based countdown — immune to background throttling.
  useEffect(() => {
    if (state !== "browsing") return undefined;
    const deadline = Date.now() + secondsLeft * 1000;
    const tick = setInterval(() => {
      const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left === 0) setState("expired");
    }, 1000);
    return () => clearInterval(tick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const selected = offers[selectedIdx];

  const accept = async () => {
    if (!selected) return;
    setSubmitting(true);
    setError(null);
    try {
      const changes = [
        {
          type: "add_variant",
          variantId: Number(selected.variantId),
          quantity: 1,
          discount: {
            value: discountPercent,
            valueType: "percentage",
            title: `Post-purchase ${discountPercent}% off`,
          },
        },
      ];
      const res = await fetch(`${APP_URL}/api/post-purchase/sign`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          token: inputData.token,
          referenceId: inputData.initialPurchase.referenceId,
          changes,
        }),
      });
      if (!res.ok) throw new Error(`sign endpoint returned ${res.status}`);
      const { token } = await res.json();
      await applyChangeset(token);
      setState("accepted");
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[post-purchase] accept failed", err);
      setError("We couldn't add the offer. Skip and we'll follow up.");
      setSubmitting(false);
    }
  };

  if (!selected) {
    // ShouldRender filtered everything out — defensive, shouldn't happen.
    return null;
  }

  if (state !== "browsing") {
    return (
      <TerminalPanel
        state={state}
        offer={selected}
        onDone={done}
        onReset={() => {
          setSecondsLeft(POST_PURCHASE_OFFER_SECONDS);
          setState("browsing");
          setSubmitting(false);
        }}
      />
    );
  }

  return (
    <Layout maxInlineSize={900} inlineAlignment="center">
      <View padding="loose" background={COLORS.card} border="base">
        <BlockStack spacing="loose">
          <OrderConfirmedRow orderName={orderName} />
          <OfferBanner secondsLeft={secondsLeft} discountPercent={discountPercent} />
          <BreedCarousel
            offers={offers}
            selectedIdx={selectedIdx}
            onSelect={setSelectedIdx}
          />
          <ActionRow
            offer={selected}
            discountPercent={discountPercent}
            onAdd={accept}
            submitting={submitting}
          />
          {error && (
            <Text appearance="critical">{error}</Text>
          )}
          <TrustRow />
          <View inlineAlignment="center">
            <Button plain onPress={() => setState("declined")}>
              No thanks
            </Button>
          </View>
        </BlockStack>
      </View>
    </Layout>
  );
}

function OrderConfirmedRow({ orderName }) {
  return (
    <View inlineAlignment="center">
      <InlineStack spacing="tight" blockAlignment="center">
        {/* ponytail: no CheckCircle2 icon primitive; approximate with the ✓ glyph
            tinted to the accent color via Text appearance. */}
        <Text emphasized appearance="success">
          ✓ Order {orderName ?? ""} confirmed
        </Text>
      </InlineStack>
    </View>
  );
}

function OfferBanner({ secondsLeft, discountPercent }) {
  return (
    <View
      padding="base"
      border="base"
      cornerRadius="none"
      background={COLORS.accentTint}
    >
      <InlineStack spacing="loose" blockAlignment="center">
        <BlockStack spacing="tight">
          <Heading level={2}>
            Add a book, save {discountPercent}% off your next order
          </Heading>
          <InlineStack spacing="tight">
            {/* −20% pill */}
            <View
              padding="extraTight"
              background={COLORS.accent}
              cornerRadius="none"
            >
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
        </BlockStack>
        <BlockStack spacing="none" inlineAlignment="trailing">
          {/* ponytail: tabular-nums + monospace is automatic in post-purchase
              typography. extraLarge ≈ 24-30px, not the 60px desktop target,
              but it's the biggest size the primitive exposes. */}
          <Text size="extraLarge" emphasized appearance="success">
            {formatMMSS(secondsLeft)}
          </Text>
          <Text size="small" appearance="subdued">
            OFFER ENDS IN
          </Text>
        </BlockStack>
      </InlineStack>
    </View>
  );
}

function BreedCarousel({ offers, selectedIdx, onSelect }) {
  // ponytail: no horizontal-scroll primitive; approximate the carousel with a
  // Tiles grid that wraps. ← / → arrows work, swipe does not. Upgrade path:
  // when the extension API exposes ScrollView, swap `Tiles` for a scroller.
  const canPrev = selectedIdx > 0;
  const canNext = selectedIdx < offers.length - 1;
  return (
    <BlockStack spacing="tight">
      {/* ponytail: @shopify/post-purchase-ui-extensions-react 0.13.x doesn't
          export Pressable, so tiles are non-interactive. Selection is driven
          entirely by the ← / → buttons below. Upgrade path: when the package
          ships Pressable (or an onPress on View), wrap each tile in it. */}
      <Tiles maxPerLine={5} spacing="tight">
        {offers.map((offer, i) => (
          <View
            key={offer.variantId}
            padding="tight"
            border="base"
            cornerRadius="none"
            background={i === selectedIdx ? COLORS.accentTint : COLORS.card}
          >
            <BlockStack spacing="tight" inlineAlignment="center">
              {offer.imageUrl ? (
                <Image
                  source={offer.imageUrl}
                  description={offer.productTitle}
                  aspectRatio={0.75}
                  fit="cover"
                />
              ) : (
                <View
                  padding="loose"
                  background={COLORS.secondary}
                  cornerRadius="none"
                >
                  <Text size="small" emphasized>
                    {String(i + 1).padStart(2, "0")}
                  </Text>
                </View>
              )}
              <Text size="small" emphasized>
                {offer.productTitle}
              </Text>
            </BlockStack>
          </View>
        ))}
      </Tiles>
      <InlineStack spacing="base" blockAlignment="center">
        <Text appearance="subdued" size="small">
          Swipe →
        </Text>
        <Text appearance="subdued" size="small" emphasized>
          {selectedIdx + 1} / {offers.length}
        </Text>
        <Button
          plain
          onPress={() => canPrev && onSelect(selectedIdx - 1)}
          disabled={!canPrev}
          accessibilityLabel="Previous breed"
        >
          ←
        </Button>
        <Button
          plain
          onPress={() => canNext && onSelect(selectedIdx + 1)}
          disabled={!canNext}
          accessibilityLabel="Next breed"
        >
          →
        </Button>
      </InlineStack>
    </BlockStack>
  );
}

function ActionRow({ offer, discountPercent, onAdd, submitting }) {
  const compareAt = offer.compareAtPrice ?? offer.price;
  const discounted = computeDiscounted(offer.price ?? compareAt, discountPercent);
  return (
    <>
      <Separator />
      <InlineStack spacing="base" blockAlignment="center">
        {offer.imageUrl && (
          <Image
            source={offer.imageUrl}
            description={offer.productTitle}
            aspectRatio={0.75}
            fit="cover"
          />
        )}
        <BlockStack spacing="tight">
          <Text emphasized>{offer.productTitle}</Text>
          <InlineStack spacing="tight" blockAlignment="center">
            {compareAt && Number(compareAt) !== Number(discounted) && (
              <Text appearance="subdued" role="deletion">
                {formatMoney(compareAt)}
              </Text>
            )}
            <Text size="large" emphasized>
              {formatMoney(discounted)}
            </Text>
          </InlineStack>
        </BlockStack>
        <Button
          submit
          onPress={onAdd}
          loading={submitting}
          accessibilityLabel={`Add ${offer.productTitle} for ${formatMoney(discounted)}`}
        >
          ADD — {formatMoney(discounted)}
        </Button>
      </InlineStack>
    </>
  );
}

function TrustRow() {
  return (
    <View inlineAlignment="center">
      <Text size="small" appearance="subdued">
        🔒 One click · ships together · no card details
      </Text>
    </View>
  );
}

function TerminalPanel({ state, offer, onDone, onReset }) {
  const headline =
    state === "accepted"
      ? "Added to your order"
      : state === "declined"
      ? "Your order is all set"
      : "This offer has ended";
  const supporting =
    state === "accepted"
      ? `Your ${offer.productTitle} ships with your order — no extra shipping.`
      : state === "declined"
      ? "Your order is confirmed."
      : null;

  return (
    <Layout maxInlineSize={512} inlineAlignment="center">
      <View padding="loose" inlineAlignment="center">
        <BlockStack spacing="loose" inlineAlignment="center">
          <Text size="extraLarge" emphasized appearance="success">
            ✓
          </Text>
          <Heading level={2}>{headline}</Heading>
          {supporting && (
            <TextBlock subdued>{supporting}</TextBlock>
          )}
          <Button submit onPress={onDone}>
            Continue to confirmation
          </Button>
          {/* ponytail: dev-only reset — remove before shipping to prod. */}
          {state !== "accepted" && (
            <Button plain onPress={onReset}>
              Back to the offer
            </Button>
          )}
        </BlockStack>
      </View>
    </Layout>
  );
}

function computeDiscounted(price, discountPercent) {
  const n = Number(price);
  if (!Number.isFinite(n)) return price;
  return (n * (1 - discountPercent / 100)).toFixed(2);
}
