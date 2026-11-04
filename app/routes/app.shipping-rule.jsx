import { useState } from "react";
import { Form, useActionData, useLoaderData, useNavigation } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

const CALLBACK_PATH = "/api/shipping-rates";
const SERVICE_NAME = "Percent of subtotal";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const rule = await prisma.shippingRule.findUnique({ where: { shop: session.shop } });
  const callbackUrl = `${process.env.SHOPIFY_APP_URL ?? ""}${CALLBACK_PATH}?shop=${encodeURIComponent(session.shop)}`;
  return {
    shop: session.shop,
    percent: rule?.percent ?? 0,
    registered: Boolean(rule?.serviceId),
    serviceId: rule?.serviceId ?? null,
    updatedAt: rule?.updatedAt?.toISOString() ?? null,
    callbackUrl,
  };
};

export const action = async ({ request }) => {
  const { session, admin } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = form.get("intent");

  if (intent === "save") {
    const raw = String(form.get("percent") ?? "");
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
      return { ok: false, error: "Percent must be a number." };
    }
    const percent = Math.max(0, Math.min(100, parsed));
    await prisma.shippingRule.upsert({
      where: { shop: session.shop },
      update: { percent },
      create: { shop: session.shop, percent },
    });
    return { ok: true, message: `Saved: ${percent}% of subtotal.` };
  }

  if (intent === "register") {
    const callbackUrl = `${process.env.SHOPIFY_APP_URL}${CALLBACK_PATH}?shop=${encodeURIComponent(session.shop)}`;
    const res = await admin.graphql(
      `#graphql
      mutation CarrierServiceCreate($input: DeliveryCarrierServiceCreateInput!) {
        carrierServiceCreate(input: $input) {
          carrierService { id name }
          userErrors { field message }
        }
      }`,
      {
        variables: {
          input: {
            name: SERVICE_NAME,
            callbackUrl,
            supportsServiceDiscovery: true,
            active: true,
          },
        },
      },
    );
    const payload = await res.json();
    const result = payload?.data?.carrierServiceCreate;
    const userErrors = result?.userErrors ?? [];
    if (userErrors.length) {
      return { ok: false, error: userErrors.map((e) => e.message).join("; ") };
    }
    const serviceId = result?.carrierService?.id ?? null;
    if (!serviceId) {
      return { ok: false, error: `Registration failed: ${JSON.stringify(payload)}` };
    }
    await prisma.shippingRule.upsert({
      where: { shop: session.shop },
      update: { serviceId },
      create: { shop: session.shop, percent: 0, serviceId },
    });
    return { ok: true, message: `Carrier service registered.` };
  }

  return { ok: false, error: "Unknown intent." };
};

const clamp = (n) => Math.max(0, Math.min(100, Number.isFinite(n) ? n : 0));
const money = (cents) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
const shortDate = (iso) =>
  iso ? new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : null;

const PREVIEW_SUBTOTALS_CENTS = [2500, 5000, 10000, 25000];

