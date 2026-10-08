// One-off migration: add a "Tier" option (Retail + Wholesale) to every active product.
// - Retail inherits existing price + inventory (unchanged).
// - Wholesale is $50, qty 888, at the store's first active location.
//
// Auth: uses Shopify CLI's stored session. Run once first:
//   shopify store auth --store the-dog-book-171j00mq.myshopify.com \
//     --scopes write_products,write_inventory,read_locations
//
// Usage (from app repo root):
//   node scripts/add-wholesale-variants.mjs --dry-run
//   node scripts/add-wholesale-variants.mjs
//
// Optional env:
//   SHOPIFY_STORE=the-dog-book-171j00mq.myshopify.com   (default)
//   WHOLESALE_LOCATION_NAME="848 Brickell Ave"          (defaults to first active location)
//
// Idempotent: skips products that already have a Tier option.

import { spawnSync } from "node:child_process";

const STORE = process.env.SHOPIFY_STORE ?? "the-dog-book-171j00mq.myshopify.com";
const WHOLESALE_PRICE = "50.00";
const WHOLESALE_QTY = 888;
const LOCATION_NAME = process.env.WHOLESALE_LOCATION_NAME ?? null;
const DRY_RUN = process.argv.includes("--dry-run");
const LIMIT_ARG = process.argv.find((a) => a.startsWith("--limit="));
const LIMIT = LIMIT_ARG ? parseInt(LIMIT_ARG.split("=")[1], 10) : Infinity;

function gql(query, variables = {}, { mutation = false } = {}) {
  const args = ["store", "execute", "--json", "--store", STORE, "--query", query];
  if (Object.keys(variables).length) args.push("--variables", JSON.stringify(variables));
  if (mutation) args.push("--allow-mutations");
  const res = spawnSync("shopify", args, { encoding: "utf8" });
  if (res.status !== 0) {
    throw new Error(`shopify store execute failed (exit ${res.status}): ${res.stderr || res.stdout}`);
  }
  // --json: stdout is the GraphQL `data` payload directly (no outer envelope).
  const parsed = JSON.parse(res.stdout);
  if (parsed.errors) throw new Error(`GraphQL errors: ${JSON.stringify(parsed.errors)}`);
  return parsed;
}

function pickLocation() {
  const data = gql(`{
    locations(first: 25, query: "status:active") { nodes { id name } }
  }`);
  const locs = data.locations.nodes;
  if (!locs.length) throw new Error("No active locations found");
  if (LOCATION_NAME) {
    const match = locs.find((l) => l.name === LOCATION_NAME);
    if (!match) throw new Error(`Location "${LOCATION_NAME}" not found. Have: ${locs.map((l) => l.name).join(", ")}`);
    return match;
  }
  return locs[0];
}

function* listActiveProducts() {
  let cursor = null;
  do {
    const data = gql(
      `query($cursor: String) {
        products(first: 50, after: $cursor, query: "status:active") {
          pageInfo { hasNextPage endCursor }
          nodes {
            id
            title
            handle
            options { id name }
            variants(first: 10) {
              nodes {
                id
                title
                inventoryQuantity
                inventoryItem { id }
              }
            }
          }
        }
      }`,
      { cursor },
    );
    for (const p of data.products.nodes) yield p;
    cursor = data.products.pageInfo.hasNextPage ? data.products.pageInfo.endCursor : null;
  } while (cursor);
}

function addTierOption(productId) {
  const data = gql(
    `mutation($productId: ID!, $options: [OptionCreateInput!]!) {
      productOptionsCreate(productId: $productId, options: $options, variantStrategy: CREATE) {
        userErrors { field message code }
        product {
          variants(first: 10) {
            nodes {
              id
              selectedOptions { name value }
              inventoryItem { id tracked }
            }
          }
        }
      }
    }`,
    {
      productId,
      options: [{ name: "Tier", values: [{ name: "Retail" }, { name: "Wholesale" }] }],
    },
    { mutation: true },
  );
  const errs = data.productOptionsCreate.userErrors;
  if (errs.length) throw new Error(`productOptionsCreate: ${JSON.stringify(errs)}`);
  return data.productOptionsCreate.product.variants.nodes;
}

function setWholesalePriceAndTracking(productId, variantId) {
  const data = gql(
    `mutation($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
      productVariantsBulkUpdate(productId: $productId, variants: $variants) {
        userErrors { field message }
      }
    }`,
    {
      productId,
      variants: [{ id: variantId, price: WHOLESALE_PRICE, inventoryItem: { tracked: true } }],
    },
    { mutation: true },
  );
  const errs = data.productVariantsBulkUpdate.userErrors;
  if (errs.length) throw new Error(`productVariantsBulkUpdate: ${JSON.stringify(errs)}`);
}

