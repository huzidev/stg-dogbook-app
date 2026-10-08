import React, { useEffect, useState } from "react";
import {
  extend,
  render,
  useExtensionInput,
  Banner,
  BlockStack,
  Button,
  ButtonGroup,
  CalloutBanner,
  Heading,
  Image,
  InlineStack,
  Layout,
  Separator,
  Text,
  TextBlock,
  TextContainer,
  Tiles,
  View,
} from "@shopify/post-purchase-ui-extensions-react";

// =====================================================================
// Configure before testing. See docs/plan/07-post-purchase-extension.md
// §12 for the open client questions driving these values.
// =====================================================================

// ponytail: hardcoded offer. When the client confirms dynamic rules,
// `ShouldRender` will POST to /api/post-purchase/offer instead.
const OFFER = {
  variantId: 67594204676249, // Cane Corso (dev store)
  quantity: 1,
  productTitle: "Cane Corso",
  description:
    "Add a Cane Corso to your order with a one-time post-purchase discount.",
  // TODO: paste a real product image URL (admin → Products → Cane Corso → copy image URL).
  // Leave null to render a cleaner, image-less layout.
  imageUrl: null,
  discount: {
    value: 10,
    valueType: "percentage",
    title: "Post-purchase 10% off",
  },
};

// TODO per environment:
//   local dev: paste the `shopify app dev` tunnel URL printed by the CLI
//   staging:   https://stg-dogbook-app.vercel.app
const APP_URL = "https://stg-dogbook-app.vercel.app";

// =====================================================================

const offerToChanges = (offer) => [
  {
    type: "add_variant",
    variantId: offer.variantId,
    quantity: offer.quantity,
    discount: offer.discount,
  },
];

extend("Checkout::PostPurchase::ShouldRender", async ({ storage }) => {
  await storage.update({ offer: OFFER });
  return { render: true };
});

render("Checkout::PostPurchase::Render", () => <App />);

export function App() {
  const { storage, inputData, calculateChangeset, applyChangeset, done } =
    useExtensionInput();

  const offer = storage.initialData?.offer ?? OFFER;
  const changes = offerToChanges(offer);

  const [calc, setCalc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await calculateChangeset({ changes });
        if (!cancelled) setCalc(result.calculatedPurchase);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[post-purchase] calculateChangeset failed", err);
        if (!cancelled) setError("Could not calculate this offer.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const accept = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`${APP_URL}/api/post-purchase/sign`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          token: inputData.token,
          referenceId: inputData.initialPurchase.referenceId,
          changes,
        }),
      });
      if (!res.ok) {
        throw new Error(`sign endpoint returned ${res.status}`);
      }
      const { token } = await res.json();
      await applyChangeset(token);
      done();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[post-purchase] accept failed", err);
      setSubmitting(false);
      setError("We couldn't add the offer. Skip and we'll follow up.");
    }
  };

  const decline = () => done();

  if (loading) {
    return (
      <BlockStack spacing="loose">
        <CalloutBanner title="One moment">
          <TextBlock>Preparing your offer…</TextBlock>
        </CalloutBanner>
      </BlockStack>
    );
  }

  const presentment = calc?.totalOutstandingSet?.presentmentMoney;
  const currencyCode = presentment?.currencyCode ?? "USD";
  const total = presentment?.amount;
  const line = calc?.updatedLineItems?.[0];
  const originalPrice = line?.priceSet?.presentmentMoney?.amount;
  const discountedPrice = line?.totalPriceSet?.presentmentMoney?.amount;
  const showDiscount =
    originalPrice != null &&
    discountedPrice != null &&
    Number(originalPrice) !== Number(discountedPrice);
  const savings = showDiscount
    ? (Number(originalPrice) - Number(discountedPrice)).toFixed(2)
    : null;
  const fmt = (amount) =>
    `${currencyCode} ${Number(amount ?? 0).toFixed(2)}`;

  const hasImage = Boolean(offer.imageUrl);

  const PriceRow = ({ label, value, strike, emphasized, appearance }) => (
    <InlineStack spacing="tight" alignment="leading">
      <View inlineAlignment="leading">
        <Text subdued={!emphasized}>{label}</Text>
      </View>
      <View inlineAlignment="trailing">
        <Text
          emphasized={emphasized}
          appearance={appearance}
          role={strike ? { tag: "s" } : undefined}
        >
          {value}
        </Text>
      </View>
    </InlineStack>
  );

  const Content = (
    <BlockStack spacing="loose">
      <BlockStack spacing="tight">
        <InlineStack spacing="tight" alignment="leading">
          <Heading level={2}>{offer.productTitle}</Heading>
          {showDiscount && (
            <Text emphasized appearance="success">
              Save {offer.discount.value}
              {offer.discount.valueType === "percentage" ? "%" : ""}
            </Text>
          )}
        </InlineStack>
        <TextBlock subdued>{offer.description}</TextBlock>
      </BlockStack>

      <Separator />

      <BlockStack spacing="tight">
        {showDiscount && (
          <PriceRow
            label="Regular price"
            value={fmt(originalPrice)}
            strike
          />
        )}
        <PriceRow
          label={showDiscount ? "Your price" : "Price"}
          value={fmt(discountedPrice ?? originalPrice)}
          emphasized
        />
        {savings && (
          <PriceRow
            label="You save"
            value={fmt(savings)}
            emphasized
            appearance="success"
          />
        )}
      </BlockStack>

      {total != null && (
        <>
          <Separator />
          <PriceRow
            label="New order total"
            value={fmt(total)}
            emphasized
          />
        </>
      )}

      {error && (
        <Banner status="critical" title="Something went wrong">
          <TextBlock>{error}</TextBlock>
        </Banner>
      )}

      <ButtonGroup>
        <Button submit onPress={accept} loading={submitting}>
          Pay now · {fmt(discountedPrice ?? 0)}
        </Button>
        <Button plain onPress={decline} disabled={submitting}>
          No thanks, continue to confirmation
        </Button>
      </ButtonGroup>
    </BlockStack>
  );

  return (
    <BlockStack spacing="xloose">
      <CalloutBanner title="One more thing before you go" alignment="center">
        <TextBlock>
          Add this to your order — no extra shipping, same confirmation email.
        </TextBlock>
      </CalloutBanner>

      {hasImage ? (
        <Tiles
          maxInlineSize={0.95}
          media={[
            { viewportSize: "small", sizes: [1] },
            { viewportSize: "medium", sizes: [220, 0.6] },
            { viewportSize: "large", sizes: [260, 0.6] },
          ]}
        >
          <View>
            <Image source={offer.imageUrl} description={offer.productTitle} />
          </View>
          <View>{Content}</View>
        </Tiles>
      ) : (
        <View maxInlineSize={620}>{Content}</View>
      )}
    </BlockStack>
  );
}
