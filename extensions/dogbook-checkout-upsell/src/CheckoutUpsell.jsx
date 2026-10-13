/** @jsxImportSource preact */
/* eslint-disable no-undef, react/no-unknown-property */
// Checkout UI extension, 2025-10 API.
//
// STEP-B rewrite — visual pass to get closer to the Lovable mock in
// docs/post-purchase/03-checkout-cross-sell.md. Every change vs the
// pre-Step-B version is marked with a `STEP-B:` comment so a rollback
// can either `git revert` the commit or grep + revert line by line.
//
// What changed vs pre-Step-B (all visual, no data-flow change):
//   • Outer wrap: s-stack with hex `background` → s-banner tone="success".
//     Polaris web components silently drop hex colors; s-banner is the
//     only primitive that paints the mint accent + border Lovable shows.
//   • Carousel: wrapping s-stack direction="inline" → s-grid with N
//     explicit TILE_WIDTH columns inside an s-scroll-box. Forces a
//     single horizontal row that scrolls natively.
//   • Tile cover: unconstrained s-image → fixed s-box (COVER_WIDTH x
//     COVER_HEIGHT) with the image filling it. Images no longer blow out.
//   • Badges: tone-less → tone="success" for the green pill look.
//   • Action-row cover: manual s-image + fallback → s-product-thumbnail
//     (built-in placeholder, consistent sizing).
//   • AddedPanel: hex-background s-stack → s-banner tone="success".
//
// Rollback: `git revert <this commit>`. Backend fetch (fetchOffers,
// applyCartLinesChange, UPSELL_SOURCE attribute) is unchanged — the
// pre-Step-B JSX restores one-for-one.

import "@shopify/ui-extensions/preact";
import { render } from "preact";
import { useEffect, useState } from "preact/hooks";

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

// STEP-B: narrow 118px tile = Lovable right-rail book shape; 80x100 cover
// well inside leaves room for the breed name without wrapping on 2 lines.
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

  // ponytail: silent fallback instead of a debug stack; nothing to show =
  // nothing rendered.
  if (loading || !offers.length) return null;

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
    } catch {
      setError("Could not add this book.");
      setSubmitting(false);
    }
  };

  // STEP-B8: best-effort suppression of the s-banner tone-icon. Polaris
  // doesn't expose an `icon` prop or a documented shadow part, so we try
  // two hacks: a <style> tag with ::part(icon) + descendant selectors,
  // and a useEffect that walks into any open shadow root and sets
  // display:none on the icon node. Either may be silently blocked by the
  // Shopify sandbox or a closed shadow root — in that case the icon
  // stays and this hunk is a no-op. Rollback: delete the useEffect below
  // AND the <style> tag inside the s-banner return.
  useEffect(() => {
    const kill = () => {
      document.querySelectorAll("s-banner").forEach((b) => {
        const root = b.shadowRoot;
        if (!root) return;
        const icon =
          root.querySelector('[part~="icon"]') ?? root.querySelector("svg");
        if (icon) icon.style.display = "none";
      });
    };
    kill();
    const id = setTimeout(kill, 50);
    return () => clearTimeout(id);
  });

  if (added) return <AddedPanel breed={selected.productTitle} />;

  // STEP-B6: carousel abandoned. s-scroll-box doesn't expose its real
  // scroller (shadow DOM), native s-clickable children don't bubble enough
  // info to walk the tree, and plain divs are stripped by the sandbox.
  // Switched to a wrapping s-grid instead — tiles wrap into 2-3 columns
  // depending on viewport width. All ref/drag/scrollIntoView machinery is
  // deleted. Rollback: restore scrollerRef/tileRefs/findScroller/choose +
  // useEffect from the prior commit and swap the s-grid below for an
  // s-scroll-box + single-row s-grid.

  // STEP-B7: user picked green over no-icon. s-banner tone="success" paints
  // the mint panel + border but reserves ~32px on the left for its baked-in
  // tone icon — this is a Polaris primitive constraint, not something we
  // can override (`icon` prop doesn't exist on s-banner; border color only
  // accepts 'base'). Rollback: swap this s-banner for the prior s-box
  // background="subdued" + inner s-heading to drop the icon (and the green).
  return (
    <s-banner
      tone="success"
      heading={`Add a book, save ${discountPercent}% off your next order`}
    >
      {/* STEP-B8: CSS hack companion to the useEffect above. Attempts to
          hide the tone-icon via a documented part name and a generic svg
          fallback. If the sandbox strips <style> or the shadow doesn't
          expose that part, this is a no-op. */}
      <style>{`s-banner::part(icon){display:none !important}s-banner [part~="icon"]{display:none !important}`}</style>
      <s-stack direction="block" gap="small-100">
        {/* STEP-B: tone="success" pills (were tone-less grey before). */}
        <s-stack direction="inline" gap="small-100">
          <s-badge tone="success">−{discountPercent}%</s-badge>
          <s-badge tone="success">$0 EXTRA SHIPPING hello world</s-badge>
        </s-stack>

        {/* STEP-B6: wrapping s-grid. gridTemplateColumns uses
            `repeat(auto-fill, minmax(118px, 1fr))` so tiles wrap into 2-3
            columns depending on the rail width — scales fine for any
            number of products. No scroll primitive involved. */}
        <s-grid
          gridTemplateColumns="repeat(auto-fill, minmax(118px, 1fr))"
          gap="small-100"
        >
          {offers.map((o, i) => (
            <s-clickable
              key={o.variantGid}
              onclick={() => setSelectedIdx(i)}
              accessibility-label={o.productTitle}
            >
                <s-box
                  padding="small-100"
                  border="base"
                  borderRadius="none"
                  background={i === selectedIdx ? "subdued" : "base"}
                >
                  <s-stack direction="block" gap="small-200" alignInline="center">
                    {/* STEP-B: fixed-size cover well so s-image doesn't
                        fill the whole tile. */}
                    <s-box inlineSize={COVER_WIDTH} blockSize={COVER_HEIGHT}>
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
                    {/* STEP-B5: fixed min-height on the title area so one-line
                        and two-line names produce the same tile height. */}
                    <s-box minBlockSize="36px">
                      <s-text type="small">{o.productTitle}</s-text>
                    </s-box>
                  </s-stack>
                </s-box>
            </s-clickable>
          ))}
        </s-grid>

        {/* STEP-B6: counter + Swipe hint + arrow buttons removed. The grid
            wraps so there's no "page" concept; a tap on any tile is the
            new navigation. */}

        <s-divider />

        {/* STEP-B: s-product-thumbnail is Shopify's "cover + optional qty
            badge" primitive; it ships its own placeholder when src is
            null. Replaces the manual s-image + s-box fallback. */}
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
    </s-banner>
  );
}

// STEP-B7: AddedPanel also back to green s-banner.
function AddedPanel({ breed }) {
  return (
    <s-banner tone="success" heading="Added to your order">
      <s-paragraph>
        Your {breed} ships with your order — $0 extra shipping.
      </s-paragraph>
    </s-banner>
  );
}

function computeDiscounted(price, discountPercent) {
  const n = Number(price);
  if (!Number.isFinite(n)) return price;
  return (n * (1 - discountPercent / 100)).toFixed(2);
}
