/* eslint-disable react/prop-types */
import { useEffect, useState } from "react";
import {
  extend,
  render,
  useExtensionInput,
  Banner,
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

import { POST_PURCHASE_OFFER_SECONDS } from "../../_shared/tokens.js";
import {
  fetchOffers,
  filterNotInCart,
  formatMMSS,
  formatMoney,
  toVariantGid,
} from "../../_shared/useOffers.js";

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
  const [state, setState] = useState("browsing");
  const [secondsLeft, setSecondsLeft] = useState(POST_PURCHASE_OFFER_SECONDS);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

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
      console.error("[post-purchase] accept failed", err);
      setError("We couldn't add the offer. Skip and we'll follow up.");
      setSubmitting(false);
    }
  };

  if (!selected) return null;

  if (state !== "browsing") {
    return <TerminalPanel state={state} offer={selected} onDone={done} />;
  }

  return (
    <Layout maxInlineSize={900} inlineAlignment="center">
      <View padding="loose" border="base" cornerRadius="base">
        <BlockStack spacing="loose">
          {/* Order confirmed */}
          <View inlineAlignment="center">
            <Text emphasized appearance="success">
              ✓ Order {orderName ?? ""} confirmed
            </Text>
          </View>

          {/* Offer banner */}
          <OfferBanner
            secondsLeft={secondsLeft}
            discountPercent={discountPercent}
          />

          {/* Carousel */}
          <BreedCarousel
            offers={offers}
            selectedIdx={selectedIdx}
            onSelect={setSelectedIdx}
          />

          {/* Action row */}
          <ActionRow
            offer={selected}
            discountPercent={discountPercent}
            onAdd={accept}
            submitting={submitting}
          />

          {error && <Text appearance="critical">{error}</Text>}

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

function OfferBanner({ secondsLeft, discountPercent }) {
  return (
    <Banner status="success">
      {/* Two-column layout: left content / right timer */}
      <InlineStack spacing="base" blockAlignment="center">
        <BlockStack spacing="tight">
          <Heading level={2}>
            Add a book, save {discountPercent}% off your next order
          </Heading>

          <InlineStack spacing="tight">
            <View padding="extraTight" border="base" cornerRadius="base">
              <Text size="small" emphasized appearance="success">
                −{discountPercent}%
              </Text>
            </View>
            <View padding="extraTight" border="base" cornerRadius="base">
              <Text size="small" emphasized appearance="success">
                $0 EXTRA SHIPPING
              </Text>
            </View>
          </InlineStack>
        </BlockStack>

        {/* Large timer on the right */}
        <BlockStack spacing="none" inlineAlignment="trailing">
          <Text size="extraLarge" emphasized appearance="success">
            {formatMMSS(secondsLeft)}
          </Text>
          <Text size="small" appearance="subdued">
            OFFER ENDS IN
          </Text>
        </BlockStack>
      </InlineStack>
    </Banner>
  );
}

function BreedCarousel({ offers, selectedIdx, onSelect }) {
  const canPrev = selectedIdx > 0;
  const canNext = selectedIdx < offers.length - 1;

  return (
    <BlockStack spacing="base">
      <Tiles maxPerLine={5} spacing="base">
        {offers.map((offer, i) => {
          const isSelected = i === selectedIdx;
          return (
            <View
              key={offer.variantId}
              padding="tight"
              border="base"
              cornerRadius="base"
              background={isSelected ? "subdued" : undefined}
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
                  <View padding="loose" background="subdued" cornerRadius="base">
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
          );
        })}
      </Tiles>

      {/* Navigation row – properly split left / right */}
      <InlineStack spacing="base" blockAlignment="center">
        <Text appearance="subdued" size="small">
          Swipe →
        </Text>

        <View>
          <InlineStack spacing="tight" blockAlignment="center">
            <Text appearance="subdued" size="small" emphasized>
              {selectedIdx + 1} / {offers.length}
            </Text>
            <Button
              plain
              onPress={() => canPrev && onSelect(selectedIdx - 1)}
              disabled={!canPrev}
              accessibilityLabel="Previous"
            >
              ←
            </Button>
            <Button
              plain
              onPress={() => canNext && onSelect(selectedIdx + 1)}
              disabled={!canNext}
              accessibilityLabel="Next"
            >
              →
            </Button>
          </InlineStack>
        </View>
      </InlineStack>
    </BlockStack>
  );
}

function ActionRow({ offer, discountPercent, onAdd, submitting }) {
  const compareAt = offer.compareAtPrice ?? offer.price;
  const discounted = computeDiscounted(
    offer.price ?? compareAt,
    discountPercent,
  );

  return (
    <>
      <Separator />
      <InlineStack spacing="base" blockAlignment="center">
        {/* Thumbnail */}
        {offer.imageUrl && (
          <Image
            source={offer.imageUrl}
            description={offer.productTitle}
            aspectRatio={0.75}
            fit="cover"
          />
        )}

        {/* Title + prices */}
        <BlockStack spacing="extraTight">
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

        {/* ADD button */}
        <Button
          submit
          onPress={onAdd}
          loading={submitting}
          accessibilityLabel={`Add ${offer.productTitle}`}
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

function TerminalPanel({ state, offer, onDone }) {
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
          {supporting && <TextBlock subdued>{supporting}</TextBlock>}
          <Button submit onPress={onDone}>
            Continue to confirmation
          </Button>
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