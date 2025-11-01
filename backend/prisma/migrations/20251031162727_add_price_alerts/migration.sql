-- CreateTable
CREATE TABLE "price_alerts" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'medium',
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "userProductId" INTEGER,
    "competitorProductId" INTEGER,
    "currentPrice" DOUBLE PRECISION,
    "previousPrice" DOUBLE PRECISION,
    "priceChange" DOUBLE PRECISION,
    "priceChangePercent" DOUBLE PRECISION,
    "targetPrice" DOUBLE PRECISION,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "emailSent" BOOLEAN NOT NULL DEFAULT false,
    "webhookSent" BOOLEAN NOT NULL DEFAULT false,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "price_alerts_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "price_alerts" ADD CONSTRAINT "price_alerts_userProductId_fkey" FOREIGN KEY ("userProductId") REFERENCES "user_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_alerts" ADD CONSTRAINT "price_alerts_competitorProductId_fkey" FOREIGN KEY ("competitorProductId") REFERENCES "competitor_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
