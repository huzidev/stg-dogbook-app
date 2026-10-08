import { data } from "react-router";
import { signChangesetJWT, verifyChangesetJWT } from "../lib/post-purchase-sign.server.js";

const tag = "[post-purchase/sign]";

// ponytail: CORS is permissive because the real auth is the Shopify-signed
// `inputData.token` we verify below. If we ever lock this down, allowlist
// shop.app and *.myshopify.com here.
const corsHeaders = (request) => ({
  "Access-Control-Allow-Origin": request.headers.get("origin") ?? "*",
  "Vary": "Origin",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
});

const preflight = (request) =>
  new Response(null, { status: 204, headers: { ...corsHeaders(request), "Access-Control-Max-Age": "86400" } });

export const loader = ({ request }) => {
  if (request.method === "OPTIONS") return preflight(request);
  return data({ error: "Method not allowed" }, { status: 405, headers: corsHeaders(request) });
};

export async function action({ request }) {
  if (request.method === "OPTIONS") return preflight(request);
  if (request.method !== "POST") {
    return data({ error: "Method not allowed" }, { status: 405, headers: corsHeaders(request) });
  }

  const apiKey = process.env.SHOPIFY_API_KEY;
  const apiSecret = process.env.SHOPIFY_API_SECRET;
  if (!apiKey || !apiSecret) {
    console.error(`${tag} missing SHOPIFY_API_KEY or SHOPIFY_API_SECRET env`);
    return data({ error: "Server misconfigured" }, { status: 500, headers: corsHeaders(request) });
  }

  let body;
  try {
    body = await request.json();
  } catch (err) {
    console.warn(`${tag} invalid JSON: ${err?.message}`);
    return data({ error: "Invalid JSON" }, { status: 400, headers: corsHeaders(request) });
  }

  const { token: shopifyToken, referenceId, changes } = body ?? {};
  if (!shopifyToken || !referenceId || !Array.isArray(changes) || changes.length === 0) {
    console.warn(`${tag} missing fields: token=${!!shopifyToken} referenceId=${!!referenceId} changes=${changes?.length ?? 0}`);
    return data({ error: "token, referenceId, and non-empty changes[] are required" }, { status: 400, headers: corsHeaders(request) });
  }

  // Verify Shopify's token — proves this request came from a real post-purchase extension context.
  let claims;
  try {
    claims = verifyChangesetJWT(shopifyToken, apiSecret);
  } catch (err) {
    console.warn(`${tag} shopify token invalid: ${err.message}`);
    return data({ error: "Invalid or expired token" }, { status: 401, headers: corsHeaders(request) });
  }

  // The sub claim is the order referenceId Shopify authorized. Reject attempts
  // to sign changes for a different order than the one the extension is for.
  if (String(claims.sub) !== String(referenceId)) {
    console.warn(`${tag} referenceId mismatch: token.sub=${claims.sub} body.referenceId=${referenceId}`);
    return data({ error: "referenceId does not match token" }, { status: 403, headers: corsHeaders(request) });
  }

  let signed;
  try {
    signed = signChangesetJWT({ apiKey, apiSecret, referenceId, changes, ttlSeconds: 60 });
  } catch (err) {
    console.error(`${tag} sign failed`, err);
    return data({ error: "Could not sign changes" }, { status: 500, headers: corsHeaders(request) });
  }

  console.log(`${tag} signed changeset referenceId=${referenceId} changes=${changes.length}`);
  return data({ token: signed }, { status: 200, headers: corsHeaders(request) });
}
