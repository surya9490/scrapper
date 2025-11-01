import prisma from '../utils/prisma.js';
import ScrapingService from './scrapingService.js';
import { Queue, Worker } from 'bullmq';
import { getRedisClient } from '../utils/redis.js';
import logger from '../utils/logger.js';

class PriceMonitoringService {
  constructor() {
    this.prisma = prisma;
    this.scrapingService = new ScrapingService();
    this.maxRetries = 3;
    this.timeout = 60000; // 60 seconds
    
    // Initialize Redis connection with error handling
    try {
      this.redis = getRedisClient();

      // Initialize job queue
      this.priceQueue = new Queue('price-monitoring', {
        connection: this.redis,
        defaultJobOptions: {
          removeOnComplete: 100,
          removeOnFail: 50,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
        },
      });

      // Initialize worker
      this.initializeWorker();
      
      logger.info('Price monitoring service initialized successfully');
    } catch (error) {
      logger.error('Redis connection failed. Price monitoring features will be limited', { 
        error: error.message 
      });
      this.redis = null;
      this.priceQueue = null;
    }
  }

  // Helper method to check if Redis is available
  isRedisAvailable() {
    return this.redis !== null && this.priceQueue !== null;
  }

  // Initialize worker for processing price monitoring jobs
  initializeWorker() {
    if (!this.isRedisAvailable()) {
      logger.warn('Redis not available. Workers will not be initialized.');
      return;
    }

    try {
      // Price monitoring worker
      this.worker = new Worker('price-monitoring', async (job) => {
        const { mappingId } = job.data;
        
        logger.info('Processing price monitoring job', { 
          jobId: job.id, 
          mappingId,
          attempt: job.attemptsMade + 1
        });
        
        return await this.monitorProductPrice(mappingId);
      }, {
        connection: this.redis,
        concurrency: 5,
      });

      // Worker event handlers
      this.worker.on('completed', (job, result) => {
        logger.info('Price monitoring job completed', { 
          jobId: job.id, 
          mappingId: job.data.mappingId,
          result: result ? 'success' : 'no_changes'
        });
      });

      this.worker.on('failed', (job, err) => {
        logger.error('Price monitoring job failed', { 
          jobId: job?.id, 
          mappingId: job?.data?.mappingId,
          error: err.message,
          attempts: job?.attemptsMade
        });
      });

      logger.info('Price monitoring worker initialized');
    } catch (error) {
      logger.error('Failed to initialize price monitoring worker', { error: error.message });
    }
  }

