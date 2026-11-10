import { useEffect, useState } from "react";
import { Form, useActionData, useLoaderData, useNavigation } from "react-router";
import { authenticate } from "../shopify.server";
import { orderStatusBlockLiveStatus } from "../lib/upsell-surfaces.server";

const METAFIELD_NAMESPACE = "app";
const METAFIELD_KEY = "post_purchase_offer";
const DEFAULT_DISCOUNT = 20;
const DISCOUNT_PRESETS = [10, 15, 20, 25];

// Bound to the JS Shopify Function in extensions/dogbook-upsell-discount.
const FUNCTION_HANDLE = "dogbook-upsell-discount";
const FUNCTION_DISCOUNT_TITLE = "Dog Book upsell";
const FUNCTION_METAFIELD_NAMESPACE = "$app";
const FUNCTION_METAFIELD_KEY = "function-configuration";

const gidToNumeric = (gid) => (gid ? String(gid).split("/").pop() : null);

// ponytail: color palette for the 2-letter avatars so each book keeps the
// same color across the admin list and the preview card.
const AVATAR_PALETTE = [
  "#8A9CB0",
  "#B55A4C",
  "#5B6F3B",
  "#A68B5C",
  "#4F6B4F",
  "#C19A6B",
  "#6B5B95",
  "#88796A",
];
const avatarInitials = (title) =>
  (title ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("") || "?";
const avatarColor = (id) => {
  const s = String(id ?? "");
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length];
};

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
    return {
      variantGids,
      discountPercent,
      active: parsed?.active !== false,
    };
  } catch {
    return null;
  }
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
          inventoryQuantity
          image { url altText }
          product { id title featuredImage { url altText } }
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
      productId: n.product?.id ? gidToNumeric(n.product.id) : null,
      productTitle: n.product?.title ?? n.title ?? "",
      variantTitle: n.title ?? "",
      price: n.price ?? null,
      inventoryQuantity:
        typeof n.inventoryQuantity === "number" ? n.inventoryQuantity : null,
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

async function ensureDefinition(admin, definition) {
  const resp = await admin.graphql(
    `#graphql
    mutation EnsureDef($definition: MetafieldDefinitionInput!) {
      metafieldDefinitionCreate(definition: $definition) {
        userErrors { code }
      }
    }`,
    { variables: { definition } },
  );
  const errors = (await resp.json())?.data?.metafieldDefinitionCreate?.userErrors ?? [];
  const fatal = errors.filter((e) => e.code !== "TAKEN");
  if (fatal.length) console.error("[upsell-offer] definition errors", definition.key, fatal);
}

async function ensureMetafieldDefinitions(admin) {
  await ensureDefinition(admin, {
    namespace: METAFIELD_NAMESPACE,
    key: METAFIELD_KEY,
    name: "Post-purchase offer",
    type: "json",
    ownerType: "SHOP",
  });
  await ensureDefinition(admin, {
    namespace: METAFIELD_NAMESPACE,
    key: "email_upsell_snapshot",
    name: "Email upsell snapshot",
    type: "json",
    ownerType: "SHOP",
  });
}

async function findExistingDiscountId(admin) {
  const resp = await admin.graphql(
    `#graphql
    query FindDiscount($q: String!) {
      discountNodes(first: 5, query: $q) {
        nodes {
          id
          discount {
            __typename
            ... on DiscountAutomaticApp { title }
          }
        }
      }
    }`,
    { variables: { q: `title:"${FUNCTION_DISCOUNT_TITLE}"` } },
  );
  const body = await resp.json();
  const nodes = body?.data?.discountNodes?.nodes ?? [];
  const match = nodes.find(
    (n) =>
      n?.discount?.__typename === "DiscountAutomaticApp" &&
      n?.discount?.title === FUNCTION_DISCOUNT_TITLE,
  );
  return match?.id ?? null;
}

async function createFunctionDiscount(admin, config) {
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
            value: JSON.stringify(config),
          }],
        },
      },
    },
  );
  const body = await resp.json();
  const errors = body?.data?.discountAutomaticAppCreate?.userErrors ?? [];
  if (errors.length) {
    const notFound = errors.some((e) => /not found/i.test(e.message ?? ""));
    if (notFound) {
      console.log("[upsell-offer] function not deployed yet — % won't apply until next `shopify app deploy`.");
    } else {
      console.error("[upsell-offer] discount create userErrors", errors);
    }
    return null;
  }
  return body?.data?.discountAutomaticAppCreate?.automaticAppDiscount?.discountId ?? null;
}

