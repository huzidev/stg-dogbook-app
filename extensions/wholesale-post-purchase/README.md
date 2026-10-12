# wholesale-post-purchase

Post-purchase one-click upsell screen rendered on the Shopify thank-you page.

Spec: `docs/post-purchase/01-one-click-post-purchase.md`.

Target: `Checkout::PostPurchase::ShouldRender` + `Checkout::PostPurchase::Render`.

Offer source: `/api/post-purchase/offer` (metaobjects first, shop metafield
fallback). Discount is applied inline per the Post-Purchase Extension API —
no Shopify Function is needed on this surface.

Test:
1. Configure ≥ 1 variant + a discount percent in app → Post-purchase settings.
2. Place a test order with any product (or a product matching the metaobject
   trigger if set).
3. On the thank-you page the extension renders before Shopify's own content.
4. Verify order-confirmed row, offer banner countdown ticking, breed carousel
   with selected tile tinted mint, action row with current price.
5. Click `ADD` → `applyChangeset` fires, "Added to your order" panel shows,
   confirm admin order now has 2 line items with the configured % off.
6. Second order, click `No thanks` → declined panel → continue.
7. Third order, let timer hit 00:00 → expired panel.
