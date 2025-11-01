import { Worker } from "bullmq";
import IORedis from "ioredis";
import * as cheerio from "cheerio";
import { getCluster } from "./cluster.js";
import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";

dotenv.config();

const prisma = new PrismaClient();

// Redis connection
const connection = new IORedis(process.env.REDIS_URL || "redis://localhost:6379", {
  maxRetriesPerRequest: 3,
  retryDelayOnFailover: 100,
});

// Initialize cluster
const cluster = await getCluster();

console.log("🚀 Starting scrape worker...");

// Create worker
const worker = new Worker(
  "scrape-jobs",
  async (job) => {
    const { url } = job.data;
    
    try {
      console.log(`🔍 Processing job ${job.id}: ${url}`);
      
      // Update job progress
      await job.updateProgress(10);
      
      let productData;
      
      // Execute scraping with cluster
      console.log(`🔍 Starting scrape for: ${url}`);
      const html = await cluster.execute(url);
      
      await job.updateProgress(40);
      
      const $ = cheerio.load(html);

      // Extract product information with multiple selectors
      const title = $("h1").first().text().trim() || 
                   $('[data-testid="product-title"]').text().trim() ||
                   $(".product-title").text().trim() ||
                   $("title").text().trim();

      await job.updateProgress(60);

      // Try multiple price selectors
      const priceSelectors = [
        '[class*="price"]',
        '[data-testid*="price"]',
        '.price',
        '.product-price',
        '.current-price',
        '.sale-price',
        '[class*="cost"]',
        '[class*="amount"]'
      ];
      
      let priceText = "";
      for (const selector of priceSelectors) {
        priceText = $(selector).first().text();
        if (priceText && priceText.trim()) break;
      }
      
      const price = priceText ? parseFloat(priceText.replace(/[₹$,\s]/g, "")) || null : null;

      await job.updateProgress(80);

      // Extract image with multiple selectors
      const image = $("img[src*='product']").first().attr("src") ||
                   $(".product-image img").first().attr("src") ||
                   $("img[alt*='product']").first().attr("src") ||
                   $("img").first().attr("src");

      productData = { 
        title: title || "Unknown Product", 
        price, 
        image: image ? (image.startsWith('http') ? image : `https:${image}`) : null 
      };

      console.log(`📦 Extracted data for ${url}:`, {
        title: productData.title,
        price: productData.price,
        hasImage: !!productData.image
      });

      await job.updateProgress(90);

      // Save to database
      const savedProduct = await prisma.competitorProduct.upsert({
        where: { url },
        update: { 
          ...productData, 
          lastScrapedAt: new Date(),
          competitorDomain: new URL(url).hostname,
          competitorName: new URL(url).hostname
        },
        create: { 
          url, 
          ...productData, 
          lastScrapedAt: new Date(),
          competitorDomain: new URL(url).hostname,
          competitorName: new URL(url).hostname
        },
      });

      await job.updateProgress(100);
      
      console.log(`✅ Successfully processed job ${job.id}: ${productData.title}`);
      
      return {
        success: true,
        url,
        productId: savedProduct.id,
        title: productData.title,
        price: productData.price,
        scrapedAt: new Date().toISOString()
      };

    } catch (error) {
      console.error(`❌ Job ${job.id} failed for ${url}:`, error.message);
      
      // Log error to database (optional)
      try {
        await prisma.competitorProduct.upsert({
          where: { url },
          update: { 
            lastScrapedAt: new Date(),
            // You could add an error field to track failed scrapes
          },
          create: { 
            url,
            title: "Failed to scrape",
            lastScrapedAt: new Date(),
            competitorDomain: new URL(url).hostname,
            competitorName: new URL(url).hostname
          },
        });
      } catch (dbError) {
        console.error(`❌ Database error for failed job ${job.id}:`, dbError.message);
      }
      
      throw error;
    }
  },
  { 
    connection,
    concurrency: parseInt(process.env.WORKER_CONCURRENCY) || 3,
    removeOnComplete: 100,
    removeOnFail: 50,
  }
);

// Worker event handlers
worker.on('completed', (job, result) => {
  console.log(`✅ Job ${job.id} completed successfully`);
});

worker.on('failed', (job, err) => {
  console.error(`❌ Job ${job?.id} failed:`, err.message);
});

worker.on('error', (err) => {
  console.error('❌ Worker error:', err);
});

worker.on('ready', () => {
  console.log('🟢 Worker is ready and waiting for jobs');
});

worker.on('stalled', (jobId) => {
  console.warn(`⚠️ Job ${jobId} stalled`);
});

// Graceful shutdown handling
const gracefulShutdown = async (signal) => {
  console.log(`${signal} received, shutting down worker gracefully...`);
  
  try {
    await worker.close();
    await connection.quit();
    console.log('✅ Worker shutdown completed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during worker shutdown:', error);
    process.exit(1);
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

console.log(`🔄 Worker started with concurrency: ${worker.opts.concurrency}`);