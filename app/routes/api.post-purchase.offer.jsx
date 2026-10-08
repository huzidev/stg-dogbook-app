import { data } from "react-router";
import { unauthenticated } from "../shopify.server";

const tag = "[post-purchase/offer]";

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
    const resp = await admin.graphql(`
      #graphql
      query PostPurchaseOffer {
        shop {
          metafield(namespace: "app", key: "post_purchase_offer") { value }
        }
      }
    `);
    const body = await resp.json();
    const raw = body?.data?.shop?.metafield?.value;
    if (!raw) {
      console.log(`${tag} no metafield set for shop=${shop}`);
      return data({ offer: null }, { status: 200, headers: corsHeaders(request) });
    }

    let offer;
    try {
      offer = JSON.parse(raw);
    } catch {
      console.warn(`${tag} metafield value for shop=${shop} is not valid JSON`);
      return data({ offer: null }, { status: 200, headers: corsHeaders(request) });
    }

    if (!offer?.variantId) {
      console.warn(`${tag} metafield for shop=${shop} missing variantId`);
      return data({ offer: null }, { status: 200, headers: corsHeaders(request) });
    }

    console.log(`${tag} resolved offer for shop=${shop} variantId=${offer.variantId}`);
    return data({ offer }, { status: 200, headers: corsHeaders(request) });
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