async function updateFunctionConfig(admin, discountId, config) {
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
          value: JSON.stringify(config),
        }],
      },
    },
  );
  const errors = (await resp.json())?.data?.metafieldsSet?.userErrors ?? [];
  if (errors.length) console.error("[upsell-offer] fn metafield userErrors", errors);
}

async function syncFunctionDiscount(admin, config) {
  try {
    let discountId = await findExistingDiscountId(admin);
    if (!discountId) {
      discountId = await createFunctionDiscount(admin, config);
      if (!discountId) return;
    }
    await updateFunctionConfig(admin, discountId, config);
  } catch (err) {
    console.error("[upsell-offer] syncFunctionDiscount failed", err);
  }
}

async function readLastSavedAt(admin) {
  const resp = await admin.graphql(`#graphql
    query LastSaved { shop { metafield(namespace: "app", key: "post_purchase_offer") { updatedAt } } }
  `);
  const body = await resp.json();
  return body?.data?.shop?.metafield?.updatedAt ?? null;
}

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const [config, lastSavedAt, orderStatusStatus] = await Promise.all([
    readMetafieldConfig(admin),
    readLastSavedAt(admin),
    orderStatusBlockLiveStatus(session.shop),
  ]);
  const variants = config ? await hydrateDisplay(admin, config.variantGids) : [];
  return {
    variants,
    discountPercent: config?.discountPercent ?? DEFAULT_DISCOUNT,
    active: config?.active ?? true,
    shopDomain: session.shop,
    lastSavedAt,
    orderStatusStatus,
  };
};

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const form = await request.formData();

  const variantGids = form.getAll("variantGids").map((g) => String(g)).filter(Boolean);
  const discountPercent = Math.max(0, Math.min(100, Number(form.get("discountPercent")) || 0));
  const active = form.get("active") === "on";

  if (!variantGids.length) {
    return { ok: false, error: "Pick at least one variant." };
  }

  const shopId = await fetchShopId(admin);
  if (!shopId) return { ok: false, error: "Could not resolve shop id." };

  await ensureMetafieldDefinitions(admin);

  const hydrated = await hydrateDisplay(admin, variantGids);
  const emailSnapshot = hydrated.map((v) => ({
    variantId: v.numericId,
    productId: v.productId,
    productTitle: v.productTitle,
    imageUrl: v.imageUrl,
    price: v.price,
  }));

  const configPayload = { variantGids, discountPercent, active };

  const resp = await admin.graphql(
    `#graphql
    mutation Save($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields { id key }
        userErrors { field message code }
      }
    }`,
    {
      variables: {
        metafields: [
          {
            ownerId: shopId,
            namespace: METAFIELD_NAMESPACE,
            key: METAFIELD_KEY,
            type: "json",
            value: JSON.stringify(configPayload),
          },
          {
            ownerId: shopId,
            namespace: METAFIELD_NAMESPACE,
            key: "email_upsell_snapshot",
            type: "json",
            value: JSON.stringify(emailSnapshot),
          },
        ],
      },
    },
  );
  const errors = (await resp.json())?.data?.metafieldsSet?.userErrors ?? [];
  if (errors.length) {
    console.error("[upsell-offer] userErrors", errors);
    return { ok: false, error: errors.map((e) => e.message).join("; ") };
  }

  await syncFunctionDiscount(admin, { discountPercent, variantIds: variantGids });

  return { ok: true };
};

function formatSavedAt(iso) {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return null;
  }
}

function priceAfter(price, percent) {
  const n = Number(price);
  const p = Number(percent);
  if (!Number.isFinite(n) || !Number.isFinite(p)) return null;
  return (n * (1 - p / 100)).toFixed(2);
}

export default function UpsellOffer() {
  const {
    variants: loaded,
    discountPercent: loadedDiscount,
    active: loadedActive,
    lastSavedAt,
    orderStatusStatus,
  } = useLoaderData();
  const actionData = useActionData();
  const nav = useNavigation();
  const submitting = nav.state !== "idle";

  const [variants, setVariants] = useState(loaded);
  const [discountPercent, setDiscountPercent] = useState(String(loadedDiscount));
  const [active, setActive] = useState(loadedActive);

  const percentNum = Number(discountPercent) || 0;
  const savedAtLabel = formatSavedAt(lastSavedAt);

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
          inventoryQuantity:
            typeof v.inventoryQuantity === "number" ? v.inventoryQuantity : null,
          imageUrl: product.images?.[0]?.originalSrc ?? null,
        });
        existing.add(v.id);
      }
      setVariants(next);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[upsell-offer] picker failed", err);
    }
  };

  const removeAt = (idx) => setVariants(variants.filter((_, i) => i !== idx));
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
    <s-page heading="Upsell offer">
      <s-stack direction="block" gap="large-300">
        <s-stack direction="inline" gap="base" alignItems="center">
          <s-badge tone={active ? "success" : "neutral"}>
            {active ? "Active" : "Off"}
          </s-badge>
          {savedAtLabel && (
            <s-text type="small" tone="neutral">
              Last saved {savedAtLabel}
            </s-text>
          )}
        </s-stack>

        <s-paragraph>
          Pick the books that show in the order confirmation email and the
          customer account order status page.
        </s-paragraph>