  // Schedule price monitoring for a product mapping
  async schedulePriceMonitoring(mappingId, schedule = 'daily') {
    try {
      // Validate inputs
      if (!mappingId) {
        throw new Error('Mapping ID is required');
      }

      if (!this.isRedisAvailable()) {
        logger.warn('Redis not available. Price monitoring cannot be scheduled', { mappingId });
        return { success: false, error: 'Price monitoring service unavailable' };
      }

      logger.info('Scheduling price monitoring', { mappingId, schedule });

      const mapping = await this.prisma.productMapping.findUnique({
        where: { id: mappingId },
        include: {
          userProduct: true,
          competitorProduct: true
        }
      });

      if (!mapping) {
        throw new Error(`Product mapping not found: ${mappingId}`);
      }

      if (!mapping.competitorProduct?.sourceUrl) {
        throw new Error('Competitor product must have a valid source URL for monitoring');
      }

      // Add job to queue with proper error handling
      const jobOptions = {
        repeat: { pattern: schedule === 'hourly' ? '0 * * * *' : '0 0 * * *' },
        jobId: `price-monitor-${mappingId}`, // Prevent duplicate jobs
      };

      await this.priceQueue.add('monitor-price', {
        mappingId,
        schedule
      }, jobOptions);

      logger.info('Price monitoring scheduled successfully', { 
        mappingId, 
        schedule,
        userProduct: mapping.userProduct.title,
        competitorProduct: mapping.competitorProduct.title
      });

      return {
        success: true,
        message: `Price monitoring scheduled for mapping ${mappingId}`,
        details: {
          userProduct: mapping.userProduct.title,
          competitorProduct: mapping.competitorProduct.title,
          schedule
        }
      };

    } catch (error) {
      logger.error('Error scheduling price monitoring', { 
        mappingId, 
        schedule,
        error: error.message,
        stack: error.stack
      });
      
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Monitor a single product price
  async monitorProductPrice(mappingId) {
    try {
      // Validate input
      if (!mappingId) {
        throw new Error('Mapping ID is required');
      }

      logger.info('Starting price monitoring for mapping', { mappingId });

      const mapping = await this.prisma.productMapping.findUnique({
        where: { id: mappingId },
        include: {
          userProduct: true,
          competitorProduct: true
        }
      });

      if (!mapping) {
        throw new Error(`Product mapping not found: ${mappingId}`);
      }

      if (!mapping.competitorProduct?.sourceUrl) {
        throw new Error('Competitor product missing source URL');
      }

      // Scrape current price with retry logic
      let scrapedData = null;
      let lastError = null;

      for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
        try {
          logger.info('Scraping competitor product price', { 
            mappingId, 
            attempt, 
            url: mapping.competitorProduct.sourceUrl 
          });

          scrapedData = await this.scrapingService.scrapeProduct(
            mapping.competitorProduct.sourceUrl
          );
          
          if (scrapedData?.price) {
            break; // Success
          } else {
            throw new Error('No price found in scraped data');
          }
        } catch (error) {
          lastError = error;
          logger.warn('Price scraping attempt failed', { 
            mappingId, 
            attempt, 
            error: error.message 
          });

          if (attempt < this.maxRetries) {
            const delay = 1000 * attempt; // Exponential backoff
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }

      if (!scrapedData?.price) {
        throw new Error(`Failed to scrape price after ${this.maxRetries} attempts: ${lastError?.message}`);
      }

      const currentPrice = parseFloat(scrapedData.price);
      const previousPrice = mapping.competitorProduct.price;

      // Update competitor product with new price
      await this.prisma.competitorProduct.update({
        where: { id: mapping.competitorProduct.id },
        data: {
          price: currentPrice,
          lastScrapedAt: new Date(),
          ...(scrapedData.availability && { availability: scrapedData.availability })
        }
      });

      // Create price history record
      const priceHistory = await this.prisma.priceHistory.create({
        data: {
          competitorProductId: mapping.competitorProduct.id,
          price: currentPrice,
          scrapedAt: new Date(),
          sourceUrl: mapping.competitorProduct.sourceUrl
        }
      });

      logger.info('Price monitoring completed', { 
        mappingId,
        previousPrice,
        currentPrice,
        priceChange: currentPrice - (previousPrice || 0)
      });

      // Check for significant price changes and create alerts
      if (previousPrice && Math.abs(currentPrice - previousPrice) > (previousPrice * 0.05)) {
        try {
          await this.createPriceAlert(
            mapping.competitorProduct.id,
            mapping.userProduct.id,
            priceHistory
          );
        } catch (alertError) {
          logger.error('Failed to create price alert', { 
            mappingId, 
            error: alertError.message 
          });
        }
      }

      return {
        success: true,
        mappingId,
        previousPrice,
        currentPrice,
        priceChange: currentPrice - (previousPrice || 0),
        priceChangePercent: previousPrice ? ((currentPrice - previousPrice) / previousPrice * 100) : 0
      };

    } catch (error) {
      logger.error('Error monitoring product price', { 
        mappingId, 
        error: error.message,
        stack: error.stack
      });
      
      throw new Error(`Price monitoring failed for mapping ${mappingId}: ${error.message}`);
    }
  }

  // Create price alert for significant price changes
  async createPriceAlert(competitorProductId, userProductId, priceHistory) {
    try {
      logger.info('Creating price alert', { 
        competitorProductId, 
        userProductId, 
        priceChange: priceHistory.price 
      });

      await this.prisma.priceAlert.create({
        data: {
          competitorProductId,
          userProductId,
          priceHistoryId: priceHistory.id,
          alertType: 'PRICE_CHANGE',
          message: `Price changed to $${priceHistory.price}`,
          isRead: false
        }
      });

      logger.info('Price alert created successfully', { 
        competitorProductId, 
        userProductId 
      });
    } catch (error) {
      logger.error('Error creating price alert', { 
        competitorProductId, 
        userProductId, 
        error: error.message 
      });
      throw error;
    }
  }

  // Get monitoring status for all active jobs
  async getMonitoringStatus() {
    try {
      if (!this.isRedisAvailable()) {
        logger.warn('Redis not available. Cannot get monitoring status');
        return { success: false, error: 'Price monitoring service unavailable' };
      }

      logger.info('Getting monitoring status');

      const jobs = await this.priceQueue.getJobs(['waiting', 'active', 'completed', 'failed']);
      const activeJobs = jobs.filter(job => job.opts.repeat);

      const status = {
        success: true,
        totalJobs: jobs.length,
        activeMonitoringJobs: activeJobs.length,
        jobs: activeJobs.map(job => ({
          id: job.id,
          mappingId: job.data.mappingId,
          schedule: job.data.schedule,
          nextRun: job.opts.repeat?.next || null,
          status: job.finishedOn ? 'completed' : job.processedOn ? 'active' : 'waiting'
        }))
      };

      logger.info('Monitoring status retrieved', { 
        totalJobs: status.totalJobs, 
        activeJobs: status.activeMonitoringJobs 
      });

      return status;
    } catch (error) {
      logger.error('Error getting monitoring status', { 
        error: error.message,
        stack: error.stack
      });
      
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Stop price monitoring for a specific mapping
  async stopPriceMonitoring(mappingId) {
    try {
      if (!this.isRedisAvailable()) {
        logger.warn('Redis not available. Cannot stop scheduled monitoring', { mappingId });
        return { success: false, error: 'Price monitoring service unavailable' };
      }

      logger.info('Stopping price monitoring', { mappingId });

      const jobId = `price-monitor-${mappingId}`;
      const job = await this.priceQueue.getJob(jobId);

      if (job) {
        await job.remove();
        logger.info('Price monitoring stopped successfully', { mappingId, jobId });
        
        return {
          success: true,
          message: `Price monitoring stopped for mapping ${mappingId}`
        };
      } else {
        logger.warn('No active monitoring job found', { mappingId, jobId });
        
        return {
          success: false,
          error: 'No active monitoring job found for this mapping'
        };
      }
    } catch (error) {
      logger.error('Error stopping price monitoring', { 
        mappingId, 
        error: error.message,
        stack: error.stack
      });
      
      return {
        success: false,
        error: error.message
      };
    }
  }
}

export default PriceMonitoringService;