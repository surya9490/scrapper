import cron from 'node-cron';
import { PrismaClient } from '@prisma/client';
import PriceMonitoringService from './priceMonitoringService.js';
import { scrapeQueue } from '../routes/queue.js';

class CronJobService {
  constructor() {
    this.prisma = new PrismaClient();
    this.priceMonitoringService = new PriceMonitoringService();
    this.jobs = new Map();
    this.isInitialized = false;
  }

  // Initialize all cron jobs
  async initialize() {
    if (this.isInitialized) {
      console.log('⚠️ Cron job service already initialized');
      return;
    }

    console.log('🚀 Initializing cron job service...');

    try {
      // Schedule default price monitoring job
      this.scheduleDefaultPriceMonitoring();
      
      // Schedule price comparison job
      this.schedulePriceComparison();
      
      // Schedule alert cleanup job
      this.scheduleAlertCleanup();
      
      // Load custom scheduled jobs from database
      await this.loadScheduledJobs();

      this.isInitialized = true;
      console.log('✅ Cron job service initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize cron job service:', error);
      throw error;
    }
  }

  // Schedule default price monitoring (every 6 hours)
  scheduleDefaultPriceMonitoring() {
    const cronExpression = process.env.PRICE_CHECK_CRON || '0 */6 * * *';
    
    const task = cron.schedule(cronExpression, async () => {
      try {
        console.log('🔄 Starting scheduled price monitoring...');
        await this.runPriceMonitoring();
      } catch (error) {
        console.error('❌ Error in scheduled price monitoring:', error);
      }
    }, {
      scheduled: true,
      timezone: process.env.TIMEZONE || 'UTC'
    });

    this.jobs.set('default-price-monitoring', {
      task,
      type: 'price-monitoring',
      schedule: cronExpression,
      description: 'Default price monitoring for all products'
    });

    console.log(`📅 Default price monitoring scheduled: ${cronExpression}`);
  }

  // Schedule price comparison job (daily at 2 AM)
  schedulePriceComparison() {
    const cronExpression = '0 2 * * *';
    
    const task = cron.schedule(cronExpression, async () => {
      try {
        console.log('📊 Starting daily price comparison analysis...');
        await this.runPriceComparison();
      } catch (error) {
        console.error('❌ Error in price comparison:', error);
      }
    }, {
      scheduled: true,
      timezone: process.env.TIMEZONE || 'UTC'
    });

    this.jobs.set('daily-price-comparison', {
      task,
      type: 'price-comparison',
      schedule: cronExpression,
      description: 'Daily price comparison and trend analysis'
    });

    console.log(`📊 Price comparison scheduled: ${cronExpression}`);
  }

  // Schedule alert cleanup (weekly)
  scheduleAlertCleanup() {
    const cronExpression = '0 0 * * 0'; // Every Sunday at midnight
    
    const task = cron.schedule(cronExpression, async () => {
      try {
        console.log('🧹 Starting weekly alert cleanup...');
        await this.cleanupOldAlerts();
      } catch (error) {
        console.error('❌ Error in alert cleanup:', error);
      }
    }, {
      scheduled: true,
      timezone: process.env.TIMEZONE || 'UTC'
    });

    this.jobs.set('weekly-alert-cleanup', {
      task,
      type: 'cleanup',
      schedule: cronExpression,
      description: 'Weekly cleanup of old alerts and notifications'
    });

    console.log(`🧹 Alert cleanup scheduled: ${cronExpression}`);
  }

  // Load custom scheduled jobs from database
  async loadScheduledJobs() {
    try {
      // This would load custom jobs from a ScheduledJob table if it exists
      // For now, we'll implement basic functionality
      console.log('📋 Loading custom scheduled jobs...');
      
      // Future implementation: Load from database
      // const scheduledJobs = await this.prisma.scheduledJob.findMany({
      //   where: { isActive: true }
      // });
      
      console.log('✅ Custom scheduled jobs loaded');
    } catch (error) {
      console.error('❌ Error loading scheduled jobs:', error);
    }
  }

