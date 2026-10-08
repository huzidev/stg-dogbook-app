import { data } from "react-router";
import { unauthenticated } from "../shopify.server";

const tag = "[post-purchase/offer]";
const METAOBJECT_TYPE = "app--post_purchase_offer";

// ponytail: public GET endpoint — the extension calls this from Shopify's
// checkout iframe before the user clicks anything, so there's no inputData.token
// to verify yet. The response contains only merchant-configured display data
// (variant id + discount + copy), not secrets. If we ever return anything
// sensitive here, require a signed token.
const corsHeaders = (request) => ({
  "Access-Control-Allow-Origin": request.headers.get("origin") ?? "*",
  Vary: "Origin",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store",
});

const preflight = (request) =>
  new Response(null, {
    status: 204,
    headers: { ...corsHeaders(request), "Access-Control-Max-Age": "86400" },
  });

const parseProductIds = (raw) =>
  (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

const gidToNumeric = (gid) => (gid ? String(gid).split("/").pop() : null);

const normalizeOffer = (offer) => {
  if (!offer || typeof offer !== "object") return null;
  const variantId = Number(offer.variantId);
  if (!Number.isFinite(variantId) || variantId <= 0) return null;
  return {
    variantId,
    quantity: Math.max(1, Number(offer.quantity) || 1),
    productTitle: String(offer.productTitle ?? ""),
    description: String(offer.description ?? ""),
    imageUrl: offer.imageUrl ? String(offer.imageUrl) : null,
    discount: {
      value: Number(offer.discount?.value ?? 0),
      valueType:
        offer.discount?.valueType === "fixed_amount" ? "fixed_amount" : "percentage",
      title: String(offer.discount?.title ?? "Post-purchase discount"),
    },
  };
};

const resolveFromMetaobjects = async (admin, purchasedProductIds) => {
  const resp = await admin.graphql(`
    #graphql
    query PostPurchaseMetaobjects {
      metaobjects(type: "${METAOBJECT_TYPE}", first: 50) {
        nodes {
          id
          fields {
            key
            value
            reference { ... on Product { id } }
          }
        }
      }
    }
  `);
  const body = await resp.json();
  const nodes = body?.data?.metaobjects?.nodes ?? [];
  if (!nodes.length) return null;

  const entries = nodes
    .map((node) => {
      const map = {};
      for (const f of node.fields ?? []) {
        map[f.key] = { value: f.value, reference: f.reference };
      }
      const enabled = map.enabled?.value === "true";
      if (!enabled) return null;
      let offer;
      try {
        offer = JSON.parse(map.offer?.value ?? "null");
      } catch {
        return null;
      }
      const normalized = normalizeOffer(offer);
      if (!normalized) return null;
      const triggerProductGid = map.trigger_product?.reference?.id ?? null;
      const triggerProductId = gidToNumeric(triggerProductGid);
      const priority = Number(map.priority?.value ?? 0) || 0;
      return { offer: normalized, triggerProductId, priority };
    })
    .filter(Boolean);

  if (!entries.length) return null;

  const purchased = new Set(purchasedProductIds.map(String));
  const matching = entries.filter(
    (e) => !e.triggerProductId || purchased.has(String(e.triggerProductId)),
  );
  if (!matching.length) return null;

  matching.sort((a, b) => b.priority - a.priority);
  return matching[0].offer;
};

const resolveFromMetafield = async (admin) => {
  const resp = await admin.graphql(`
    #graphql
    query PostPurchaseMetafield {
      shop {
        metafield(namespace: "app", key: "post_purchase_offer") { value }
      }
    }
  `);
  const body = await resp.json();
  const raw = body?.data?.shop?.metafield?.value;
  if (!raw) return null;
  try {
    return normalizeOffer(JSON.parse(raw));
  } catch {
    return null;
  }
};

export const loader = async ({ request }) => {
  if (request.method === "OPTIONS") return preflight(request);

  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  if (!shop || !/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(shop)) {
    return data(
      { error: "shop query param required (e.g. foo.myshopify.com)" },
      { status: 400, headers: corsHeaders(request) },
    );
  }

  const productIds = parseProductIds(url.searchParams.get("product_ids"));

  try {
    const { admin } = await unauthenticated.admin(shop);

    // Prefer a matching metaobject entry (B); fall back to shop metafield (A).
    let offer = await resolveFromMetaobjects(admin, productIds);
    let source = "metaobject";
    if (!offer) {
      offer = await resolveFromMetafield(admin);
      source = "metafield";
    }

    if (!offer) {
      console.log(`${tag} no offer configured for shop=${shop}`);
      return data({ offer: null }, { status: 200, headers: corsHeaders(request) });
    }

    console.log(
      `${tag} resolved shop=${shop} source=${source} variantId=${offer.variantId} products=${productIds.length}`,
    );
    return data({ offer, source }, { status: 200, headers: corsHeaders(request) });
  } catch (err) {
    console.error(`${tag} lookup failed for shop=${shop}`, err);
    return data({ error: "offer lookup failed" }, { status: 500, headers: corsHeaders(request) });
  }
};

export const action = ({ request }) => {
  if (request.method === "OPTIONS") return preflight(request);
  return data(
    { error: "Method not allowed" },
    { status: 405, headers: corsHeaders(request) },
  );
};