{actionData?.ok && (
          <s-banner tone="success">Saved.</s-banner>
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
          {active && <input type="hidden" name="active" value="on" />}

          <s-grid gridTemplateColumns="2fr 1fr" gap="large-300">
            {/* LEFT COLUMN */}
            <s-stack direction="block" gap="large-300">
              <s-section heading="Products">
                <s-stack direction="block" gap="base">
                  <s-stack
                    direction="inline"
                    gap="base"
                    alignItems="center"
                    justifyContent="space-between"
                  >
                    <s-paragraph tone="subdued">
                      Shown in this order. Use the arrows to reorder. Leave
                      empty to hide the offer.
                    </s-paragraph>
                    {pickerReady && (
                      <s-button type="button" onClick={addVariants}>
                        Add variants
                      </s-button>
                    )}
                  </s-stack>

                  <s-stack
                    direction="inline"
                    gap="base"
                    justifyContent="space-between"
                  >
                    <s-text type="strong">
                      {variants.length}{" "}
                      {variants.length === 1 ? "variant" : "variants"} selected
                    </s-text>
                    {percentNum > 0 && (
                      <s-text type="small" tone="neutral">
                        Price after −{percentNum}%
                      </s-text>
                    )}
                  </s-stack>

                  {variants.length === 0 && (
                    <s-paragraph tone="subdued">
                      No variants yet. Click <strong>Add variants</strong> to
                      pick books.
                    </s-paragraph>
                  )}

                  {variants.map((v, i) => (
                    <ProductRow
                      key={v.id}
                      index={i}
                      variant={v}
                      percent={percentNum}
                      first={i === 0}
                      last={i === variants.length - 1}
                      onUp={() => moveUp(i)}
                      onDown={() => moveDown(i)}
                      onRemove={() => removeAt(i)}
                    />
                  ))}
                </s-stack>
              </s-section>

              <s-section heading="Discount">
                <s-stack direction="block" gap="base">
                  <s-paragraph tone="subdued">
                    Shown as the <strong>−{percentNum || 0}%</strong> pill on
                    both surfaces and applied when the customer buys from the
                    offer.
                  </s-paragraph>
                  <s-stack
                    direction="inline"
                    gap="small-200"
                    alignItems="center"
                  >
                    <div style={{ maxWidth: 140 }}>
                      <s-number-field
                        label="Percent off"
                        name="_discountDisplay"
                        min="0"
                        max="100"
                        suffix="%"
                        value={discountPercent}
                        onInput={(e) =>
                          setDiscountPercent(e.currentTarget.value)
                        }
                      ></s-number-field>
                    </div>
                    {DISCOUNT_PRESETS.map((p) => (
                      <s-button
                        key={p}
                        type="button"
                        variant={
                          Number(discountPercent) === p ? "primary" : "secondary"
                        }
                        onClick={() => setDiscountPercent(String(p))}
                      >
                        {p}%
                      </s-button>
                    ))}
                  </s-stack>
                  <s-text type="small" tone="neutral">
                    Whole numbers from 0 to 100. Set to 0 to show the books
                    without a discount.
                  </s-text>
                </s-stack>
                <input
                  type="hidden"
                  name="discountPercent"
                  value={discountPercent}
                />
              </s-section>

            </s-stack>

            {/* RIGHT COLUMN */}
            <s-stack direction="block" gap="large-300">
              <s-section heading="Status">
                <s-stack direction="block" gap="base">
                  <s-stack
                    direction="inline"
                    gap="base"
                    alignItems="center"
                    justifyContent="space-between"
                  >
                    <s-text type="strong">
                      {active ? "Offer is on" : "Offer is off"}
                    </s-text>
                    <s-switch
                      checked={active || undefined}
                      onChange={(e) => setActive(e.currentTarget.checked)}
                    ></s-switch>
                  </s-stack>
                  <s-paragraph tone="subdued">
                    {active
                      ? "Turn off to hide it everywhere without losing your list."
                      : "No upsell will show in the email or the order status page."}
                  </s-paragraph>
                </s-stack>
              </s-section>

              <s-section heading="Where it shows">
                <s-stack direction="block" gap="small-200">
                  <s-stack
                    direction="inline"
                    gap="base"
                    alignItems="center"
                    justifyContent="space-between"
                  >
                    <s-stack direction="block" gap="small-200">
                      <s-text type="strong">Order confirmation email</s-text>
                      <s-text type="small" tone="neutral">
                        Automatic
                      </s-text>
                    </s-stack>
                    <s-badge tone="success">Live</s-badge>
                  </s-stack>
                  <s-divider />
                  <s-stack
                    direction="inline"
                    gap="base"
                    alignItems="center"
                    justifyContent="space-between"
                  >
                    <s-stack direction="block" gap="small-200">
                      <s-text type="strong">Order status page</s-text>
                      <s-text type="small" tone="neutral">
                        Needs app block
                      </s-text>
                    </s-stack>
                    <s-badge
                      tone={
                        orderStatusStatus === "live" ? "success" : "warning"
                      }
                    >
                      {orderStatusStatus === "live" ? "Live" : "Not added"}
                    </s-badge>
                  </s-stack>
                  <s-link href="/app/upsell-settings">
                    How to add it to the order status page →
                  </s-link>
                </s-stack>
              </s-section>

            </s-stack>
          </s-grid>

          <s-stack
            direction="inline"
            gap="base"
            justifyContent="end"
          >
            <s-button type="submit" variant="primary" loading={submitting || undefined}>
              Save offer
            </s-button>
          </s-stack>
        </Form>
      </s-stack>
    </s-page>
  );
}