function getOnHand(inventoryItemId, locationId) {
  const data = gql(
    `query($id: ID!, $locationId: ID!) {
      inventoryItem(id: $id) {
        inventoryLevel(locationId: $locationId) {
          quantities(names: ["on_hand"]) { name quantity }
        }
      }
    }`,
    { id: inventoryItemId, locationId },
  );
  const q = data.inventoryItem?.inventoryLevel?.quantities?.find((x) => x.name === "on_hand");
  return q?.quantity ?? 0;
}

function setOnHand(inventoryItemId, locationId, quantity) {
  // Current API requires changeFromQuantity (concurrency guard): the on_hand value we expect
  // to find at the location. Query it fresh so a stale cached count can't block the mutation.
  const changeFromQuantity = getOnHand(inventoryItemId, locationId);
  if (changeFromQuantity === quantity) return;
  const data = gql(
    `mutation($input: InventorySetOnHandQuantitiesInput!) {
      inventorySetOnHandQuantities(input: $input) @idempotent(key: "wh-set-${inventoryItemId}-${quantity}") {
        userErrors { field message }
      }
    }`,
    {
      input: {
        reason: "correction",
        setQuantities: [{ inventoryItemId, locationId, quantity, changeFromQuantity }],
      },
    },
    { mutation: true },
  );
  const errs = data.inventorySetOnHandQuantities.userErrors;
  if (errs.length) throw new Error(`inventorySetOnHandQuantities: ${JSON.stringify(errs)}`);
}

function processProduct(product, location) {
  const hasTier = product.options.some((o) => o.name.toLowerCase() === "tier");

  // Resume path: Tier already added (prior partial run). Check Wholesale qty and top up if needed.
  if (hasTier) {
    const existingWholesale = product.variants.nodes.find((v) => v.title === "Wholesale");
    if (!existingWholesale) {
      console.log(`[skip] ${product.handle}: has Tier option but no Wholesale variant`);
      return "skipped";
    }
    if (existingWholesale.inventoryQuantity === WHOLESALE_QTY) {
      console.log(`[skip] ${product.handle}: Wholesale already at qty=${WHOLESALE_QTY}`);
      return "skipped";
    }
    if (DRY_RUN) {
      console.log(`[dry]  ${product.handle}: would set Wholesale qty ${existingWholesale.inventoryQuantity} → ${WHOLESALE_QTY}`);
      return "dry";
    }
    setOnHand(existingWholesale.inventoryItem.id, location.id, WHOLESALE_QTY);
    console.log(`[ok]   ${product.handle}: Wholesale qty ${existingWholesale.inventoryQuantity} → ${WHOLESALE_QTY} @ ${location.name}`);
    return "ok";
  }

  // Fresh path: product has no Tier yet.
  if (product.variants.nodes.length !== 1) {
    console.log(`[skip] ${product.handle}: has ${product.variants.nodes.length} variants, expected 1`);
    return "skipped";
  }
  if (DRY_RUN) {
    console.log(`[dry]  ${product.handle}: would add Tier=[Retail,Wholesale] (Wholesale @$${WHOLESALE_PRICE} qty=${WHOLESALE_QTY} @ ${location.name})`);
    return "dry";
  }

  const variants = addTierOption(product.id);
  const wholesale = variants.find((v) =>
    v.selectedOptions.some((o) => o.name === "Tier" && o.value === "Wholesale"),
  );
  if (!wholesale) throw new Error("Wholesale variant not found after productOptionsCreate");

  setWholesalePriceAndTracking(product.id, wholesale.id);
  setOnHand(wholesale.inventoryItem.id, location.id, WHOLESALE_QTY);

  console.log(`[ok]   ${product.handle}: Wholesale @$${WHOLESALE_PRICE} qty=${WHOLESALE_QTY} @ ${location.name}`);
  return "ok";
}

function main() {
  console.log(`store=${STORE} dry=${DRY_RUN}`);
  const location = pickLocation();
  console.log(`location=${location.name} (${location.id})`);

  const counts = { ok: 0, skipped: 0, dry: 0, err: 0 };
  let processed = 0;
  for (const product of listActiveProducts()) {
    if (processed >= LIMIT) break;
    processed++;
    try {
      const result = processProduct(product, location);
      counts[result]++;
    } catch (e) {
      counts.err++;
      console.error(`[err]  ${product.handle}: ${e.message}`);
    }
  }
  console.log(`done: ok=${counts.ok} skipped=${counts.skipped} dry=${counts.dry} err=${counts.err}`);
}

main();
