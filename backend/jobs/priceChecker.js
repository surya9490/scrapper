import cron from "node-cron";
import prisma from '../utils/prisma.js';
import { scrapeQueue } from "../routes/queue.js";

export function schedulePriceJob() {
  // Run every 6 hours (0 */6 * * *)
  // For testing, you can use "*/5 * * * *" for every 5 minutes
  const cronExpression = process.env.PRICE_CHECK_CRON || "0 */6 * * *";
  
  console.log(`📅 Scheduling price check job with cron: ${cronExpression}`);
  
  const task = cron.schedule(cronExpression, async () => {
    try {
      console.log("🔄 Starting scheduled price recheck...");
      
      // Get all products from database
      const products = await prisma.competitorProduct.findMany({
        select: {
          id: true,
          url: true,
          title: true,
          lastScrapedAt: true
        },
        orderBy: {
          lastScrapedAt: 'asc' // Prioritize products that haven't been scraped recently
        }
      });

      if (products.length === 0) {
        console.log("📭 No products found for price recheck");
        return;
      }

      console.log(`📦 Found ${products.length} products for price recheck`);

      // Add all products to the scrape queue
      let successCount = 0;
      let errorCount = 0;

      for (const product of products) {
        try {
          await scrapeQueue.add("scrape-job", { 
            url: product.url,
            isScheduledRecheck: true,
            productId: product.id
          }, {
            jobId: `scheduled-${product.id}-${Date.now()}`,
            delay: Math.random() * 5000, // Random delay up to 5 seconds to avoid overwhelming servers
          });
          
          successCount++;
        } catch (error) {
          console.error(`❌ Failed to queue product ${product.id} (${product.url}):`, error.message);
          errorCount++;
        }
      }

      console.log(`✅ Scheduled price recheck completed:`);
      console.log(`   📋 Queued: ${successCount} products`);
      console.log(`   ❌ Failed: ${errorCount} products`);
      
      // Log the recheck event (optional - you could add a separate table for this)
      console.log(`🕒 Next price recheck scheduled for: ${getNextRunTime(cronExpression)}`);

    } catch (error) {
      console.error("❌ Error during scheduled price recheck:", error);
    }
  }, {
    scheduled: true,
    timezone: process.env.TIMEZONE || "UTC"
  });

  console.log(`✅ Price check job scheduled successfully`);
  console.log(`🕒 Next run: ${getNextRunTime(cronExpression)}`);
  
  return task;
}

// Helper function to get next run time
function getNextRunTime(cronExpression) {
  try {
    const task = cron.schedule(cronExpression, () => {}, { scheduled: false });
    // This is a simplified approach - in production you might want to use a proper cron parser
    return "Check cron schedule for exact time";
  } catch (error) {
    return "Unable to determine next run time";
  }
}

// Manual trigger function (can be called via API if needed)
export async function triggerManualPriceCheck() {
  try {
    console.log("🔄 Manual price recheck triggered...");
    
    const products = await prisma.competitorProduct.findMany({
      select: {
        id: true,
        url: true,
        title: true
      }
    });

    if (products.length === 0) {
      return { success: true, message: "No products found", count: 0 };
    }

    let successCount = 0;
    for (const product of products) {
      try {
        await scrapeQueue.add("scrape-job", { 
          url: product.url,
          isManualRecheck: true,
          productId: product.id
        }, {
          jobId: `manual-${product.id}-${Date.now()}`,
        });
        successCount++;
      } catch (error) {
        console.error(`❌ Failed to queue product ${product.id}:`, error.message);
      }
    }

    console.log(`✅ Manual price recheck: queued ${successCount}/${products.length} products`);
    
    return { 
      success: true, 
      message: `Queued ${successCount} products for manual recheck`,
      count: successCount 
    };

  } catch (error) {
    console.error("❌ Error during manual price recheck:", error);
    return { 
      success: false, 
      message: "Failed to trigger manual price recheck",
      error: error.message 
    };
  }
}

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, stopping cron jobs...');
  cron.getTasks().forEach(task => task.stop());
});

process.on('SIGINT', () => {
  console.log('SIGINT received, stopping cron jobs...');
  cron.getTasks().forEach(task => task.stop());
});