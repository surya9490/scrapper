/*
  Warnings:

  - Added the required column `userId` to the `alerts` table without a default value. This is not possible if the table is not empty.
  - Added the required column `userId` to the `competitor_products` table without a default value. This is not possible if the table is not empty.
  - Added the required column `userId` to the `matching_candidates` table without a default value. This is not possible if the table is not empty.
  - Added the required column `userId` to the `monitoring_items` table without a default value. This is not possible if the table is not empty.
  - Added the required column `userId` to the `monitoring_jobs` table without a default value. This is not possible if the table is not empty.
  - Added the required column `userId` to the `price_alerts` table without a default value. This is not possible if the table is not empty.
  - Added the required column `userId` to the `price_histories` table without a default value. This is not possible if the table is not empty.
  - Added the required column `userId` to the `product_mappings` table without a default value. This is not possible if the table is not empty.
  - Added the required column `userId` to the `upload_batches` table without a default value. This is not possible if the table is not empty.
  - Added the required column `userId` to the `user_products` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "alerts" ADD COLUMN     "userId" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "competitor_products" ADD COLUMN     "userId" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "matching_candidates" ADD COLUMN     "userId" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "monitoring_items" ADD COLUMN     "userId" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "monitoring_jobs" ADD COLUMN     "userId" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "price_alerts" ADD COLUMN     "userId" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "price_histories" ADD COLUMN     "userId" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "product_mappings" ADD COLUMN     "userId" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "upload_batches" ADD COLUMN     "userId" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "user_products" ADD COLUMN     "userId" INTEGER NOT NULL;

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password" TEXT,
    "role" TEXT NOT NULL DEFAULT 'user',
    "dashboardRateLimit" INTEGER NOT NULL DEFAULT 600,
    "scrapingRateLimit" INTEGER NOT NULL DEFAULT 30,
    "uploadRateLimit" INTEGER NOT NULL DEFAULT 10,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLogin" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- AddForeignKey
ALTER TABLE "user_products" ADD CONSTRAINT "user_products_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competitor_products" ADD CONSTRAINT "competitor_products_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_mappings" ADD CONSTRAINT "product_mappings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_histories" ADD CONSTRAINT "price_histories_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "upload_batches" ADD CONSTRAINT "upload_batches_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monitoring_jobs" ADD CONSTRAINT "monitoring_jobs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monitoring_items" ADD CONSTRAINT "monitoring_items_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matching_candidates" ADD CONSTRAINT "matching_candidates_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_alerts" ADD CONSTRAINT "price_alerts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
