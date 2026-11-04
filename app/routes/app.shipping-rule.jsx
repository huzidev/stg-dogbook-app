import { Form, useActionData, useLoaderData, useNavigation } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

const CALLBACK_PATH = "/api/shipping-rates";
const SERVICE_NAME = "Percent of subtotal";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const rule = await prisma.shippingRule.findUnique({ where: { shop: session.shop } });
  return {
    shop: session.shop,
    percent: rule?.percent ?? 0,
    registered: Boolean(rule?.serviceId),
  };
};

export const action = async ({ request }) => {
  const { session, admin } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = form.get("intent");

  if (intent === "save") {
    const raw = String(form.get("percent") ?? "");
    const percent = Number(raw);
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
      return { ok: false, error: "Percent must be a number between 0 and 100." };
    }
    await prisma.shippingRule.upsert({
      where: { shop: session.shop },
      update: { percent },
      create: { shop: session.shop, percent },
    });
    return { ok: true, message: `Saved: ${percent}% of subtotal.` };
  }

  if (intent === "register") {
    const callbackUrl = `${process.env.SHOPIFY_APP_URL}${CALLBACK_PATH}?shop=${encodeURIComponent(session.shop)}`;
    const res = await admin.rest.post({
      path: "carrier_services",
      data: {
        carrier_service: {
          name: SERVICE_NAME,
          callback_url: callbackUrl,
          service_discovery: true,
        },
      },
    });
    const body = await res.json().catch(() => ({}));
    const serviceId = body?.carrier_service?.id ? String(body.carrier_service.id) : null;
    if (!serviceId) {
      return { ok: false, error: `Registration failed: ${JSON.stringify(body)}` };
    }
    await prisma.shippingRule.upsert({
      where: { shop: session.shop },
      update: { serviceId },
      create: { shop: session.shop, percent: 0, serviceId },
    });
    return { ok: true, message: `Carrier service registered (id ${serviceId}).` };
  }

  return { ok: false, error: "Unknown intent." };
};

export default function ShippingRule() {
  const { percent, registered } = useLoaderData();
  const result = useActionData();
  const nav = useNavigation();
  const busy = nav.state !== "idle";

  return (
    <s-page heading="Shipping rule">
      <s-section heading="Percent of subtotal">
        <s-paragraph>
          Shipping cost shown at checkout = <strong>percent × cart subtotal</strong>.
          Register the carrier service once per shop, then edit the percent anytime.
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
              defaultValue={String(percent)}
              suffix="%"
            />
            <s-button type="submit" variant="primary" disabled={busy}>
              Save
            </s-button>
          </s-stack>
        </Form>

        <s-divider />

        <Form method="post">
          <input type="hidden" name="intent" value="register" />
          <s-stack gap="base">
            <s-paragraph>
              Carrier service status:{" "}
              <s-badge tone={registered ? "success" : "warning"}>
                {registered ? "Registered" : "Not registered"}
              </s-badge>
            </s-paragraph>
            {!registered && (
              <s-button type="submit" disabled={busy}>
                Register carrier service
              </s-button>
            )}
          </s-stack>
        </Form>

        {result?.message && <s-banner tone="success">{result.message}</s-banner>}
        {result?.error && <s-banner tone="critical">{result.error}</s-banner>}
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
