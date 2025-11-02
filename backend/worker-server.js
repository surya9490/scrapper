import dotenv from "dotenv";
import { Worker } from "bullmq";
import { getRedisClient, initializeRedis } from "./utils/redis.js";
import logger from "./utils/logger.js";
import { getConfig, logConfigurationStatus } from './utils/config.js';
import { disconnectPrisma } from './utils/prisma.js';
import prisma from './utils/prisma.js';
import { closeCluster } from './scraper/cluster.js';
import ScrapingService from './services/scrapingService.js';
import DomainThrottler from './utils/domainThrottler.js';
import CircuitBreaker from './utils/circuitBreaker.js';
import RetryHandler from './utils/retryHandler.js';

dotenv.config();

// Validate environment configuration
const configValidation = logConfigurationStatus();
if (!configValidation.success) {
  logger.error('Worker server startup failed due to configuration errors', {
    missingVariables: configValidation.missing,
    formatErrors: configValidation.formatErrors
  });
  process.exit(1);
}

const config = getConfig();

class WorkerServer {
  constructor() {
    this.workers = [];
    this.scrapingService = new ScrapingService();
    this.domainThrottler = new DomainThrottler();
    this.circuitBreaker = new CircuitBreaker();
    this.retryHandler = new RetryHandler();
    this.isShuttingDown = false;
  }

  async initialize() {
    try {
      // Initialize Redis connection
      await initializeRedis();
      const connection = getRedisClient();
      
      logger.info('Worker server initializing...', {
        nodeEnv: config.nodeEnv,
        workerConcurrency: config.workerConcurrency || 3
      });

      // Create scraping worker
      const scrapingWorker = new Worker(
        "scrape-jobs",
        async (job) => await this.processScrapeJob(job),
        {
          connection,
          concurrency: parseInt(process.env.WORKER_CONCURRENCY) || 3,
          removeOnComplete: 100,
          removeOnFail: 50,
          settings: {
            stalledInterval: 30000,
            maxStalledCount: 1,
          },
          defaultJobOptions: {
            removeOnComplete: 10,
            removeOnFail: 5,
            attempts: 3,
            backoff: {
              type: 'exponential',
              delay: 5000,
            },
            timeout: 180000,
          }
        }
      );

      // Create batch processing worker
      const batchWorker = new Worker(
        "batch-jobs",
        async (job) => await this.processBatchJob(job),
        {
          connection,
          concurrency: 2, // Lower concurrency for batch jobs
          removeOnComplete: 50,
          removeOnFail: 25,
          settings: {
            stalledInterval: 60000,
            maxStalledCount: 1,
          },
          defaultJobOptions: {
            removeOnComplete: 5,
            removeOnFail: 3,
            attempts: 2,
            backoff: {
              type: 'exponential',
              delay: 10000,
            },
            timeout: 600000, // 10 minutes for batch jobs
          }
        }
      );

      this.workers = [scrapingWorker, batchWorker];
      this.setupWorkerEventHandlers();

      logger.info('Worker server initialized successfully', {
        workersCount: this.workers.length,
        scrapingConcurrency: scrapingWorker.opts.concurrency,
        batchConcurrency: batchWorker.opts.concurrency
      });

    } catch (error) {
      logger.error('Failed to initialize worker server', { error: error.message });
      throw error;
    }
  }

  async processScrapeJob(job) {
    const { url, userId, options = {} } = job.data;
    const startTime = Date.now();
    
    logger.info(`Processing scrape job ${job.id}: ${url}`, {
      jobId: job.id,
      url,
      userId,
      type: 'job_start'
    });

    try {
      // Check circuit breaker for domain
      const domain = new URL(url).hostname;
      if (await this.circuitBreaker.isOpen(domain)) {
        throw new Error(`Circuit breaker is open for domain: ${domain}`);
      }

      // Apply domain throttling
      await this.domainThrottler.throttle(domain);
      
      await job.updateProgress(10);

      // Execute scraping with retry logic
      const result = await this.retryHandler.execute(
        async () => {
          const productData = await this.scrapingService.scrapeProduct(url);
          return productData;
        },
        {
          maxRetries: 3,
          baseDelay: 1000,
          maxDelay: 10000,
          backoffFactor: 2
        }
      );

      await job.updateProgress(90);

      // Save scraped product to database if we have valid data
      if (result && result.title && userId) {
        try {
          const competitorProduct = await prisma.competitorProduct.create({
            data: {
              userId,
              title: result.title || 'Unknown Product',
              url: result.sourceUrl || url,
              price: result.price || null,
              image: result.image || null,
              brand: result.brand || null,
              category: result.category || null,
              material: result.material || null,
              size: result.size || null,
              color: result.color || null,
              threadCount: result.threadCount != null ? String(result.threadCount) : null,
              design: result.design || null,
              competitorDomain: domain,
              competitorName: domain,
              lastScrapedAt: new Date(),
              scrapingStatus: 'COMPLETED'
            }
          });

          logger.info(`Saved scraped product to database`, {
            jobId: job.id,
            productId: competitorProduct.id,
            title: result.title,
            url: result.sourceUrl || url,
            type: 'product_saved'
          });
        } catch (dbError) {
          logger.error(`Failed to save scraped product to database`, {
            jobId: job.id,
            url,
            error: dbError.message,
            type: 'db_save_error'
          });
          // Don't throw here - we still want to mark the scraping as successful
        }
      } else {
        logger.warn(`Skipping database save - missing required data`, {
          jobId: job.id,
          url,
          hasResult: !!result,
          hasTitle: !!(result && result.title),
          hasUserId: !!userId,
          type: 'db_save_skipped'
        });
      }

      // Record success in circuit breaker
      this.circuitBreaker.recordSuccess(domain);

      const duration = Date.now() - startTime;
      logger.info(`Scrape job ${job.id} completed successfully`, {
        jobId: job.id,
        url,
        duration,
        type: 'job_completed'
      });

      await job.updateProgress(100);
      return result;

    } catch (error) {
      const domain = new URL(url).hostname;
      this.circuitBreaker.recordFailure(domain);
      
      logger.error(`Scrape job ${job.id} failed`, {
        jobId: job.id,
        url,
        error: error.message,
        duration: Date.now() - startTime,
        type: 'job_failed'
      });
      
      throw error;
    }
  }