  // Run price monitoring for all products
  async runPriceMonitoring() {
    try {
      const products = await this.prisma.competitorProduct.findMany({
        select: {
          id: true,
          url: true,
          title: true,
          lastScrapedAt: true,
          price: true
        },
        orderBy: {
          lastScrapedAt: 'asc'
        }
      });

      if (products.length === 0) {
        console.log('📭 No products found for price monitoring');
        return { success: true, message: 'No products to monitor', count: 0 };
      }

      console.log(`📦 Found ${products.length} products for price monitoring`);

      let successCount = 0;
      let errorCount = 0;

      // Process products in batches to avoid overwhelming the system
      const batchSize = 10;
      for (let i = 0; i < products.length; i += batchSize) {
        const batch = products.slice(i, i + batchSize);
        
        await Promise.allSettled(
          batch.map(async (product, index) => {
            try {
              // Add random delay to avoid rate limiting
              const delay = Math.random() * 5000 + (index * 1000);
              
              await scrapeQueue.add('scrape-job', {
                url: product.url,
                isScheduledRecheck: true,
                productId: product.id,
                previousPrice: product.price
              }, {
                jobId: `scheduled-${product.id}-${Date.now()}`,
                delay
              });
              
              successCount++;
            } catch (error) {
              console.error(`❌ Failed to queue product ${product.id}:`, error.message);
              errorCount++;
            }
          })
        );

        // Wait between batches
        if (i + batchSize < products.length) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      const result = {
        success: true,
        message: `Price monitoring completed`,
        stats: {
          total: products.length,
          queued: successCount,
          failed: errorCount
        }
      };

      console.log(`✅ Price monitoring completed: ${successCount}/${products.length} products queued`);
      return result;

    } catch (error) {
      console.error('❌ Error in price monitoring:', error);
      throw error;
    }
  }

  // Run price comparison analysis
  async runPriceComparison() {
    try {
      console.log('📊 Starting price comparison analysis...');

      // Get recent price changes (last 24 hours)
      const recentPriceChanges = await this.prisma.priceHistory.findMany({
        where: {
          recordedAt: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000)
          }
        },
        include: {
          competitorProduct: {
            include: {
              productMappings: {
                include: {
                  userProduct: true
                }
              }
            }
          }
        },
        orderBy: {
          priceChangePercent: 'desc'
        }
      });

      // Analyze significant price changes
      const significantChanges = recentPriceChanges.filter(
        change => Math.abs(change.priceChangePercent || 0) >= 5
      );

      // Create alerts for significant changes
      let alertsCreated = 0;
      for (const change of significantChanges) {
        try {
          await this.createPriceAlert(change);
          alertsCreated++;
        } catch (error) {
          console.error('❌ Failed to create alert:', error);
        }
      }

      // Generate daily summary
      const summary = {
        totalPriceChanges: recentPriceChanges.length,
        significantChanges: significantChanges.length,
        alertsCreated,
        averagePriceChange: recentPriceChanges.length > 0 
          ? recentPriceChanges.reduce((sum, change) => sum + (change.priceChangePercent || 0), 0) / recentPriceChanges.length
          : 0
      };

      console.log('📊 Price comparison summary:', summary);
      return { success: true, summary };

    } catch (error) {
      console.error('❌ Error in price comparison:', error);
      throw error;
    }
  }

  // Create price alert
  async createPriceAlert(priceChange) {
    try {
      const alertType = (priceChange.priceChangePercent || 0) > 0 ? 'PRICE_INCREASE' : 'PRICE_DECREASE';
      const severity = Math.abs(priceChange.priceChangePercent || 0) >= 20 ? 'HIGH' : 
                      Math.abs(priceChange.priceChangePercent || 0) >= 10 ? 'MEDIUM' : 'LOW';

      // For now, we'll log the alert. In a full implementation, this would save to a PriceAlert table
      const alert = {
        type: alertType,
        severity,
        competitorProductId: priceChange.competitorProductId,
        priceHistoryId: priceChange.id,
        message: `${alertType.replace('_', ' ').toLowerCase()} of ${Math.abs(priceChange.priceChangePercent || 0).toFixed(2)}%`,
        priceChange: priceChange.priceChange,
        priceChangePercent: priceChange.priceChangePercent,
        createdAt: new Date()
      };

      console.log('🚨 Price Alert Created:', alert);
      
      // TODO: Implement actual alert storage and notification
      // await this.prisma.priceAlert.create({ data: alert });
      
      return alert;
    } catch (error) {
      console.error('❌ Error creating price alert:', error);
      throw error;
    }
  }

  // Clean up old alerts
  async cleanupOldAlerts() {
    try {
      const cutoffDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
      
      // TODO: Implement when PriceAlert table exists
      // const deletedCount = await this.prisma.priceAlert.deleteMany({
      //   where: {
      //     createdAt: { lt: cutoffDate },
      //     isRead: true
      //   }
      // });

      console.log(`🧹 Alert cleanup completed`);
      return { success: true, message: 'Alert cleanup completed' };
    } catch (error) {
      console.error('❌ Error in alert cleanup:', error);
      throw error;
    }
  }

  // Create custom scheduled job
  async createScheduledJob(jobConfig) {
    try {
      const { name, schedule, type, config } = jobConfig;
      
      if (!cron.validate(schedule)) {
        throw new Error('Invalid cron expression');
      }

      const task = cron.schedule(schedule, async () => {
        try {
          console.log(`🔄 Running custom job: ${name}`);
          await this.runCustomJob(type, config);
        } catch (error) {
          console.error(`❌ Error in custom job ${name}:`, error);
        }
      }, {
        scheduled: true,
        timezone: process.env.TIMEZONE || 'UTC'
      });

      this.jobs.set(name, {
        task,
        type,
        schedule,
        config,
        description: jobConfig.description || `Custom ${type} job`
      });

      console.log(`✅ Custom job created: ${name} (${schedule})`);
      return { success: true, message: `Job ${name} created successfully` };
    } catch (error) {
      console.error('❌ Error creating scheduled job:', error);
      throw error;
    }
  }

  // Run custom job based on type
  async runCustomJob(type, config) {
    switch (type) {
      case 'price-monitoring':
        return await this.runPriceMonitoring();
      case 'price-comparison':
        return await this.runPriceComparison();
      default:
        console.log(`⚠️ Unknown job type: ${type}`);
    }
  }

  // Get job status
  getJobStatus() {
    const jobs = Array.from(this.jobs.entries()).map(([name, job]) => ({
      name,
      type: job.type,
      schedule: job.schedule,
      description: job.description,
      isRunning: job.task.running || false
    }));

    return {
      isInitialized: this.isInitialized,
      totalJobs: jobs.length,
      jobs
    };
  }

  // Stop specific job
  stopJob(jobName) {
    const job = this.jobs.get(jobName);
    if (job) {
      job.task.stop();
      this.jobs.delete(jobName);
      console.log(`⏹️ Stopped job: ${jobName}`);
      return { success: true, message: `Job ${jobName} stopped` };
    }
    return { success: false, message: `Job ${jobName} not found` };
  }

  // Stop all jobs
  stopAllJobs() {
    let stoppedCount = 0;
    for (const [name, job] of this.jobs) {
      try {
        job.task.stop();
        stoppedCount++;
      } catch (error) {
        console.error(`❌ Error stopping job ${name}:`, error);
      }
    }
    
    this.jobs.clear();
    this.isInitialized = false;
    
    console.log(`⏹️ Stopped ${stoppedCount} cron jobs`);
    return { success: true, message: `Stopped ${stoppedCount} jobs` };
  }

  // Graceful shutdown
  async shutdown() {
    console.log('🔄 Shutting down cron job service...');
    this.stopAllJobs();
    await this.prisma.$disconnect();
    console.log('✅ Cron job service shutdown complete');
  }
}

export default CronJobService;