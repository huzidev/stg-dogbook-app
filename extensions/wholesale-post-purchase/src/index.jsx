/* eslint-disable react/prop-types */
import { useEffect, useState } from "react";
import {
  extend,
  render,
  useExtensionInput,
  Banner,
  BlockStack,
  Button,
  CalloutBanner,
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

// STEP-C: COLORS hex map removed from this file's imports — every
// background that used it was being silently dropped by the lib.
import { POST_PURCHASE_OFFER_SECONDS } from "../../_shared/tokens.js";
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
    // STEP-C: dropped the `onReset` prop — the dev-only Back-to-offer
    // button that consumed it is deleted inside TerminalPanel.
    return <TerminalPanel state={state} offer={selected} onDone={done} />;
  }

  return (
    <Layout maxInlineSize={900} inlineAlignment="center">
      {/* STEP-C: dropped `background={COLORS.card}` — hex was ignored.
          Default surface bg + border carries the card look. */}
      <View padding="loose" border="base">
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

// STEP-C4: swap CalloutBanner for Banner status="success". CalloutBanner
// paints a grey/tinted panel with a built-in heading slot; Banner with
// status="success" is Shopify's green "success" banner primitive — the
// closest the lib comes to Lovable's mint fill. Trade: Banner is less
// configurable (shows a built-in checkmark icon), but it's the only
// post-purchase primitive that renders a GREEN panel.
// Rollback: swap <Banner status="success"> back to <CalloutBanner title=…>
// and move the headline back into the title prop.
function OfferBanner({ secondsLeft, discountPercent }) {
  return (
    <Banner status="success">
      <BlockStack spacing="tight">
        <Heading level={2}>
          Add a book, save {discountPercent}% off your next order
        </Heading>
        <InlineStack spacing="loose" blockAlignment="center">
          <BlockStack spacing="tight">
            <InlineStack spacing="tight">
              {/* STEP-C: −20% pill. The library has no `strong` background
                  keyword that renders dark, so we fall back to a bordered
                  outline + success-tone text. Visually a mint outline pill
                  instead of a filled dark pill — closest the primitive allows. */}
              <View padding="extraTight" border="base" cornerRadius="none">
                <Text size="small" emphasized appearance="success">
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
      </BlockStack>
    </Banner>
  );
}

function BreedCarousel({ offers, selectedIdx, onSelect }) {
  // ponytail: no horizontal-scroll primitive; approximate the carousel with a
  // Tiles grid that wraps. With ≤5 variants it renders as a single row like
  // the Lovable mock. Beyond 5, Tiles wraps to a second row — fine for the
  // unlimited vertical space on post-purchase.
  const canPrev = selectedIdx > 0;
  const canNext = selectedIdx < offers.length - 1;
  return (
    <BlockStack spacing="tight">
      {/* ponytail: @shopify/post-purchase-ui-extensions-react 0.13.x doesn't
          export Pressable, so tiles are non-interactive. Selection is driven
          entirely by the ← / → buttons below. */}
      <Tiles maxPerLine={5} spacing="tight">
        {offers.map((offer, i) => (
          // STEP-C: hex `background` values dropped by the lib → keyword only.
          // Selected tile uses `background="subdued"` for a subtle fill tint;
          // non-selected omits background so the theme default (card) shows.
          <View
            key={offer.variantId}
            padding="tight"
            border="base"
            cornerRadius="none"
            background={i === selectedIdx ? "subdued" : undefined}
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
                // STEP-C: placeholder bg hex → keyword.
                <View
                  padding="loose"
                  background="subdued"
                  cornerRadius="none"
                >
                  <Text size="small" emphasized>
                    {String(i + 1).padStart(2, "0")}
                  </Text>
                </View>
              )}
              {/* STEP-C3: minBlockSize on the title wrapper so one-line
                  and two-line names produce the same tile height. If this
                  View prop is dropped by the lib, tiles stay unequal — no
                  harm, just no improvement. */}
              <View minBlockSize={36}>
                <Text size="small" emphasized>
                  {offer.productTitle}
                </Text>
              </View>
            </BlockStack>
          </View>
        ))}
      </Tiles>
      {/* STEP-C: dropped the "Swipe →" label — nothing scrolls on this
          surface (library has no scroll primitive), so the hint was lying.
          Arrows remain as the only navigation. */}
      <InlineStack spacing="base" blockAlignment="center">
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

// STEP-C: `onReset` prop removed from the call site — only the dev-only
// "Back to the offer" button used it. Signature kept backward-compatible
// for an easy restore.
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
          {supporting && (
            <TextBlock subdued>{supporting}</TextBlock>
          )}
          <Button submit onPress={onDone}>
            Continue to confirmation
          </Button>
          {/* STEP-C: deleted the dev-only "Back to the offer" ghost button
              per the plan's prod checklist. Rollback: paste back the
              `state !== "accepted" && <Button plain onPress={onReset}>…</Button>`
              block and re-add `onReset` to the TerminalPanel signature. */}
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
