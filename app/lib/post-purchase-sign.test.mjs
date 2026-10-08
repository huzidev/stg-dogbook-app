import { test } from "node:test";
import assert from "node:assert/strict";
import { signChangesetJWT, verifyChangesetJWT } from "./post-purchase-sign.server.js";

const apiKey = "test-api-key";
const apiSecret = "test-api-secret-shhh";
const referenceId = "order-ref-abc-123";
const changes = [
  { type: "add_variant", variantId: 44123456789012, quantity: 1 },
];

test("round-trips a valid JWT", () => {
  const token = signChangesetJWT({ apiKey, apiSecret, referenceId, changes });
  const payload = verifyChangesetJWT(token, apiSecret);
  assert.equal(payload.iss, apiKey);
  assert.equal(payload.sub, referenceId);
  assert.deepEqual(payload.changes, changes);
  assert.ok(payload.jti, "jti nonce present");
  assert.ok(payload.exp > payload.iat, "exp after iat");
});

test("different signings produce different jti", () => {
  const t1 = signChangesetJWT({ apiKey, apiSecret, referenceId, changes });
  const t2 = signChangesetJWT({ apiKey, apiSecret, referenceId, changes });
  assert.notEqual(t1, t2);
});

test("rejects token signed with a different secret", () => {
  const token = signChangesetJWT({ apiKey, apiSecret, referenceId, changes });
  assert.throws(() => verifyChangesetJWT(token, "wrong-secret"), /signature/);
});

test("rejects tampered payload", () => {
  const token = signChangesetJWT({ apiKey, apiSecret, referenceId, changes });
  const [h, , s] = token.split(".");
  const forgedPayload = Buffer.from(JSON.stringify({ iss: apiKey, sub: "evil", changes: [] }))
    .toString("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const tampered = `${h}.${forgedPayload}.${s}`;
  assert.throws(() => verifyChangesetJWT(tampered, apiSecret), /signature/);
});

test("rejects expired token", () => {
  const token = signChangesetJWT({ apiKey, apiSecret, referenceId, changes, ttlSeconds: -10 });
  assert.throws(() => verifyChangesetJWT(token, apiSecret), /expired/);
});

test("rejects malformed token", () => {
  assert.throws(() => verifyChangesetJWT("not-a-jwt", apiSecret), /malformed/);
  assert.throws(() => verifyChangesetJWT("a.b", apiSecret), /malformed/);
});

test("throws on missing inputs", () => {
  assert.throws(() => signChangesetJWT({ apiSecret, referenceId, changes }), /apiKey/);
  assert.throws(() => signChangesetJWT({ apiKey, referenceId, changes }), /apiSecret/);
  assert.throws(() => signChangesetJWT({ apiKey, apiSecret, changes }), /referenceId/);
  assert.throws(() => signChangesetJWT({ apiKey, apiSecret, referenceId, changes: [] }), /non-empty/);
});
