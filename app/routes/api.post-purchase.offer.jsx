import { data } from "react-router";
import { unauthenticated } from "../shopify.server";

const tag = "[post-purchase/offer]";
const DEFAULT_DISCOUNT = 20;

// ponytail: public GET endpoint — the post-purchase iframe calls this before
// the user has clicked anything, so there's no inputData.token yet. The body
// contains only merchant-configured display data (variant list + percent).
// Do not add secrets here without wiring token auth.
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

const gidToNumeric = (gid) => (gid ? String(gid).split("/").pop() : null);

async function readConfig(admin) {
  const resp = await admin.graphql(`#graphql
    query PostPurchaseOffer {
      shop { metafield(namespace: "app", key: "post_purchase_offer") { value } }
    }`);
  const body = await resp.json();
  const raw = body?.data?.shop?.metafield?.value;
  if (!raw) return null;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const variantGids = Array.isArray(parsed?.variantGids)
    ? parsed.variantGids.map(String).filter(Boolean)
    : [];
  const discountPercent = Number(parsed?.discountPercent) || DEFAULT_DISCOUNT;
  if (!variantGids.length) return null;
  return { variantGids, discountPercent };
}

async function hydrateVariants(admin, variantGids) {
  const resp = await admin.graphql(
    `#graphql
    query HydrateVariants($ids: [ID!]!) {
      nodes(ids: $ids) {
        ... on ProductVariant {
          id
          price
          compareAtPrice
          image { url altText }
          product { title featuredImage { url altText } }
        }
      }
    }`,
    { variables: { ids: variantGids } },
  );
  const body = await resp.json();
  return (body?.data?.nodes ?? [])
    .filter((n) => n?.id)
    .map((n) => ({
      variantId: Number(gidToNumeric(n.id)),
      variantGid: n.id,
      productTitle: n.product?.title ?? "",
      imageUrl: n.image?.url ?? n.product?.featuredImage?.url ?? null,
      price: n.price,
      compareAtPrice: n.compareAtPrice,
    }));
}

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

  try {
    const { admin } = await unauthenticated.admin(shop);
    const config = await readConfig(admin);
    if (!config) {
      console.log(`${tag} no offer configured for shop=${shop}`);
      return data(
        { offers: [], discountPercent: DEFAULT_DISCOUNT },
        { status: 200, headers: corsHeaders(request) },
      );
    }
    const offers = await hydrateVariants(admin, config.variantGids);
    console.log(
      `${tag} shop=${shop} offers=${offers.length} discount=${config.discountPercent}`,
    );
    return data(
      { offers, discountPercent: config.discountPercent },
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