function Avatar({ id, title }) {
  return (
    <div
      aria-hidden="true"
      style={{
        width: 40,
        height: 40,
        borderRadius: 6,
        background: avatarColor(id),
        color: "white",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 600,
        fontSize: 13,
        letterSpacing: 0.5,
        flexShrink: 0,
      }}
    >
      {avatarInitials(title)}
    </div>
  );
}

function PositionBadge({ n }) {
  return (
    <div
      aria-hidden="true"
      style={{
        width: 24,
        height: 24,
        borderRadius: "50%",
        background: "#F1F1F1",
        color: "#303030",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 12,
        fontWeight: 600,
        flexShrink: 0,
      }}
    >
      {n}
    </div>
  );
}

function ProductRow({ index, variant, percent, first, last, onUp, onDown, onRemove }) {
  const after = priceAfter(variant.price, percent);
  const showCompare = percent > 0 && after && variant.price;
  const lowStock =
    typeof variant.inventoryQuantity === "number" &&
    variant.inventoryQuantity > 0 &&
    variant.inventoryQuantity <= 3;
  return (
    <s-stack direction="inline" gap="base" alignItems="center">
      <PositionBadge n={index + 1} />
      {variant.imageUrl ? (
        <img
          src={variant.imageUrl}
          alt={variant.productTitle}
          width={40}
          height={40}
          style={{ objectFit: "cover", borderRadius: 6, flexShrink: 0 }}
        />
      ) : (
        <Avatar id={variant.id} title={variant.productTitle} />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <s-stack direction="block" gap="small-200">
          <s-text type="strong">{variant.productTitle}</s-text>
          <s-text type="small" tone="neutral">
            {variant.variantTitle === "Default Title"
              ? ""
              : `${variant.variantTitle} · `}
            ID {variant.numericId}
            {lowStock ? ` · ${variant.inventoryQuantity} in stock` : ""}
          </s-text>
        </s-stack>
      </div>
      <s-stack direction="inline" gap="small-200" alignItems="center">
        {showCompare && (
          <s-text type="small" tone="neutral">
            <s style={{ textDecoration: "line-through" }}>${variant.price}</s>
          </s-text>
        )}
        <s-text type="strong">${after ?? variant.price ?? "—"}</s-text>
      </s-stack>
      <s-button type="button" onClick={onUp} disabled={first || undefined}>
        ↑
      </s-button>
      <s-button type="button" onClick={onDown} disabled={last || undefined}>
        ↓
      </s-button>
      <s-button type="button" onClick={onRemove}>
        Remove
      </s-button>
    </s-stack>
  );
}