  async processBatchJob(job) {
    const { urls, userId, batchSize = 5 } = job.data;
    const startTime = Date.now();
    
    logger.info(`Processing batch job ${job.id} with ${urls.length} URLs`, {
      jobId: job.id,
      urlCount: urls.length,
      batchSize,
      userId,
      type: 'batch_job_start'
    });

    try {
      const results = [];
      const batches = this.chunkArray(urls, batchSize);
      
      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        const progress = Math.floor((i / batches.length) * 90);
        await job.updateProgress(progress);

        logger.info(`Processing batch ${i + 1}/${batches.length}`, {
          jobId: job.id,
          batchIndex: i,
          batchSize: batch.length
        });

        // Process batch with controlled concurrency
        const batchResults = await Promise.allSettled(
          batch.map(async (url) => {
            const domain = new URL(url).hostname;
            
            if (await this.circuitBreaker.isOpen(domain)) {
              throw new Error(`Circuit breaker is open for domain: ${domain}`);
            }

            await this.domainThrottler.throttle(domain);
            return await this.scrapingService.scrapeProduct(url);
          })
        );

        // Process results and handle failures
        batchResults.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            results.push(result.value);
            const domain = new URL(batch[index]).hostname;
            this.circuitBreaker.recordSuccess(domain);
          } else {
            const domain = new URL(batch[index]).hostname;
            this.circuitBreaker.recordFailure(domain);
            logger.warn(`Batch item failed: ${batch[index]}`, {
              error: result.reason.message
            });
          }
        });

        // Add delay between batches to prevent overwhelming targets
        if (i < batches.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      const duration = Date.now() - startTime;
      logger.info(`Batch job ${job.id} completed`, {
        jobId: job.id,
        totalUrls: urls.length,
        successfulResults: results.length,
        duration,
        type: 'batch_job_completed'
      });

      await job.updateProgress(100);
      return {
        results,
        totalProcessed: urls.length,
        successful: results.length,
        failed: urls.length - results.length
      };

    } catch (error) {
      logger.error(`Batch job ${job.id} failed`, {
        jobId: job.id,
        error: error.message,
        duration: Date.now() - startTime,
        type: 'batch_job_failed'
      });
      
      throw error;
    }
  }

  chunkArray(array, chunkSize) {
    const chunks = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  setupWorkerEventHandlers() {
    this.workers.forEach((worker, index) => {
      const workerName = index === 0 ? 'scraping' : 'batch';
      
      worker.on('completed', (job, result) => {
        logger.info(`${workerName} worker completed job ${job.id}`, {
          jobId: job.id,
          workerName,
          type: 'worker_job_completed'
        });
      });

      worker.on('failed', (job, err) => {
        logger.error(`${workerName} worker failed job ${job?.id}`, {
          jobId: job?.id,
          workerName,
          error: err.message,
          type: 'worker_job_failed'
        });
      });

      worker.on('error', (err) => {
        logger.error(`${workerName} worker error`, {
          workerName,
          error: err.message,
          type: 'worker_error'
        });
      });

      worker.on('ready', () => {
        logger.info(`${workerName} worker ready`, {
          workerName,
          concurrency: worker.opts.concurrency,
          type: 'worker_ready'
        });
      });

      worker.on('stalled', (jobId) => {
        logger.warn(`${workerName} worker job stalled`, {
          jobId,
          workerName,
          type: 'worker_job_stalled'
        });
      });
    });
  }

  async shutdown() {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;

    logger.info('Worker server shutting down...');

    try {
      // Close all workers
      await Promise.all(this.workers.map(worker => worker.close()));
      
      // Close scraping service browser
      await this.scrapingService.closeBrowser();
      
      // Close cluster
      await closeCluster();
      
      // Disconnect from database
      await disconnectPrisma();
      
      logger.info('Worker server shutdown completed');
    } catch (error) {
      logger.error('Error during worker server shutdown', { error: error.message });
    }
  }
}

// Initialize and start worker server
const workerServer = new WorkerServer();

async function startWorkerServer() {
  try {
    await workerServer.initialize();
    logger.info('Worker server started successfully');
  } catch (error) {
    logger.error('Failed to start worker server', { error: error.message });
    process.exit(1);
  }
}

// Graceful shutdown handlers
const gracefulShutdown = async (signal) => {
  logger.info(`Received ${signal}, starting graceful shutdown...`);
  await workerServer.shutdown();
  process.exit(0);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Start the worker server
startWorkerServer();