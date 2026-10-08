import React, { useEffect, useState } from "react";
import {
  extend,
  render,
  useExtensionInput,
  BlockStack,
  Button,
  CalloutBanner,
  Heading,
  Image,
  Layout,
  TextBlock,
  TextContainer,
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
  imageUrl:
    "https://cdn.shopify.com/static/images/examples/img-placeholder-1120x1120.png",
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

  const money = (amount, currency) =>
    amount == null
      ? "—"
      : `${currency ?? ""} ${Number(amount).toFixed(2)}`.trim();

  const presentment = calc?.totalOutstandingSet?.presentmentMoney;
  const currency = presentment?.currencyCode;
  const total = presentment?.amount;
  const line = calc?.updatedLineItems?.[0];
  const originalPrice = line?.priceSet?.presentmentMoney?.amount;
  const discountedPrice = line?.totalPriceSet?.presentmentMoney?.amount;
  const showDiscount =
    originalPrice && discountedPrice && originalPrice !== discountedPrice;

  return (
    <BlockStack spacing="loose">
      <CalloutBanner title="One more thing before you go">
        <TextBlock>
          Add this to your order with no additional shipping cost.
        </TextBlock>
      </CalloutBanner>

      <Layout
        maxInlineSize={0.95}
        media={[
          { viewportSize: "small", sizes: [1, 30, 1] },
          { viewportSize: "medium", sizes: [300, 30, 0.5] },
          { viewportSize: "large", sizes: [400, 30, 0.33] },
        ]}
      >
        <View>
          <Image source={offer.imageUrl} />
        </View>
        <View />
        <BlockStack spacing="xloose">
          <TextContainer>
            <Heading>{offer.productTitle}</Heading>
            <TextBlock>{offer.description}</TextBlock>
          </TextContainer>

          <BlockStack spacing="tight">
            {showDiscount && (
              <TextBlock>
                Was {money(originalPrice, currency)}, now{" "}
                {money(discountedPrice, currency)}
              </TextBlock>
            )}
            {total && (
              <TextBlock>
                Order total if accepted: {money(total, currency)}
              </TextBlock>
            )}
          </BlockStack>

          {error && (
            <CalloutBanner title="Problem">
              <TextBlock>{error}</TextBlock>
            </CalloutBanner>
          )}

          <Button submit onPress={accept} loading={submitting}>
            Add to my order
          </Button>
          <Button plain onPress={decline} disabled={submitting}>
            No thanks
          </Button>
        </BlockStack>
      </Layout>
    </BlockStack>
  );
}
