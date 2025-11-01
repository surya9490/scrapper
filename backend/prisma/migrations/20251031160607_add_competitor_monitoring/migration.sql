-- AlterTable
ALTER TABLE "upload_batches" ADD COLUMN     "targetWebsite" TEXT,
ADD COLUMN     "uploadType" TEXT NOT NULL DEFAULT 'manual';

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monitoring_jobs" (
    "id" SERIAL NOT NULL,
    "uploadBatchId" INTEGER,
    "jobName" TEXT NOT NULL,
    "jobType" TEXT NOT NULL,
    "frequency" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "priceThreshold" DOUBLE PRECISION,
    "stockMonitoring" BOOLEAN NOT NULL DEFAULT true,
    "ratingMonitoring" BOOLEAN NOT NULL DEFAULT false,
    "nextRunAt" TIMESTAMP(3),
    "lastRunAt" TIMESTAMP(3),
    "totalProducts" INTEGER NOT NULL DEFAULT 0,
    "activeProducts" INTEGER NOT NULL DEFAULT 0,
    "failedProducts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "monitoring_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monitoring_items" (
    "id" SERIAL NOT NULL,
    "monitoringJobId" INTEGER NOT NULL,
    "userProductId" INTEGER NOT NULL,
    "competitorProductId" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "customThreshold" DOUBLE PRECISION,
    "searchQuery" TEXT,
    "targetWebsite" TEXT,
    "discoveryStatus" TEXT,
    "confidenceScore" DOUBLE PRECISION,
    "lastPrice" DOUBLE PRECISION,
    "lastCheckedAt" TIMESTAMP(3),
    "checkCount" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "monitoring_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alerts" (
    "id" SERIAL NOT NULL,
    "monitoringJobId" INTEGER NOT NULL,
    "monitoringItemId" INTEGER,
    "alertType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'medium',
    "oldValue" TEXT,
    "newValue" TEXT,
    "changePercent" DOUBLE PRECISION,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "isResolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "matching_candidates" (
    "id" SERIAL NOT NULL,
    "userProductId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "price" DOUBLE PRECISION,
    "image" TEXT,
    "website" TEXT NOT NULL,
    "titleSimilarity" DOUBLE PRECISION,
    "priceSimilarity" DOUBLE PRECISION,
    "overallScore" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "searchQuery" TEXT,
    "discoveryMethod" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "matching_candidates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "monitoring_items_monitoringJobId_userProductId_competitorPr_key" ON "monitoring_items"("monitoringJobId", "userProductId", "competitorProductId");

-- AddForeignKey
ALTER TABLE "monitoring_jobs" ADD CONSTRAINT "monitoring_jobs_uploadBatchId_fkey" FOREIGN KEY ("uploadBatchId") REFERENCES "upload_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monitoring_items" ADD CONSTRAINT "monitoring_items_monitoringJobId_fkey" FOREIGN KEY ("monitoringJobId") REFERENCES "monitoring_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monitoring_items" ADD CONSTRAINT "monitoring_items_userProductId_fkey" FOREIGN KEY ("userProductId") REFERENCES "user_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monitoring_items" ADD CONSTRAINT "monitoring_items_competitorProductId_fkey" FOREIGN KEY ("competitorProductId") REFERENCES "competitor_products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_monitoringJobId_fkey" FOREIGN KEY ("monitoringJobId") REFERENCES "monitoring_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matching_candidates" ADD CONSTRAINT "matching_candidates_userProductId_fkey" FOREIGN KEY ("userProductId") REFERENCES "user_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
