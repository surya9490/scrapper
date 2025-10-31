/*
  Warnings:

  - You are about to drop the `products` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
DROP TABLE "products";

-- CreateTable
CREATE TABLE "user_products" (
    "id" SERIAL NOT NULL,
    "sku" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "brand" TEXT,
    "category" TEXT,
    "threadCount" TEXT,
    "material" TEXT,
    "size" TEXT,
    "design" TEXT,
    "color" TEXT,
    "shopifyProductId" TEXT,
    "shopifyVariantId" TEXT,
    "currentPrice" DOUBLE PRECISION,
    "titleEmbedding" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competitor_products" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "price" DOUBLE PRECISION,
    "image" TEXT,
    "brand" TEXT,
    "category" TEXT,
    "threadCount" TEXT,
    "material" TEXT,
    "size" TEXT,
    "design" TEXT,
    "color" TEXT,
    "competitorDomain" TEXT NOT NULL,
    "competitorName" TEXT,
    "titleEmbedding" TEXT,
    "imageEmbedding" TEXT,
    "lastScrapedAt" TIMESTAMP(3),
    "scrapingStatus" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "competitor_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_mappings" (
    "id" SERIAL NOT NULL,
    "userProductId" INTEGER NOT NULL,
    "competitorProductId" INTEGER NOT NULL,
    "matchingScore" DOUBLE PRECISION NOT NULL,
    "matchingAlgorithm" TEXT NOT NULL,
    "matchingDetails" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNotes" TEXT,
    "priceMonitoringEnabled" BOOLEAN NOT NULL DEFAULT false,
    "monitoringFrequency" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_histories" (
    "id" SERIAL NOT NULL,
    "userProductId" INTEGER,
    "competitorProductId" INTEGER,
    "price" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "previousPrice" DOUBLE PRECISION,
    "priceChange" DOUBLE PRECISION,
    "priceChangePercent" DOUBLE PRECISION,
    "source" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "price_histories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shopify_stores" (
    "id" SERIAL NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "storeName" TEXT,
    "storeEmail" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "timezone" TEXT,
    "autoSyncPrices" BOOLEAN NOT NULL DEFAULT false,
    "syncFrequency" TEXT,
    "priceUpdateStrategy" TEXT,
    "webhookUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shopify_stores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_queue" (
    "id" SERIAL NOT NULL,
    "jobType" TEXT NOT NULL,
    "jobData" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "scheduledAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "result" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_queue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "upload_batches" (
    "id" SERIAL NOT NULL,
    "filename" TEXT NOT NULL,
    "totalRows" INTEGER NOT NULL,
    "processedRows" INTEGER NOT NULL DEFAULT 0,
    "successRows" INTEGER NOT NULL DEFAULT 0,
    "errorRows" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'processing',
    "errors" TEXT,
    "uploadedBy" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "upload_batches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_products_sku_key" ON "user_products"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "competitor_products_url_key" ON "competitor_products"("url");

-- CreateIndex
CREATE UNIQUE INDEX "product_mappings_userProductId_competitorProductId_key" ON "product_mappings"("userProductId", "competitorProductId");

-- CreateIndex
CREATE UNIQUE INDEX "shopify_stores_shopDomain_key" ON "shopify_stores"("shopDomain");

-- AddForeignKey
ALTER TABLE "product_mappings" ADD CONSTRAINT "product_mappings_userProductId_fkey" FOREIGN KEY ("userProductId") REFERENCES "user_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_mappings" ADD CONSTRAINT "product_mappings_competitorProductId_fkey" FOREIGN KEY ("competitorProductId") REFERENCES "competitor_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_histories" ADD CONSTRAINT "price_histories_userProductId_fkey" FOREIGN KEY ("userProductId") REFERENCES "user_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_histories" ADD CONSTRAINT "price_histories_competitorProductId_fkey" FOREIGN KEY ("competitorProductId") REFERENCES "competitor_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