export default function ShippingRule() {
  const { shop, percent: savedPercent, registered, serviceId, updatedAt, callbackUrl } = useLoaderData();
  const result = useActionData();
  const nav = useNavigation();
  const busy = nav.state !== "idle";

  const [draft, setDraft] = useState(String(savedPercent));
  const draftNum = Number(draft);
  const effective = clamp(draftNum);
  const invalid = draft !== "" && !Number.isFinite(draftNum);

  const handleInput = (e) => {
    const raw = e?.target?.value ?? "";
    if (raw === "") {
      setDraft("");
      return;
    }
    const n = Number(raw);
    if (!Number.isFinite(n)) {
      setDraft(raw);
      return;
    }
    const clamped = Math.max(0, Math.min(100, n));
    const clampedStr = String(clamped);
    if (raw !== clampedStr && e?.target) {
      e.target.value = clampedStr;
    }
    setDraft(clampedStr);
  };

  return (
    <s-page heading="Shipping rule" subheading="Charge a percentage of the cart subtotal as shipping.">
      {result?.message && <s-banner tone="success">{result.message}</s-banner>}
      {result?.error && <s-banner tone="critical">{result.error}</s-banner>}

      <s-section heading="Shipping rate">
        <s-paragraph>
          At checkout, shipping = <strong>percent × cart subtotal</strong>. Values are clamped
          between 0 and 100.
        </s-paragraph>

        <Form method="post">
          <input type="hidden" name="intent" value="save" />
          <s-stack gap="base">
            <s-text-field
              label="Percent"
              name="percent"
              type="number"
              step="0.01"
              min="0"
              max="100"
              defaultValue={String(savedPercent)}
              onInput={handleInput}
              onChange={handleInput}
              suffix="%"
              details={
                invalid
                  ? "Enter a number."
                  : `Buyer pays ${effective}% of their subtotal as shipping.`
              }
              tone={invalid ? "critical" : undefined}
            />

            <s-stack direction="inline" gap="small">
              <s-button type="submit" variant="primary" disabled={busy || invalid}>
                {busy && nav.formData?.get("intent") === "save" ? "Saving…" : "Save"}
              </s-button>
              {updatedAt && (
                <s-text tone="subdued">Last updated {shortDate(updatedAt)}</s-text>
              )}
            </s-stack>
          </s-stack>
        </Form>

        <s-divider />

        <s-heading>Live preview</s-heading>
        <s-paragraph tone="subdued">
          What a buyer would see at checkout at <strong>{effective}%</strong>.
        </s-paragraph>
        <s-table>
          <s-table-header-row>
            <s-table-header>Cart subtotal</s-table-header>
            <s-table-header>Shipping shown</s-table-header>
            <s-table-header>Order total</s-table-header>
          </s-table-header-row>
          <s-table-body>
            {PREVIEW_SUBTOTALS_CENTS.map((sub) => {
              const ship = Math.round(sub * (effective / 100));
              return (
                <s-table-row key={sub}>
                  <s-table-cell>{money(sub)}</s-table-cell>
                  <s-table-cell>{money(ship)}</s-table-cell>
                  <s-table-cell>{money(sub + ship)}</s-table-cell>
                </s-table-row>
              );
            })}
          </s-table-body>
        </s-table>
      </s-section>

      <s-section heading="Carrier service">
        <s-stack gap="base">
          <s-stack direction="inline" gap="small">
            <s-text>Status:</s-text>
            <s-badge tone={registered ? "success" : "warning"}>
              {registered ? "Registered" : "Not registered"}
            </s-badge>
          </s-stack>

          {registered ? (
            <s-paragraph tone="subdued">
              Shopify will call this app for a shipping quote on every checkout.
              Enable it per zone in{" "}
              <s-link href={`https://${shop}/admin/settings/shipping`} target="_blank">
                Settings → Shipping and delivery
              </s-link>
              .
            </s-paragraph>
          ) : (
            <s-paragraph tone="subdued">
              Register once per shop. You can edit the percent anytime afterwards without
              re-registering.
            </s-paragraph>
          )}

          <s-text tone="subdued">Callback URL</s-text>
          <s-box
            padding="small-100"
            background="subdued"
            borderRadius="small-100"
            borderWidth="small"
          >
            <code style={{ wordBreak: "break-all", fontSize: "12px" }}>{callbackUrl}</code>
          </s-box>

          {serviceId && (
            <s-text tone="subdued">Service ID: <code>{serviceId}</code></s-text>
          )}

          {!registered && (
            <Form method="post">
              <input type="hidden" name="intent" value="register" />
              <s-button type="submit" disabled={busy}>
                {busy && nav.formData?.get("intent") === "register"
                  ? "Registering…"
                  : "Register carrier service"}
              </s-button>
            </Form>
          )}
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
