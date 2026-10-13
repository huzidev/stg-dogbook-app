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
import { useEffect, useRef, useState } from "preact/hooks";

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

  if (added) return <AddedPanel breed={selected.productTitle} />;

  const canPrev = selectedIdx > 0;
  const canNext = selectedIdx < offers.length - 1;

  // STEP-B4: s-scroll-box hides its real scroll container inside shadow DOM,
  // so neither scrollIntoView nor scrollLeft on the host ref actually moves
  // the strip. Walk the DOM up (crossing shadow boundaries via
  // getRootNode().host) until we find the ancestor that has horizontal
  // overflow — THAT'S the real scroller — and scroll it directly.
  // Rollback: revert findScroller + choose + useEffect to the STEP-B2 block
  // in the prior commit (plain scrollIntoView + host-scrollLeft drag).
  const scrollerRef = useRef(null);
  const tileRefs = useRef([]);

  const findScroller = (fromEl) => {
    let node = fromEl?.parentElement ?? fromEl?.getRootNode?.()?.host ?? null;
    while (node) {
      if (node.scrollWidth > node.clientWidth + 1) return node;
      node = node.parentElement ?? node.getRootNode?.()?.host ?? null;
    }
    return null;
  };

  const choose = (i) => {
    setSelectedIdx(i);
    const tile = tileRefs.current[i];
    const scroller = findScroller(tile);
    if (!tile || !scroller) return;
    const tileRect = tile.getBoundingClientRect();
    const scrollerRect = scroller.getBoundingClientRect();
    const target =
      scroller.scrollLeft + (tileRect.left - scrollerRect.left) - 8;
    if (typeof scroller.scrollTo === "function") {
      scroller.scrollTo({ left: target, behavior: "smooth" });
    } else {
      scroller.scrollLeft = target;
    }
  };

  useEffect(() => {
    const host = scrollerRef.current;
    if (!host) return undefined;
    let down = false;
    let startX = 0;
    let startLeft = 0;
    let scroller = null;
    const onDown = (e) => {
      // Find the real scroller from the event target (walks shadow DOM).
      scroller = findScroller(e.target) ?? findScroller(host.firstElementChild);
      if (!scroller) return;
      down = true;
      startX = e.pageX;
      startLeft = scroller.scrollLeft;
    };
    const onMove = (e) => {
      if (!down || !scroller) return;
      scroller.scrollLeft = startLeft - (e.pageX - startX);
    };
    const onUp = () => {
      down = false;
      scroller = null;
    };
    host.addEventListener("mousedown", onDown);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      host.removeEventListener("mousedown", onDown);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [offers.length]);

  // STEP-B5: back to green via `s-banner tone="success"` — the only Polaris
  // primitive that paints a true mint-green panel with a matching border.
  // Trade: the banner reserves ~32px on the left for its baked-in success
  // icon. There is no primitive that gives us "green panel with no icon
  // padding"; `s-box background="success"` is not a valid Polaris value
  // and blanked the extension when tried.
  // Rollback: swap this `s-banner` for the prior `s-box background="subdued"`
  // + inner `s-heading` block to drop the icon (and the green).
  return (
    <s-banner
      tone="success"
      heading={`Add a book, save ${discountPercent}% off your next order`}
    >
      <s-stack direction="block" gap="small-100">
        {/* STEP-B: tone="success" pills (were tone-less grey before). */}
        <s-stack direction="inline" gap="small-100">
          <s-badge tone="success">−{discountPercent}%</s-badge>
          <s-badge tone="success">$0 EXTRA SHIPPING</s-badge>
        </s-stack>

        {/* STEP-B3-ROLLBACK: plain-div scroll strip blanked the extension
            (sandbox likely strips arbitrary HTML + inline style). Back to
            s-scroll-box + s-grid, which renders. The ref sits on each
            s-clickable; scrollIntoView may or may not reach the sandboxed
            scroller — if it does, arrow buttons scroll; if not, they only
            change selection and the user has to swipe/trackpad the strip. */}
        <s-scroll-box ref={scrollerRef} overflow="auto hidden">
          <s-grid
            gridTemplateColumns={offers.map(() => TILE_WIDTH).join(" ")}
            gap="small-100"
          >
            {offers.map((o, i) => (
              <s-clickable
                key={o.variantGid}
                ref={(el) => (tileRefs.current[i] = el)}
                onclick={() => choose(i)}
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
        </s-scroll-box>

        {/* Swipe label + counter + arrows. Arrows only change which tile is
            selected below — s-scroll-box has no programmatic scrollTo, so
            we can't auto-chase the selection. Native touch/trackpad swipe
            is the only way to actually move the strip. */}
        <s-grid gridTemplateColumns="1fr auto" gap="base" alignItems="center">
          <s-text type="small" tone="neutral">
            Swipe →
          </s-text>
          <s-stack direction="inline" gap="small-100" alignItems="center">
            <s-text type="small" tone="neutral">
              {selectedIdx + 1} / {offers.length}
            </s-text>
            <s-button
              variant="secondary"
              onclick={() => canPrev && choose(selectedIdx - 1)}
              disabled={!canPrev || undefined}
              accessibility-label="Previous breed"
            >
              <s-icon type="arrow-left" size="small" />
            </s-button>
            <s-button
              variant="secondary"
              onclick={() => canNext && choose(selectedIdx + 1)}
              disabled={!canNext || undefined}
              accessibility-label="Next breed"
            >
              <s-icon type="arrow-right" size="small" />
            </s-button>
          </s-stack>
        </s-grid>

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

// STEP-B5: AddedPanel also back to s-banner tone="success" for the mint fill.
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
