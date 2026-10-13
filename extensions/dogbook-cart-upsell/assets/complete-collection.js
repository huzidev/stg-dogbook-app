// Complete your collection — cart upsell.
// Design: docs/post-purchase-design-lovable/src/routes/panier.tsx
// ponytail: location.reload() after add. Dawn-style themes also get a
// cart:refresh event; if the live theme has its own hook, swap it in.

(() => {
  const mount = document.querySelector("[data-dbk-upsell]");
  if (!mount || mount.dataset.dbkMounted) return;
  mount.dataset.dbkMounted = "1";

  const APP_URL = mount.dataset.appUrl;
  const SHOP_DOMAIN = mount.dataset.shopDomain;

  const money = (v) =>
    new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: window.Shopify?.currency?.active || "USD",
    }).format(Number(v));

  const gidFromVariantId = (id) => `gid://shopify/ProductVariant/${id}`;

  const PLUS_SVG =
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3v10M3 8h10"/></svg>';
  const CHECK_SVG =
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 8l3 3 7-7"/></svg>';

  const main = async () => {
    const [cart, offersResp] = await Promise.all([
      fetch("/cart.js", { credentials: "same-origin" }).then((r) => r.json()),
      fetch(
        `${APP_URL}/api/post-purchase/offer?shop=${encodeURIComponent(SHOP_DOMAIN)}`,
      ).then((r) => r.json()),
    ]);

    const cartVariantGids = (cart?.items ?? []).map((i) =>
      gidFromVariantId(i.variant_id),
    );
    const offers = (offersResp?.offers ?? []).filter(
      (o) => !cartVariantGids.includes(o.variantGid),
    );
    const percent = Number(offersResp?.discountPercent) || 20;

    if (!offers.length) {
      mount.hidden = true;
      return;
    }

    render(offers, percent);
  };

  const render = (offers, percent) => {
    const first = offers[0];
    const original = Number(first.compareAtPrice ?? first.price);
    const discounted = (original * (1 - percent / 100)).toFixed(2);
    const saved = (original - Number(discounted)).toFixed(2);

    const card = document.createElement("section");
    card.className = "dbk-upsell-card";
    card.innerHTML = `
      <div class="dbk-upsell-head">
        <p class="dbk-upsell-title">Complete your collection</p>
        <span class="dbk-upsell-chip">${percent}% off</span>
      </div>
      <p class="dbk-upsell-sub">
        Add a second book and pay
        <s>${money(original)}</s>
        <strong>${money(discounted)}</strong>
        — you save ${money(saved)}.
      </p>
      <div class="dbk-upsell-list-wrap">
        <div class="dbk-upsell-list" role="list"></div>
        <div class="dbk-upsell-list-fade"></div>
      </div>
    `;
    const list = card.querySelector(".dbk-upsell-list");
    const wrap = card.querySelector(".dbk-upsell-list-wrap");

    for (const offer of offers) {
      const row = document.createElement("div");
      row.className = "dbk-upsell-row";
      row.setAttribute("role", "listitem");
      const img = offer.imageUrl
        ? `<img class="dbk-upsell-row-thumb" src="${offer.imageUrl}" alt="" loading="lazy">`
        : `<div class="dbk-upsell-row-thumb" aria-hidden="true"></div>`;
      row.innerHTML = `
        ${img}
        <span class="dbk-upsell-row-title">${offer.productTitle}</span>
        <button type="button" class="dbk-upsell-row-btn"
          aria-label="Add ${offer.productTitle}">${PLUS_SVG}</button>
      `;
      const btn = row.querySelector("button");
      btn.addEventListener("click", () => addLine(offer, btn));
      list.appendChild(row);
    }

    const updateFade = () => {
      const atEnd = list.scrollHeight - list.scrollTop - list.clientHeight < 8;
      wrap.toggleAttribute("data-at-end", atEnd);
    };
    list.addEventListener("scroll", updateFade);
    updateFade();

    mount.replaceChildren(card);
  };

  const addLine = async (offer, btn) => {
    btn.disabled = true;
    try {
      const id = Number(offer.variantGid.split("/").pop());
      const resp = await fetch("/cart/add.js", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          id,
          quantity: 1,
          properties: { _upsell_source: "cart" },
        }),
      });
      if (!resp.ok) throw new Error(`cart/add failed: ${resp.status}`);
      btn.setAttribute("data-added", "");
      btn.innerHTML = CHECK_SVG;
      document.dispatchEvent(new CustomEvent("cart:refresh", { bubbles: true }));
      setTimeout(() => location.reload(), 400);
    } catch (err) {
      console.error("[dbk-upsell]", err);
      btn.disabled = false;
    }
  };

  main().catch((err) => {
    console.error("[dbk-upsell]", err);
    mount.hidden = true;
  });
})();
