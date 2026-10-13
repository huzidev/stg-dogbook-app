import { useEffect, useState } from "react";
import { Form, useActionData, useLoaderData, useNavigation } from "react-router";
import { authenticate } from "../shopify.server";

const METAFIELD_NAMESPACE = "app";
const METAFIELD_KEY = "post_purchase_offer";
const DEFAULT_DISCOUNT = 20;

// STEP-D: Shopify Function discount activation. On first admin-page save we
// find-or-create the automatic app discount that points at our function, then
// on every save we also write the current `discountPercent` to the discount's
// own metafield (namespace `$app`, key `function-configuration`). The
// function reads that metafield each run, so the percent flows from admin
// edits straight through to real checkout totals with no redeploy.
const FUNCTION_HANDLE = "dogbook-upsell-discount";
const FUNCTION_DISCOUNT_TITLE = "Dog Book upsell";
const FUNCTION_METAFIELD_NAMESPACE = "$app";
const FUNCTION_METAFIELD_KEY = "function-configuration";

// ponytail: first-load migration. If the shop metafield is empty but the old
// metaobject still exists, seed from it so the admin page shows the current
// values. First Save writes the new shape and the metaobject can be deleted
// manually from admin. Remove this fallback after the staging migration.
const LEGACY_METAOBJECT_TYPE = "$app:post_purchase_offer";
const LEGACY_METAOBJECT_HANDLE = "default-offer";

const gidToNumeric = (gid) => (gid ? String(gid).split("/").pop() : null);

async function readMetafieldConfig(admin) {
  const resp = await admin.graphql(`#graphql
    query ReadUpsellConfig { shop { metafield(namespace: "app", key: "post_purchase_offer") { value } } }
  `);
  const body = await resp.json();
  const raw = body?.data?.shop?.metafield?.value;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    const variantGids = Array.isArray(parsed?.variantGids)
      ? parsed.variantGids.map(String).filter(Boolean)
      : [];
    const discountPercent = Number(parsed?.discountPercent) || DEFAULT_DISCOUNT;
    if (!variantGids.length) return null;
    return { variantGids, discountPercent };
  } catch {
    return null;
  }
}

async function readLegacyMetaobject(admin) {
  const resp = await admin.graphql(
    `#graphql
    query Legacy($handle: MetaobjectHandleInput!) {
      metaobjectByHandle(handle: $handle) {
        fields {
          key
          value
          references(first: 50) { nodes { ... on ProductVariant { id } } }
        }
      }
    }`,
    { variables: { handle: { type: LEGACY_METAOBJECT_TYPE, handle: LEGACY_METAOBJECT_HANDLE } } },
  );
  const body = await resp.json();
  const node = body?.data?.metaobjectByHandle;
  if (!node) return null;
  const map = {};
  for (const f of node.fields ?? []) map[f.key] = f;
  const variantGids = (map.variant_ids?.references?.nodes ?? [])
    .map((r) => r?.id)
    .filter(Boolean);
  if (!variantGids.length) return null;
  const dp = Number(map.discount_percent?.value);
  return {
    variantGids,
    discountPercent: Number.isFinite(dp) && dp > 0 ? dp : DEFAULT_DISCOUNT,
  };
}

