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
} from "@shopify/post-purchase-ui-extensions-react";

// =====================================================================
// Offer source: shop metafield `app.post_purchase_offer`, resolved via
// GET /api/post-purchase/offer?shop=<domain>. Merchant edits it in
// Shopify Admin → Settings → Custom data → Shop (or via the embedded
// app settings page). See docs/plan/07-post-purchase-extension.md.
// =====================================================================

// TODO per environment:
//   local dev: paste the `shopify app dev` tunnel URL printed by the CLI
//   staging:   https://stg-dogbook-app.vercel.app
const APP_URL = "https://stg-dogbook-app.vercel.app";

// =====================================================================

const offerToChanges = (offer) => [
  {
    type: "add_variant",
    variantId: offer.variantId,
    quantity: offer.quantity ?? 1,
    discount: offer.discount,
  },
];

const fetchOffer = async (shopDomain, productIds) => {
  if (!shopDomain) return null;
  const params = new URLSearchParams({ shop: shopDomain });
  if (productIds.length) params.set("product_ids", productIds.join(","));
  try {
    const res = await fetch(`${APP_URL}/api/post-purchase/offer?${params.toString()}`);
    if (!res.ok) return null;
    const body = await res.json();
    return body?.offer ?? null;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[post-purchase] fetchOffer failed", err);
    return null;
  }
};

const extractProductIds = (initialPurchase) =>
  (initialPurchase?.lineItems ?? [])
    .map((li) => li?.product?.id)
    .filter((id) => id != null)
    .map(String);

extend("Checkout::PostPurchase::ShouldRender", async ({ inputData, storage }) => {
  const shopDomain = inputData?.shop?.domain;
  const productIds = extractProductIds(inputData?.initialPurchase);
  const offer = await fetchOffer(shopDomain, productIds);
  if (!offer?.variantId) return { render: false };
  await storage.update({ offer });
  return { render: true };
});

render("Checkout::PostPurchase::Render", () => <App />);

export function App() {
  const { storage, inputData, calculateChangeset, applyChangeset, done } =
    useExtensionInput();

  // storage.initialData.offer is set in ShouldRender — if we got here it exists.
  const offer = storage.initialData.offer;
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

  // Layout with sizes ['fill', 'auto'] → label fills remaining space, value hugs right.
  const PriceRow = ({ label, value, strike, emphasized, appearance }) => (
    <Layout sizes={["fill", "auto"]}>
      <Text subdued={!emphasized}>{label}</Text>
      <Text
        emphasized={emphasized}
        appearance={appearance}
        role={strike ? "deletion" : undefined}
      >
        {value}
      </Text>
    </Layout>
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
    <Layout maxInlineSize={560}>
      <BlockStack spacing="loose">
        <CalloutBanner title="One more thing before you go">
          <TextBlock>
            Add this to your order — no extra shipping, same confirmation email.
          </TextBlock>
        </CalloutBanner>

        {hasImage && (
          <Image
            source={offer.imageUrl}
            description={offer.productTitle}
            aspectRatio={1.6}
            fit="cover"
          />
        )}

        {Content}
      </BlockStack>
    </Layout>
  );
}
