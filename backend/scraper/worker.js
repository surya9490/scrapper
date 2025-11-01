import { Worker } from "bullmq";
import { getRedisClient } from "../utils/redis.js";
import * as cheerio from "cheerio";
import { getCluster } from "./cluster.js";
import prisma from "../utils/prisma.js";
import dotenv from "dotenv";
import logger from "../utils/logger.js";
import DomainThrottler from "../utils/domainThrottler.js";
import CircuitBreaker from "../utils/circuitBreaker.js";
import RetryHandler from "../utils/retryHandler.js";
import CacheService from "../utils/cacheService.js";
import ProxyRotation from "../utils/proxyRotation.js";

dotenv.config();

// Redis connection
const connection = getRedisClient();

// Initialize cluster
const cluster = await getCluster();

// Initialize optimization utilities
const domainThrottler = new DomainThrottler();
const circuitBreaker = new CircuitBreaker();
const retryHandler = new RetryHandler();
const cacheService = new CacheService();
const proxyRotation = new ProxyRotation();

logger.info("Starting optimized scrape worker with all utilities");

// Create worker with proper timeout configuration
const worker = new Worker(
  "scrape-jobs",
  async (job) => {
    const { url } = job.data;
    const startTime = Date.now();
    const domain = new URL(url).hostname;
    
    logger.info(`Processing job ${job.id}: ${url}`, {
      jobId: job.id,
      url,
      domain,
      type: 'job_start'
    });
    
    try {
      // Check cache first
      const cacheKey = cacheService.generateKey('product', url);
      const cachedProduct = await cacheService.get(cacheKey);
      
      if (cachedProduct) {
        logger.info(`Cache hit for job ${job.id}`, { jobId: job.id, url });
        await job.updateProgress(100);
        return cachedProduct;
      }

      // Check circuit breaker for domain
      if (!circuitBreaker.canExecute(domain)) {
        throw new Error(`Circuit breaker is open for domain: ${domain}`);
      }

      // Apply domain throttling
      await domainThrottler.throttle(domain);
      
      // Update job progress
      await job.updateProgress(10);
      
      let productData;
      
      // Execute scraping with retry handler and all optimizations
      productData = await retryHandler.execute(async () => {
        logger.info(`Starting scrape for: ${url}`, {
          jobId: job.id,
          type: 'scrape_start'
        });
        
        // Add timeout wrapper for cluster execution
        const html = await Promise.race([
          cluster.execute(url),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Scraping timeout exceeded')), 120000) // 2 minutes
          )
        ]);
        
        await job.updateProgress(40);
        
        if (!html) {
          throw new Error("Failed to retrieve HTML content");
        }

        return html;
      });
      
      const $ = cheerio.load(html);

      // Extract product information with multiple selectors
      const titleSelectors = [
        'h1[data-automation-id="product-title"]', // Amazon
        'h1#productTitle', // Amazon alternative
        '.product-title h1', // Generic
        'h1.product-name', // Generic
        'h1', // Fallback
        '[data-testid="product-title"]',
        '.product-title',
        'title' // Last resort
      ];
      
      let title = null;
      for (const selector of titleSelectors) {
        const element = $(selector).first();
        if (element.length > 0) {
          title = element.text().trim();
          if (title && title.length > 0) {
            break;
          }
        }
      }

      await job.updateProgress(60);

      // Try multiple price selectors
      const priceSelectors = [
        '.a-price-whole', // Amazon
        '.a-price .a-offscreen', // Amazon
        '.price-current', // Generic
        '[class*="price"]',
        '[data-testid*="price"]',
        '.price',
        '.product-price',
        '.current-price',
        '.sale-price',
        '[class*="cost"]',
        '[class*="amount"]'
      ];
      
      let price = null;
      for (const selector of priceSelectors) {
        const element = $(selector).first();
        if (element.length > 0) {
          const priceText = element.text().trim();
          const priceMatch = priceText.match(/[\d,]+\.?\d*/);
          if (priceMatch) {
            price = parseFloat(priceMatch[0].replace(/,/g, ''));
            break;
          }
        }
      }

      await job.updateProgress(80);

      // Extract image with multiple selectors
      const imageSelectors = [
        '#landingImage', // Amazon
        '.product-image img', // Generic
        '.main-image img', // Generic
        'img[data-testid="product-image"]', // Generic
        "img[src*='product']",
        "img[alt*='product']",
        "img"
      ];
      
      let image = null;
      for (const selector of imageSelectors) {
        const element = $(selector).first();
        if (element.length > 0) {
          image = element.attr('src') || element.attr('data-src');
          if (image) {
            // Convert relative URLs to absolute
            if (image.startsWith('//')) {
              image = 'https:' + image;
            } else if (image.startsWith('/')) {
              const urlObj = new URL(url);
              image = urlObj.origin + image;
            } else if (!image.startsWith('http')) {
              image = `https:${image}`;
            }
            break;
          }
        }
      }

      productData = { 
        title: title || "Unknown Product", 
        price, 
        image: image
      };

      logger.debug('Extracted product data', { url, productData });

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
      
      // Cache the successful result
      await cacheService.set(cacheKey, productData, 'product');
      
      // Record success for circuit breaker
      circuitBreaker.recordSuccess(domain);
      
      const duration = Date.now() - startTime;
      logger.info(`Successfully processed job ${job.id}: ${productData.title} (${duration}ms)`);
      
      return {
        success: true,
        url,
        productId: savedProduct.id,
        title: productData.title,
        price: productData.price,
        scrapedAt: new Date().toISOString(),
        processingTime: duration
      };

    } catch (error) {
      // Record failure for circuit breaker
      circuitBreaker.recordFailure(domain);
      
      const duration = Date.now() - startTime;
      
      // Enhanced error logging with timeout detection
      const isTimeout = error.message.includes('timeout') || 
                       error.message.includes('Timeout') ||
                       error.name === 'TimeoutError' ||
                       error.message.includes('Scraping timeout exceeded');
      
      logger.error(`Job ${job.id} failed for ${url}:`, {
        jobId: job.id,
        url,
        error: error.message,
        errorType: error.name,
        isTimeout,
        duration,
        attempts: job.attemptsMade,
        type: 'job_error'
      });
      
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
            title: isTimeout ? "Scraping timeout" : "Failed to scrape",
            lastScrapedAt: new Date(),
            competitorDomain: new URL(url).hostname,
            competitorName: new URL(url).hostname
          },
        });
      } catch (dbError) {
        logger.error(`Database error for failed job ${job.id}:`, {
          jobId: job.id,
          dbError: dbError.message,
          type: 'db_error'
        });
      }
      
      // Re-throw with enhanced error information
      if (isTimeout) {
        throw new Error(`Scraping timeout for ${url}: ${error.message}`);
      }
      
      throw error;
    }
  },
  { 
    connection,
    concurrency: parseInt(process.env.WORKER_CONCURRENCY) || 3,
    removeOnComplete: 100,
    removeOnFail: 50,
    settings: {
      stalledInterval: 30000, // Check for stalled jobs every 30 seconds
      maxStalledCount: 1, // Max number of times a job can be stalled before failing
    },
    // Job timeout configuration
    defaultJobOptions: {
      removeOnComplete: 10,
      removeOnFail: 5,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
      // Set job timeout to 3 minutes (180 seconds)
      timeout: 180000,
    }
  }
);

