/*
  Warnings:

  - Added the required column `userId` to the `shopify_stores` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "shopify_stores" ADD COLUMN     "userId" INTEGER NOT NULL;

-- AddForeignKey
ALTER TABLE "shopify_stores" ADD CONSTRAINT "shopify_stores_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
