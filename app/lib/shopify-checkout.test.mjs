// Run with: node --test app/lib/shopify-checkout.test.mjs
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { buildCheckoutUrl, numericVariantId } from "./shopify-checkout.server.js";

before(() => { process.env.SHOPIFY_SHOP_DOMAIN = "thedogbook.myshopify.com"; });

const order = {
  id: "clx123",
  shopName: "ABC",
  storeUrl: "abc.com",
  channel: "Both",
  businessAddress: "abc street, 1123",
  invoiceAddress: "abc street, 1123",
};

test("numericVariantId strips GID prefix", () => {
  assert.equal(numericVariantId("gid://shopify/ProductVariant/12345"), "12345");
  assert.equal(numericVariantId("44123456789012"), "44123456789012");
});

test("builds cart URL for all-linked lines", () => {
  const url = buildCheckoutUrl(order, [
    { name: "Beagle", count: 5, variant_id: "111" },
    { name: "Corgi",  count: 3, variant_id: "gid://shopify/ProductVariant/222" },
  ]);
  assert.ok(url.startsWith("https://thedogbook.myshopify.com/cart/111:5,222:3?"));
  assert.ok(url.includes("attributes%5Bwholesale_order_id%5D=clx123"));
  assert.ok(url.includes("checkout%5Bshipping_address%5D%5Baddress1%5D=abc+street%2C+1123"));
  assert.ok(!url.includes("Unlinked"));
});

test("returns null when every line is unlinked", () => {
  const url = buildCheckoutUrl(order, [
    { name: "Beagle", count: 5, variant_id: null },
  ]);
  assert.equal(url, null);
});

test("mixed lines: linked items in cart, unlinked in note", () => {
  const url = buildCheckoutUrl(order, [
    { name: "Beagle", count: 5, variant_id: "111" },
    { name: "Corgi",  count: 3, variant_id: null },
  ]);
  assert.ok(url.includes("/cart/111:5?"));
  assert.ok(decodeURIComponent(url.replace(/\+/g, " ")).includes("Unlinked breeds (add manually): Corgi x3"));
});

test("returns null when SHOPIFY_SHOP_DOMAIN is unset", () => {
  const prev = process.env.SHOPIFY_SHOP_DOMAIN;
  delete process.env.SHOPIFY_SHOP_DOMAIN;
  const url = buildCheckoutUrl(order, [{ name: "Beagle", count: 1, variant_id: "1" }]);
  assert.equal(url, null);
  process.env.SHOPIFY_SHOP_DOMAIN = prev;
});