// Worker event handlers with enhanced logging
worker.on('completed', (job, result) => {
  logger.info('Job completed successfully', { 
    jobId: job.id, 
    duration: Date.now() - job.processedOn,
    type: 'job_completed',
    result: result ? 'success' : 'no_result'
  });
});

worker.on('failed', (job, err) => {
  const isTimeout = err.message.includes('timeout') || 
                   err.message.includes('Timeout') ||
                   err.name === 'TimeoutError';
  
  logger.error('Job failed', { 
    jobId: job?.id, 
    error: err.message, 
    errorType: err.name,
    isTimeout,
    attempts: job?.attemptsMade,
    maxAttempts: job?.opts?.attempts,
    url: job?.data?.url,
    type: 'job_failed' 
  });
});

worker.on('error', (err) => {
  logger.error('Worker error:', { 
    error: err.message, 
    errorType: err.name,
    stack: err.stack,
    type: 'worker_error' 
  });
});

worker.on('ready', () => {
  logger.info('Worker is ready and waiting for jobs', { 
    concurrency: worker.opts.concurrency,
    stalledInterval: worker.opts.settings?.stalledInterval,
    jobTimeout: worker.opts.defaultJobOptions?.timeout,
    type: 'worker_ready' 
  });
});

worker.on('stalled', (jobId) => {
  logger.warn(`Job ${jobId} stalled - will be retried or failed`, { 
    jobId, 
    stalledInterval: worker.opts.settings?.stalledInterval,
    maxStalledCount: worker.opts.settings?.maxStalledCount,
    type: 'job_stalled' 
  });
});

worker.on('progress', (job, progress) => {
  logger.debug('Job progress', { 
    jobId: job.id, 
    progress, 
    type: 'job_progress' 
  });
});

// Graceful shutdown handling
const gracefulShutdown = async (signal) => {
  logger.info(`${signal} received, shutting down worker gracefully`);
  
  try {
    await worker.close();
    await connection.quit();
    // Prisma disconnect is handled by the centralized client
    logger.info('Worker shutdown completed');
    process.exit(0);
  } catch (error) {
    logger.error('Error during worker shutdown:', error);
    process.exit(1);
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

logger.info('Worker started', { 
  concurrency: worker.opts.concurrency,
  type: 'worker_started' 
});