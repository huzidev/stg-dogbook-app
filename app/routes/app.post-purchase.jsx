import { useEffect, useState } from "react";
import { Form, useActionData, useLoaderData, useNavigation } from "react-router";
import { authenticate } from "../shopify.server";

const METAFIELD_NAMESPACE = "app";
const METAFIELD_KEY = "post_purchase_offer";

const emptyOffer = () => ({
  variantId: "",
  quantity: 1,
  productTitle: "",
  description: "",
  imageUrl: "",
  discount: { value: 10, valueType: "percentage", title: "Post-purchase discount" },
});

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const resp = await admin.graphql(`
    #graphql
    query PostPurchaseOffer {
      shop {
        id
        metafield(namespace: "${METAFIELD_NAMESPACE}", key: "${METAFIELD_KEY}") { id value }
      }
    }
  `);
  const body = await resp.json();
  const shopGid = body?.data?.shop?.id;
  const raw = body?.data?.shop?.metafield?.value;
  let offer = emptyOffer();
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      offer = {
        ...emptyOffer(),
        ...parsed,
        discount: { ...emptyOffer().discount, ...(parsed?.discount ?? {}) },
      };
    } catch {
      // ponytail: ignore malformed metafield, show empty form
    }
  }
  return { offer, shopGid, shopDomain: session.shop };
};

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const form = await request.formData();

  const variantIdRaw = String(form.get("variantId") ?? "").trim();
  const variantId = Number(variantIdRaw);
  if (!variantIdRaw || !Number.isFinite(variantId) || variantId <= 0) {
    return { ok: false, error: "Variant ID is required and must be a positive number." };
  }

  const payload = {
    variantId,
    quantity: Math.max(1, Number(form.get("quantity") ?? 1) || 1),
    productTitle: String(form.get("productTitle") ?? "").trim(),
    description: String(form.get("description") ?? "").trim(),
    imageUrl: String(form.get("imageUrl") ?? "").trim() || null,
    discount: {
      value: Number(form.get("discountValue") ?? 0) || 0,
      valueType:
        String(form.get("discountType") ?? "percentage") === "fixed_amount"
          ? "fixed_amount"
          : "percentage",
      title: String(form.get("discountTitle") ?? "Post-purchase discount").trim() ||
        "Post-purchase discount",
    },
  };

  const shopGid = String(form.get("shopGid") ?? "");
  if (!shopGid) return { ok: false, error: "Missing shop reference." };

  const resp = await admin.graphql(
    `#graphql
    mutation SetPostPurchaseOffer($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields { id namespace key value }
        userErrors { field message }
      }
    }`,
    {
      variables: {
        metafields: [
          {
            ownerId: shopGid,
            namespace: METAFIELD_NAMESPACE,
            key: METAFIELD_KEY,
            type: "json",
            value: JSON.stringify(payload),
          },
        ],
      },
    },
  );
  const body = await resp.json();
  const errors = body?.data?.metafieldsSet?.userErrors ?? [];
  if (errors.length) {
    console.error("[post-purchase/settings] metafieldsSet userErrors", errors);
    return { ok: false, error: errors.map((e) => e.message).join("; ") };
  }
  return { ok: true };
};

export default function PostPurchaseSettings() {
  const { offer, shopGid } = useLoaderData();
  const actionData = useActionData();
  const nav = useNavigation();
  const submitting = nav.state !== "idle";

  const [variantId, setVariantId] = useState(String(offer.variantId ?? ""));
  const [productTitle, setProductTitle] = useState(offer.productTitle ?? "");
  const [imageUrl, setImageUrl] = useState(offer.imageUrl ?? "");

  // ponytail: resource picker lives on window.shopify (App Bridge). Rendering
  // via effect avoids SSR hitting it.
  const [pickerReady, setPickerReady] = useState(false);
  useEffect(() => {
    setPickerReady(typeof window !== "undefined" && Boolean(window.shopify?.resourcePicker));
  }, []);

  const pickVariant = async () => {
    try {
      const picked = await window.shopify.resourcePicker({
        type: "product",
        action: "select",
        multiple: false,
        filter: { variants: true },
      });
      if (!picked?.length) return;
      const product = picked[0];
      const firstVariant = product?.variants?.[0];
      if (!firstVariant?.id) return;
      // GID looks like gid://shopify/ProductVariant/67594204676249
      const numericId = String(firstVariant.id).split("/").pop();
      setVariantId(numericId);
      if (product.title) setProductTitle(product.title);
      if (product.images?.[0]?.originalSrc) setImageUrl(product.images[0].originalSrc);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[post-purchase/settings] picker failed", err);
    }
  };

  return (
    <s-page heading="Post-purchase offer">
      <s-section heading="Offer configuration">
        <s-paragraph>
          Shown to buyers on the thank-you page after their initial payment. Leave the variant
          empty to disable the extension — it will quietly not render.
        </s-paragraph>

        {actionData?.ok && (
          <s-banner tone="success">Saved. The checkout extension will pick this up on the next order.</s-banner>
        )}
        {actionData?.ok === false && (
          <s-banner tone="critical" heading="Could not save">{actionData.error}</s-banner>
        )}

        <Form method="post">
          <input type="hidden" name="shopGid" value={shopGid ?? ""} />

          <s-stack direction="block" gap="loose">
            <s-stack direction="block" gap="tight">
              <s-text-field
                label="Variant ID (numeric)"
                name="variantId"
                value={variantId}
                onInput={(e) => setVariantId(e.currentTarget.value)}
                required
              ></s-text-field>
              {pickerReady && (
                <s-button type="button" onClick={pickVariant}>
                  Browse products…
                </s-button>
              )}
            </s-stack>

            <s-number-field
              label="Quantity"
              name="quantity"
              min="1"
              defaultValue={String(offer.quantity ?? 1)}
            ></s-number-field>

            <s-text-field
              label="Product title (shown to buyer)"
              name="productTitle"
              value={productTitle}
              onInput={(e) => setProductTitle(e.currentTarget.value)}
            ></s-text-field>

            <s-text-area
              label="Description"
              name="description"
              rows="3"
              defaultValue={offer.description ?? ""}
            ></s-text-area>

            <s-text-field
              label="Image URL (optional)"
              name="imageUrl"
              value={imageUrl}
              onInput={(e) => setImageUrl(e.currentTarget.value)}
            ></s-text-field>

            <s-stack direction="inline" gap="base">
              <s-number-field
                label="Discount value"
                name="discountValue"
                min="0"
                defaultValue={String(offer.discount?.value ?? 10)}
              ></s-number-field>
              <s-select
                label="Discount type"
                name="discountType"
                defaultValue={offer.discount?.valueType ?? "percentage"}
              >
                <s-option value="percentage">Percentage (%)</s-option>
                <s-option value="fixed_amount">Fixed amount</s-option>
              </s-select>
            </s-stack>

            <s-text-field
              label="Discount label (shown next to the price)"
              name="discountTitle"
              defaultValue={offer.discount?.title ?? "Post-purchase discount"}
            ></s-text-field>

            <s-stack direction="inline" gap="base">
              <s-button type="submit" variant="primary" loading={submitting || undefined}>
                Save offer
              </s-button>
            </s-stack>
          </s-stack>
        </Form>
      </s-section>
    </s-page>
  );
}