async function hydrateDisplay(admin, variantGids) {
  if (!variantGids.length) return [];
  const resp = await admin.graphql(
    `#graphql
    query HydrateDisplay($ids: [ID!]!) {
      nodes(ids: $ids) {
        ... on ProductVariant {
          id
          title
          price
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
      id: n.id,
      numericId: gidToNumeric(n.id),
      productTitle: n.product?.title ?? n.title ?? "",
      variantTitle: n.title ?? "",
      price: n.price ?? null,
      imageUrl: n.image?.url ?? n.product?.featuredImage?.url ?? null,
    }));
}

async function fetchShopId(admin) {
  const resp = await admin.graphql(`#graphql
    query FetchShopId { shop { id } }
  `);
  const body = await resp.json();
  return body?.data?.shop?.id ?? null;
}

// STEP-D: find an existing automatic app discount for our function by title.
// We can't query by function id directly, so we match on the title we set at
// create time. Idempotent — safe to call on every save.
async function findExistingDiscountId(admin) {
  const resp = await admin.graphql(`#graphql
    query ListDiscounts {
      automaticDiscountNodes(first: 50, query: "status:ACTIVE") {
        nodes {
          id
          automaticDiscount {
            __typename
            ... on DiscountAutomaticApp { title }
          }
        }
      }
    }
  `);
  const body = await resp.json();
  const nodes = body?.data?.automaticDiscountNodes?.nodes ?? [];
  const match = nodes.find(
    (n) => n?.automaticDiscount?.title === FUNCTION_DISCOUNT_TITLE,
  );
  return match?.id ?? null;
}

async function createDiscount(admin, discountPercent) {
  const resp = await admin.graphql(
    `#graphql
    mutation CreateUpsellDiscount($discount: DiscountAutomaticAppInput!) {
      discountAutomaticAppCreate(automaticAppDiscount: $discount) {
        automaticAppDiscount { discountId }
        userErrors { field message }
      }
    }`,
    {
      variables: {
        discount: {
          title: FUNCTION_DISCOUNT_TITLE,
          functionHandle: FUNCTION_HANDLE,
          startsAt: new Date().toISOString(),
          discountClasses: ["PRODUCT"],
          metafields: [{
            namespace: FUNCTION_METAFIELD_NAMESPACE,
            key: FUNCTION_METAFIELD_KEY,
            type: "json",
            value: JSON.stringify({ discountPercent }),
          }],
        },
      },
    },
  );
  const body = await resp.json();
  const errors = body?.data?.discountAutomaticAppCreate?.userErrors ?? [];
  if (errors.length) {
    console.error("[post-purchase/settings] discount create userErrors", errors);
    return null;
  }
  return body?.data?.discountAutomaticAppCreate?.automaticAppDiscount?.discountId ?? null;
}

async function updateDiscountMetafield(admin, discountId, discountPercent) {
  // discountId is a gid like gid://shopify/DiscountAutomaticNode/... — the
  // metafieldsSet mutation accepts it as `ownerId`.
  const resp = await admin.graphql(
    `#graphql
    mutation SetFnConfig($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        userErrors { field message }
      }
    }`,
    {
      variables: {
        metafields: [{
          ownerId: discountId,
          namespace: FUNCTION_METAFIELD_NAMESPACE,
          key: FUNCTION_METAFIELD_KEY,
          type: "json",
          value: JSON.stringify({ discountPercent }),
        }],
      },
    },
  );
  const body = await resp.json();
  const errors = body?.data?.metafieldsSet?.userErrors ?? [];
  if (errors.length) {
    console.error("[post-purchase/settings] fn metafield userErrors", errors);
  }
}

// STEP-D: idempotent "ensure the discount exists and reflects current %".
// Safe to call on every save; a no-op after the first create except for the
// metafield update.
async function syncFunctionDiscount(admin, discountPercent) {
  try {
    let discountId = await findExistingDiscountId(admin);
    if (!discountId) {
      discountId = await createDiscount(admin, discountPercent);
      if (!discountId) return;
    }
    await updateDiscountMetafield(admin, discountId, discountPercent);
  } catch (err) {
    console.error("[post-purchase/settings] syncFunctionDiscount failed", err);
  }
}

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const config =
    (await readMetafieldConfig(admin)) ?? (await readLegacyMetaobject(admin));
  const variants = config ? await hydrateDisplay(admin, config.variantGids) : [];
  return {
    variants,
    discountPercent: config?.discountPercent ?? DEFAULT_DISCOUNT,
    shopDomain: session.shop,
  };
};

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const form = await request.formData();

  const variantGids = form.getAll("variantGids").map((g) => String(g)).filter(Boolean);
  const discountPercent = Math.max(0, Math.min(100, Number(form.get("discountPercent")) || 0));

  if (!variantGids.length) {
    return { ok: false, error: "Pick at least one variant." };
  }

  const shopId = await fetchShopId(admin);
  if (!shopId) return { ok: false, error: "Could not resolve shop id." };

  const resp = await admin.graphql(
    `#graphql
    mutation Save($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        userErrors { field message code }
      }
    }`,
    {
      variables: {
        metafields: [{
          ownerId: shopId,
          namespace: METAFIELD_NAMESPACE,
          key: METAFIELD_KEY,
          type: "json",
          value: JSON.stringify({ variantGids, discountPercent }),
        }],
      },
    },
  );
  const body = await resp.json();
  const errors = body?.data?.metafieldsSet?.userErrors ?? [];
  if (errors.length) {
    console.error("[post-purchase/settings] userErrors", errors);
    return { ok: false, error: errors.map((e) => e.message).join("; ") };
  }

  // STEP-D: keep the Function's discount config in lock-step with the shop
  // metafield. Idempotent — creates the discount on first save, updates its
  // metafield on every subsequent save. Non-fatal: if it fails, the shop
  // metafield save still succeeds and the UI pill still shows the %, we just
  // won't apply the discount at checkout until the next successful sync.
  await syncFunctionDiscount(admin, discountPercent);

  return { ok: true };
};

export default function PostPurchaseSettings() {
  const { variants: loaded, discountPercent: loadedDiscount } = useLoaderData();
  const actionData = useActionData();
  const nav = useNavigation();
  const submitting = nav.state !== "idle";

  const [variants, setVariants] = useState(loaded);
  const [discountPercent, setDiscountPercent] = useState(String(loadedDiscount));

  const [pickerReady, setPickerReady] = useState(false);
  useEffect(() => {
    setPickerReady(
      typeof window !== "undefined" && Boolean(window.shopify?.resourcePicker),
    );
  }, []);

  const addVariants = async () => {
    try {
      const picked = await window.shopify.resourcePicker({
        type: "product",
        action: "select",
        multiple: true,
        filter: { variants: true },
      });
      if (!picked?.length) return;
      // Each `picked` product has a `variants` array; take the first variant of
      // each selected product (consistent with the previous single-variant UX).
      // ponytail: if we need per-variant selection later, open a secondary
      // picker per product.
      const next = [...variants];
      const existing = new Set(variants.map((v) => v.id));
      for (const product of picked) {
        const v = product?.variants?.[0];
        if (!v?.id || existing.has(v.id)) continue;
        next.push({
          id: v.id,
          numericId: gidToNumeric(v.id),
          productTitle: product.title ?? "",
          variantTitle: v.title ?? "",
          price: v.price ?? null,
          imageUrl: product.images?.[0]?.originalSrc ?? null,
        });
        existing.add(v.id);
      }
      setVariants(next);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[post-purchase/settings] picker failed", err);
    }
  };

  const removeAt = (idx) =>
    setVariants(variants.filter((_, i) => i !== idx));

  const moveUp = (idx) => {
    if (idx === 0) return;
    const next = [...variants];
    [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
    setVariants(next);
  };
  const moveDown = (idx) => {
    if (idx === variants.length - 1) return;
    const next = [...variants];
    [next[idx + 1], next[idx]] = [next[idx], next[idx + 1]];
    setVariants(next);
  };

  return (
    <s-page heading="Post-purchase offer">
      <s-paragraph>
        Pick the books that show in the post-purchase + checkout upsell. Both
        surfaces render all of them as a carousel. The discount percent applies
        to any book the buyer picks. Leave the list empty to hide both
        extensions.
      </s-paragraph>

      {actionData?.ok && (
        <s-banner tone="success">
          Saved. Both the post-purchase screen and the checkout right-rail will
          pick this up on the next render.
        </s-banner>
      )}
      {actionData?.ok === false && (
        <s-banner tone="critical" heading="Could not save">
          {actionData.error}
        </s-banner>
      )}

      <Form method="post">
        {variants.map((v) => (
          <input key={v.id} type="hidden" name="variantGids" value={v.id} />
        ))}

        <s-stack direction="block" gap="large-300">
          <s-section heading="Product">
            <s-stack direction="block" gap="base">
              <s-stack direction="inline" gap="base" alignItems="center">
                <s-paragraph>
                  <strong>{variants.length}</strong>{" "}
                  {variants.length === 1 ? "variant" : "variants"} selected
                </s-paragraph>
                {pickerReady && (
                  <s-button type="button" onClick={addVariants}>
                    Add variants
                  </s-button>
                )}
              </s-stack>

              {variants.length === 0 && (
                <s-paragraph tone="subdued">
                  No variants yet. Click &ldquo;Add variants&rdquo; to pick books. Each
                  product&apos;s first variant is used.
                </s-paragraph>
              )}

              {variants.map((v, i) => (
                <s-stack
                  key={v.id}
                  direction="inline"
                  gap="base"
                  alignItems="center"
                >
                  {v.imageUrl ? (
                    <img
                      src={v.imageUrl}
                      alt={v.productTitle}
                      width={48}
                      height={48}
                      style={{ objectFit: "cover" }}
                    />
                  ) : (
                    <s-paragraph tone="subdued">(no image)</s-paragraph>
                  )}
                  <s-stack direction="block" gap="tight">
                    <s-paragraph>
                      <strong>{v.productTitle}</strong>
                    </s-paragraph>
                    <s-paragraph tone="subdued">
                      {v.variantTitle === "Default Title" ? "" : v.variantTitle}{" "}
                      · ID {v.numericId}{" "}
                      {v.price ? `· $${v.price}` : ""}
                    </s-paragraph>
                  </s-stack>
                  <s-button
                    type="button"
                    onClick={() => moveUp(i)}
                    disabled={i === 0 || undefined}
                  >
                    ↑
                  </s-button>
                  <s-button
                    type="button"
                    onClick={() => moveDown(i)}
                    disabled={i === variants.length - 1 || undefined}
                  >
                    ↓
                  </s-button>
                  <s-button type="button" onClick={() => removeAt(i)}>
                    Remove
                  </s-button>
                </s-stack>
              ))}
            </s-stack>
          </s-section>

          <s-section heading="Discount">
            <s-stack direction="block" gap="base">
              <s-number-field
                label="Percent off"
                details="Applies to every variant in the list. Both surfaces show this as the −N% pill."
                name="discountPercent"
                min="0"
                max="100"
                value={discountPercent}
                onInput={(e) => setDiscountPercent(e.currentTarget.value)}
              ></s-number-field>
            </s-stack>
          </s-section>

          <s-stack direction="inline" gap="base" justifyContent="end">
            <s-button type="submit" variant="primary" loading={submitting || undefined}>
              Save offer
            </s-button>
          </s-stack>
        </s-stack>
      </Form>
    </s-page>
  );
}
