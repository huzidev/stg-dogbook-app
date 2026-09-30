# 01 — Database (Postgres + Prisma)

## Switch Prisma from SQLite to Postgres
Current `prisma/schema.prisma` uses `provider = "sqlite"`. Change to `postgresql`, point at `DATABASE_URL`.

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

Local `.env` (already given by you):
```
DATABASE_URL="postgresql://postgres:root@localhost:5432/dogbook-app"
```

The existing `Session` model already works on Postgres unchanged — no edits needed there beyond the provider swap. The current SQLite migrations in `prisma/migrations/` are SQLite-flavored; we regenerate with `prisma migrate dev --name init_postgres` after the provider switch (this creates a fresh initial migration for Postgres; the old sqlite migration folder can stay for reference or be deleted — I'll ask before deleting).

## New model: `WholesaleOrder`
One table. Line items go in a related table so we can look them up per-order. Nothing fancier — no separate `Address` or `Product` table until the second use case shows up.

```prisma
model WholesaleOrder {
  id                String        @id @default(cuid())
  shopName          String
  storeUrl          String
  channel           String        // "Online" | "Offline" | "Both" — validated in code, no enum
  businessAddress   String
  invoiceAddress    String        // theme sends business address here if "same as" was checked
  currency          String        @default("USD")
  totalUnits        Int           // sum of item counts (theme sends this as totals.units)
  totalAmount       Int           // in cents; converted from wire dollars at ingest
  isPaid            Boolean       @default(false)
  shopifyOrderId    String?       // filled by orders/paid webhook
  shopifyOrderName  String?       // e.g. "#1042", handy for support
  paidAt            DateTime?
  createdAt         DateTime      @default(now())
  updatedAt         DateTime      @updatedAt

  items             WholesaleOrderItem[]

  @@index([isPaid])
  @@index([shopifyOrderId])
}

model WholesaleOrderItem {
  id                String          @id @default(cuid())
  orderId           String
  handle            String          // breed handle, e.g. "beagle"
  name              String          // display name, e.g. "Beagle"
  variantId         String?         // Shopify numeric variant ID; nullable when merchant hasn't linked a product
  productTitle      String?         // Shopify product title; nullable, same reason
  quantity          Int             // maps from wire `count`
  unitPrice         Int             // cents; converted from wire dollars at ingest
  order             WholesaleOrder  @relation(fields: [orderId], references: [id], onDelete: Cascade)

  @@index([orderId])
}
```

Design notes (short):
- **Cents, not decimals.** Wire is dollars, DB is cents (`Int`). Conversion is one line at the API boundary (`Math.round(price * 100)`). Avoids `Decimal` driver quirks and float precision. Trivial to format on read.
- **`channel` is a String, not an enum.** Theme sends exact labels `"Online" | "Offline" | "Both"`. Storing as-is means no mapping layer and no enum migration if the theme adds a fourth option later. Validated in the handler (see `02-*`).
- **Freeform address strings**, matching the theme contract (single textarea per address). Split into structured columns only if Shopify checkout prefill needs it — decision lives in `03-shopify-checkout-redirect.md`.
- **`invoiceAddress` always populated** (theme mirrors businessAddress when "same as"), so no NULL branch on read.
- **`variantId` / `productTitle` nullable** on line items — matches the theme contract; some breeds may not be attached to a Shopify product yet.
- **`totalUnits` stored, not computed.** Theme already sums it; storing avoids a `SUM()` on every read and lets us verify the theme's totals at ingest.

## Migration steps
```bash
# 1. Edit schema.prisma provider → postgresql
# 2. Ensure local Postgres is running and dogbook-app DB exists:
createdb dogbook-app   # or: psql -U postgres -c 'create database "dogbook-app"'
# 3. Regenerate migrations
npx prisma migrate dev --name init_postgres
# 4. Generate client
npx prisma generate
```

`package.json` already has `"setup": "prisma generate && prisma migrate deploy"` — that's what production deploys will run. No script changes needed.

## Skipped, add when
- Separate `Product` / `Variant` tables — skip, add when we need to query across orders by product.
- Structured address (line1/city/postal/country columns) — skip, add when Shopify checkout prefill requires them (see `03-*`).
- Soft delete — skip, add when someone needs recoverable deletes.
