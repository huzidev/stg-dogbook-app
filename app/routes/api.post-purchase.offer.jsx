import { data } from "react-router";
import { unauthenticated } from "../shopify.server";

const tag = "[post-purchase/offer]";
// ponytail: $app: shorthand resolves to app--<app_id>--post_purchase_offer at
// query time, so we don't have to hardcode the app id.
const METAOBJECT_TYPE = "$app:post_purchase_offer";

// ponytail: public GET endpoint — the extension calls this from Shopify's
// checkout iframe before the user clicks anything, so there's no inputData.token
// to verify yet. The response contains only merchant-configured display data
// (variant list + discount + copy), not secrets. If we ever return anything
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

const parseIds = (raw) =>
  (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

const gidToNumeric = (gid) => (gid ? String(gid).split("/").pop() : null);

const DEFAULT_DISCOUNT = 20;

const normalizeLegacyOffer = (offer) => {
  if (!offer || typeof offer !== "object") return null;
  const variantId = Number(offer.variantId);
  if (!Number.isFinite(variantId) || variantId <= 0) return null;
  return {
    variantIds: [variantId],
    discountPercent:
      offer.discount?.valueType === "percentage"
        ? Number(offer.discount?.value) || DEFAULT_DISCOUNT
        : DEFAULT_DISCOUNT,
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
            references(first: 50) {
              nodes {
                ... on ProductVariant { id }
              }
            }
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
        map[f.key] = f;
      }
      const enabled = map.enabled?.value === "true";
      if (!enabled) return null;

      // Prefer new typed fields; fall back to legacy JSON blob.
      const variantRefs = map.variant_ids?.references?.nodes ?? [];
      let variantIds = variantRefs
        .map((n) => Number(gidToNumeric(n?.id)))
        .filter((n) => Number.isFinite(n) && n > 0);
      let discountPercent = Number(map.discount_percent?.value);
      if (!Number.isFinite(discountPercent) || discountPercent <= 0) {
        discountPercent = DEFAULT_DISCOUNT;
      }

      if (!variantIds.length) {
        let legacy = null;
        try {
          legacy = JSON.parse(map.offer?.value ?? "null");
        } catch {
          // ponytail: malformed legacy JSON — skip entry
        }
        const normalized = normalizeLegacyOffer(legacy);
        if (!normalized) return null;
        variantIds = normalized.variantIds;
        discountPercent = normalized.discountPercent;
      }

      const triggerProductGid = map.trigger_product?.reference?.id ?? null;
      const triggerProductId = gidToNumeric(triggerProductGid);
      const priority = Number(map.priority?.value ?? 0) || 0;
      return { variantIds, discountPercent, triggerProductId, priority };
    })
    .filter(Boolean);

  if (!entries.length) return null;

  const purchased = new Set(purchasedProductIds.map(String));
  const matching = entries.filter(
    (e) => !e.triggerProductId || purchased.has(String(e.triggerProductId)),
  );
  if (!matching.length) return null;

  matching.sort((a, b) => b.priority - a.priority);
  return matching[0];
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
    return normalizeLegacyOffer(JSON.parse(raw));
  } catch {
    return null;
  }
};

const hydrateVariants = async (admin, variantIds) => {
  if (!variantIds.length) return [];
  const gids = variantIds.map(
    (id) => `gid://shopify/ProductVariant/${id}`,
  );
  const resp = await admin.graphql(
    `#graphql
    query HydrateVariants($ids: [ID!]!) {
      nodes(ids: $ids) {
        ... on ProductVariant {
          id
          title
          price
          compareAtPrice
          image { url altText }
          product {
            title
            featuredImage { url altText }
          }
        }
      }
    }`,
    { variables: { ids: gids } },
  );
  const body = await resp.json();
  const nodes = body?.data?.nodes ?? [];
  return nodes
    .map((n) => {
      if (!n?.id) return null;
      const variantGid = n.id;
      const variantId = Number(gidToNumeric(variantGid));
      const image = n.image?.url ?? n.product?.featuredImage?.url ?? null;
      const productTitle = n.product?.title ?? "";
      return {
        variantId,
        variantGid,
        productTitle,
        imageUrl: image,
        price: n.price,
        compareAtPrice: n.compareAtPrice,
      };
    })
    .filter(Boolean);
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

  const productIds = parseIds(url.searchParams.get("product_ids"));

  try {
    const { admin } = await unauthenticated.admin(shop);

    let config = await resolveFromMetaobjects(admin, productIds);
    let source = "metaobject";
    if (!config) {
      config = await resolveFromMetafield(admin);
      source = "metafield";
    }

    if (!config) {
      console.log(`${tag} no offer configured for shop=${shop}`);
      return data(
        { offers: [], discountPercent: DEFAULT_DISCOUNT },
        { status: 200, headers: corsHeaders(request) },
      );
    }

    const offers = await hydrateVariants(admin, config.variantIds);

    console.log(
      `${tag} resolved shop=${shop} source=${source} offers=${offers.length} discount=${config.discountPercent}`,
    );
    return data(
      {
        offers,
        discountPercent: config.discountPercent,
        source,
      },
      { status: 200, headers: corsHeaders(request) },
    );
  } catch (err) {
    console.error(`${tag} lookup failed for shop=${shop}`, err);
    return data(
      { error: "offer lookup failed" },
      { status: 500, headers: corsHeaders(request) },
    );
  }
};

export const action = ({ request }) => {
  if (request.method === "OPTIONS") return preflight(request);
  return data(
    { error: "Method not allowed" },
    { status: 405, headers: corsHeaders(request) },
  );
};
