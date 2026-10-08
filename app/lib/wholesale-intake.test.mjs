// Run with: node --test app/lib/wholesale-intake.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateIntake, toPrismaCreate, toCents } from "./wholesale-intake.server.js";

const good = () => ({
  shop_name: "The Corner Bookstore",
  store_url: "https://cornerbookstore.com",
  channel: "Both",
  business_address: "123 Main St",
  invoice_address: "123 Main St",
  currency: "USD",
  totals: { units: 10, price: 500 },
  lines: [
    { handle: "beagle", name: "Beagle", count: 10, price: 50, variant_id: "44123", product_title: "Dogbook — Beagle" },
  ],
});

test("valid payload passes", () => {
  assert.equal(validateIntake(good()), null);
});

test("missing shop_name rejected", () => {
  const b = good(); delete b.shop_name;
  assert.deepEqual(validateIntake(b), { shop_name: "required" });
});

test("empty channel rejected", () => {
  const b = good(); b.channel = "";
  assert.ok(validateIntake(b).channel);
});

test("empty lines rejected", () => {
  const b = good(); b.lines = [];
  assert.ok(validateIntake(b).lines);
});

test("nullable variant_id and product_title accepted", () => {
  const b = good();
  b.lines[0].variant_id = null;
  b.lines[0].product_title = null;
  assert.equal(validateIntake(b), null);
});

test("non-string variant_id rejected", () => {
  const b = good(); b.lines[0].variant_id = 123;
  assert.ok(validateIntake(b)["lines[0].variant_id"]);
});

test("toCents avoids float drift", () => {
  assert.equal(toCents(50), 5000);
  assert.equal(toCents(0.1 + 0.2), 30);
  assert.equal(toCents(1499.99), 149999);
});

test("toPrismaCreate maps snake_case to camelCase and dollars to cents", () => {
  const out = toPrismaCreate(good());
  assert.equal(out.shopName, "The Corner Bookstore");
  assert.equal(out.channel, "Both");
  assert.equal(out.totalAmount, 50000);
  assert.equal(out.items.create[0].unitPrice, 5000);
  assert.equal(out.items.create[0].variantId, "44123");
});

test("toPrismaCreate defaults nullable fields to null", () => {
  const b = good();
  b.lines[0].variant_id = undefined;
  b.lines[0].product_title = undefined;
  const out = toPrismaCreate(b);
  assert.equal(out.items.create[0].variantId, null);
  assert.equal(out.items.create[0].productTitle, null);
});
