-- CreateTable
CREATE TABLE "UpsellConversion" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "shopifyOrderId" TEXT NOT NULL,
    "orderName" TEXT,
    "source" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "productTitle" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "linePrice" INTEGER NOT NULL,
    "discountAmount" INTEGER NOT NULL DEFAULT 0,
    "customerEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UpsellConversion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UpsellConversion_shop_createdAt_idx" ON "UpsellConversion"("shop", "createdAt");

-- CreateIndex
CREATE INDEX "UpsellConversion_shop_source_idx" ON "UpsellConversion"("shop", "source");

-- CreateIndex
CREATE UNIQUE INDEX "UpsellConversion_shop_shopifyOrderId_key" ON "UpsellConversion"("shop", "shopifyOrderId");
