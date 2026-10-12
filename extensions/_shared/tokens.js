// Shared design tokens for the post-purchase + checkout upsell extensions.
// Values come from docs/post-purchase/00-design-tokens.md.
//
// Shopify extension primitives accept hex via `background`/`border` props on
// most View/Pressable surfaces. Nothing else is portable — keep this file
// hex-only, no gradients or shadows.

export const COLORS = {
  // page bg + card bg
  background: "#FDFCF8",
  card: "#FFFFFF",
  // text + inverse
  foreground: "#1E1C18",
  foregroundInverse: "#FDFCF8",
  // secondary surfaces
  muted: "#F6F4EF",
  mutedForeground: "#7B766D",
  secondary: "#F0ECE2",
  // the one highlight
  accent: "#2F6E3E",
  accentForeground: "#FBF9F2",
  // 5% accent — the mint fill used behind the offer banner and selected tile
  accentTint: "#F2F7F3",
  // hairlines
  border: "#DED9CF",
  input: "#D4CEBE",
};

// 10 minutes is the post-purchase countdown. Checkout surface has no timer.
export const POST_PURCHASE_OFFER_SECONDS = 600;

// Attribute key written on the upsell cart line so the Shopify Function
// knows to discount it. Must stay in sync with
// extensions/dogbook-upsell-discount/src/run.js.
export const UPSELL_SOURCE_KEY = "_upsell_source";
export const UPSELL_SOURCE_CHECKOUT = "checkout";
