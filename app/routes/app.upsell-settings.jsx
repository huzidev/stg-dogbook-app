import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { orderStatusBlockLiveStatus } from "../lib/upsell-surfaces.server";

async function readConfig(admin) {
  const resp = await admin.graphql(`#graphql
    query ReadCfg { shop { metafield(namespace: "app", key: "post_purchase_offer") { value } } }
  `);
  const raw = (await resp.json())?.data?.shop?.metafield?.value;
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const [config, orderStatusStatus] = await Promise.all([
    readConfig(admin),
    orderStatusBlockLiveStatus(session.shop),
  ]);
  return {
    orderStatusStatus,
    shopDomain: session.shop,
    hasBooks: Array.isArray(config?.variantGids) && config.variantGids.length > 0,
    hasDiscount: Number(config?.discountPercent) > 0,
  };
};

export default function UpsellSettings() {
  const { orderStatusStatus, shopDomain, hasBooks, hasDiscount } =
    useLoaderData();

  const blockInstalled = orderStatusStatus === "live";
  const stepsDone = [hasBooks, hasDiscount, blockInstalled].filter(Boolean).length;

  const openCheckoutEditor = () => {
    const url = `https://${shopDomain}/admin/settings/checkout`;
    if (typeof window !== "undefined") {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <s-page heading="Settings">
      <s-stack direction="block" gap="large-300">
        <s-paragraph>
          Set up where the upsell appears and how it looks to customers.
        </s-paragraph>

        <s-grid gridTemplateColumns="2fr 1fr" gap="large-300">
          {/* LEFT COLUMN */}
          <s-section heading="Show the upsell on the order status page">
            <s-stack direction="block" gap="base">
              <s-stack
                direction="inline"
                gap="base"
                alignItems="center"
                justifyContent="space-between"
              >
                <s-paragraph tone="subdued">
                  Add the Book Upsell app block in the checkout editor.
                  Takes about a minute.
                </s-paragraph>
                <s-badge tone={blockInstalled ? "success" : "warning"}>
                  {blockInstalled ? "Added" : "Not added"}
                </s-badge>
              </s-stack>

              <s-divider />

              <WalkStep
                n={1}
                title="Open the checkout editor"
                body={
                  <>
                    In Shopify admin, go to <strong>Settings → Checkout</strong>{" "}
                    and click <strong>Customize</strong>.
                  </>
                }
                action={
                  <s-button type="button" onClick={openCheckoutEditor}>
                    Open checkout editor ↗
                  </s-button>
                }
              />
              <WalkStep
                n={2}
                title="Switch to the Order status page"
                body={
                  <>
                    Use the page selector at the top of the editor and choose{" "}
                    <strong>Order status</strong>.
                  </>
                }
              />
              <WalkStep
                n={3}
                title="Add the app block"
                body={
                  <>
                    In the left sidebar click <strong>Add app block</strong>,
                    then pick <strong>Book Upsell · Upsell books</strong>.
                  </>
                }
              />
              <WalkStep
                n={4}
                title="Place it where you want"
                body={
                  <>
                    Drag the block to move it. We recommend right under the
                    order details so customers see it first.
                  </>
                }
              />
              <WalkStep
                n={5}
                title="Save"
                body={
                  <>
                    Click <strong>Save</strong> in the top right of the editor.
                    Come back here and the status will switch to{" "}
                    <s-badge tone="success">Added</s-badge>.
                  </>
                }
              />
            </s-stack>
          </s-section>

          {/* RIGHT COLUMN */}
          <s-stack direction="block" gap="large-300">
            <s-section heading="Setup progress">
              <s-stack direction="block" gap="base">
                <s-text type="small" tone="neutral">
                  {stepsDone} of 3 done
                </s-text>
                <SetupCheckItem done={hasBooks} label="Pick upsell books" />
                <SetupCheckItem done={hasDiscount} label="Set a discount" />
                <SetupCheckItem
                  done={blockInstalled}
                  label="Add block to order status page"
                />
              </s-stack>
            </s-section>

            <s-section heading="Customer accounts">
              <s-paragraph>
                The order status page is part of customer accounts. If
                customers can&apos;t sign in to see order status, turn on
                customer accounts in <strong>Settings → Customer accounts</strong>.
              </s-paragraph>
            </s-section>
          </s-stack>
        </s-grid>
      </s-stack>
    </s-page>
  );
}

function WalkStep({ n, title, body, action }) {
  return (
    <s-stack direction="inline" gap="base" alignItems="start">
      <div
        aria-hidden="true"
        style={{
          width: 28,
          height: 28,
          borderRadius: "50%",
          background: "#1A1A1A",
          color: "white",
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
      <div style={{ flex: 1, minWidth: 0 }}>
        <s-stack direction="block" gap="small-200">
          <s-text type="strong">{title}</s-text>
          <s-paragraph>{body}</s-paragraph>
        </s-stack>
      </div>
      {action}
    </s-stack>
  );
}

function SetupCheckItem({ done, label }) {
  return (
    <s-stack direction="inline" gap="small-200" alignItems="center">
      <div
        aria-hidden="true"
        style={{
          width: 20,
          height: 20,
          borderRadius: "50%",
          background: done ? "#008060" : "transparent",
          border: done ? "none" : "2px dashed #BBBBBB",
          color: "white",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 12,
          fontWeight: 700,
          flexShrink: 0,
        }}
      >
        {done ? "✓" : ""}
      </div>
      <s-text tone={done ? "neutral" : "subdued"}>{label}</s-text>
    </s-stack>
  );
}
