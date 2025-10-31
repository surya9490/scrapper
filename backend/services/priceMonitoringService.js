import { PrismaClient } from '@prisma/client';
import ScrapingService from './scrapingService.js';
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';

class PriceMonitoringService {
  constructor() {
    this.prisma = new PrismaClient();
    this.scrapingService = new ScrapingService();
    
    // Initialize Redis connection with error handling
    try {
      this.redis = new IORedis({
        host: process.env.REDIS_HOST || 'redis',
        port: process.env.REDIS_PORT || 6379,
        password: process.env.REDIS_PASSWORD,
        retryDelayOnFailover: 100,
        maxRetriesPerRequest: 3,
        lazyConnect: true,
      });

      // Initialize job queue
      this.priceQueue = new Queue('price-monitoring', {
        connection: this.redis,
      });

      // Initialize worker
      this.initializeWorker();
    } catch (error) {
      console.warn('Redis connection failed. Price monitoring features will be limited:', error.message);
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
      console.warn('Redis not available. Workers will not be initialized.');
      return;
    }

    // Price monitoring worker
    new Worker('price-monitoring', async (job) => {
      const { mappingId } = job.data;
      return await this.monitorProductPrice(mappingId);
    }, {
      connection: this.redis,
    });
  }

  // Schedule price monitoring for a product mapping
  async schedulePriceMonitoring(mappingId, schedule = 'daily') {
    if (!this.isRedisAvailable()) {
      console.warn('Redis not available. Price monitoring cannot be scheduled.');
      return { success: false, error: 'Price monitoring service unavailable' };
    }

    try {
      const mapping = await this.prisma.productMapping.findUnique({
        where: { id: mappingId },
        include: {
          userProduct: true,
          competitorProduct: true
        }
      });

      if (!mapping) {
        throw new Error('Product mapping not found');
      }

      // Add job to queue
      await this.priceQueue.add('monitor-price', {
        mappingId,
        schedule
      }, {
        repeat: { pattern: schedule === 'hourly' ? '0 * * * *' : '0 0 * * *' }
      });

      return {
        success: true,
        message: `Price monitoring scheduled for mapping ${mappingId}`
      };
    } catch (error) {
      console.error('Error scheduling price monitoring:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Monitor a single product price
  async monitorProductPrice(mappingId) {
    try {
      const mapping = await this.prisma.productMapping.findUnique({
        where: { id: mappingId },
        include: {
          userProduct: true,
          competitorProduct: true
        }
      });

      if (!mapping) {
        throw new Error('Product mapping not found');
      }

      // Scrape current price
      const scrapedData = await this.scrapingService.scrapeProduct(mapping.competitorProduct.url);
      
      if (!scrapedData || !scrapedData.price) {
        throw new Error('Failed to scrape product price');
      }

      const currentPrice = parseFloat(scrapedData.price);
      const previousPrice = mapping.competitorProduct.price;

      // Update competitor product with new price
      await this.prisma.competitorProduct.update({
        where: { id: mapping.competitorProduct.id },
        data: {
          price: currentPrice,
          lastScrapedAt: new Date()
        }
      });

      // Create price history record
      const priceChange = currentPrice - previousPrice;
      const priceChangePercent = previousPrice > 0 ? (priceChange / previousPrice) * 100 : 0;

      const priceHistory = await this.prisma.priceHistory.create({
        data: {
          competitorProductId: mapping.competitorProduct.id,
          price: currentPrice,
          priceChange,
          priceChangePercent,
          scrapedAt: new Date()
        }
      });

      // Create alert if significant price change
      if (Math.abs(priceChangePercent) >= 5) {
        await this.createPriceAlert(mapping.competitorProduct.id, mapping.userProduct.id, priceHistory);
      }

      return {
        success: true,
        mappingId,
        previousPrice,
        currentPrice,
        priceChange,
        priceChangePercent
      };
    } catch (error) {
      console.error('Error monitoring product price:', error);
      throw error;
    }
  }

  // Create price alert for significant changes
  async createPriceAlert(competitorProductId, userProductId, priceHistory) {
    try {
      const alertType = priceHistory.priceChange > 0 ? 'PRICE_INCREASE' : 'PRICE_DECREASE';
      
      await this.prisma.priceAlert.create({
        data: {
          type: alertType,
          competitorProductId,
          userProductId,
          priceHistoryId: priceHistory.id,
          message: `Price ${alertType.toLowerCase().replace('_', ' ')} of ${Math.abs(priceHistory.priceChangePercent).toFixed(2)}%`,
          isRead: false
        }
      });

      return { success: true };
    } catch (error) {
      console.error('Error creating price alert:', error);
      throw error;
    }
  }

  // Get monitoring status
  async getMonitoringStatus() {
    try {
      const totalMappings = await this.prisma.productMapping.count();
      const activeMappings = await this.prisma.productMapping.count({
        where: { isActive: true }
      });

      const recentAlerts = await this.prisma.priceAlert.count({
        where: {
          createdAt: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
          }
        }
      });

      return {
        success: true,
        status: {
          totalMappings,
          activeMappings,
          recentAlerts,
          redisAvailable: this.isRedisAvailable()
        }
      };
    } catch (error) {
      console.error('Error getting monitoring status:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Stop price monitoring for a mapping
  async stopPriceMonitoring(mappingId) {
    if (!this.isRedisAvailable()) {
      console.warn('Redis not available. Cannot stop scheduled monitoring.');
      return { success: false, error: 'Price monitoring service unavailable' };
    }

    try {
      // Remove scheduled jobs for this mapping
      const jobs = await this.priceQueue.getJobs(['waiting', 'delayed', 'active']);
      const mappingJobs = jobs.filter(job => job.data.mappingId === mappingId);
      
      for (const job of mappingJobs) {
        await job.remove();
      }

      return {
        success: true,
        message: `Stopped price monitoring for mapping ${mappingId}`
      };
    } catch (error) {
      console.error('Error stopping price monitoring:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

export default PriceMonitoringService;