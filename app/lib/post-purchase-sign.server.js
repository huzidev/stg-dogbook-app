import crypto from "node:crypto";

// ponytail: hand-rolled HS256 JWT via node:crypto. ~30 lines beats pulling `jsonwebtoken`
// for one endpoint. Upgrade path: swap in `jsonwebtoken` if we ever need RS256, nbf,
// multiple audiences, or richer claim validation.

const b64url = (buf) =>
  Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const b64urlDecode = (s) =>
  Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");

export function signChangesetJWT({ apiKey, apiSecret, referenceId, changes, ttlSeconds = 60 }) {
  if (!apiKey) throw new Error("apiKey required");
  if (!apiSecret) throw new Error("apiSecret required");
  if (!referenceId) throw new Error("referenceId required");
  if (!Array.isArray(changes) || changes.length === 0) {
    throw new Error("changes must be a non-empty array");
  }

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "HS256", typ: "JWT" };
  const payload = {
    iss: apiKey,
    jti: crypto.randomUUID(),
    iat: now,
    exp: now + ttlSeconds,
    sub: String(referenceId),
    changes,
  };

  const h = b64url(JSON.stringify(header));
  const p = b64url(JSON.stringify(payload));
  const data = `${h}.${p}`;
  const sig = b64url(crypto.createHmac("sha256", apiSecret).update(data).digest());
  return `${data}.${sig}`;
}

export function verifyChangesetJWT(token, apiSecret) {
  if (typeof token !== "string") throw new Error("malformed JWT");
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("malformed JWT");

  const [h, p, s] = parts;
  const expected = b64url(crypto.createHmac("sha256", apiSecret).update(`${h}.${p}`).digest());
  const got = Buffer.from(s);
  const exp = Buffer.from(expected);
  if (got.length !== exp.length || !crypto.timingSafeEqual(got, exp)) {
    throw new Error("bad signature");
  }

  const payload = JSON.parse(b64urlDecode(p).toString("utf8"));
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error("expired");
  }
  return payload;
}
