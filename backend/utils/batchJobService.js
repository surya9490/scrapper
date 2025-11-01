import { Queue } from 'bullmq';
import { getRedisClient } from './redis.js';
import logger from './logger.js';

class BatchJobService {
  constructor() {
    this.redis = getRedisClient();
    
    // Initialize batch queue
    this.batchQueue = new Queue('batch-jobs', {
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

    // Batch configuration
    this.config = {
      maxBatchSize: 10,           // Maximum jobs per batch
      batchTimeout: 30000,        // 30 seconds - max time to wait for batch to fill
      minBatchSize: 3,            // Minimum jobs to create a batch
      maxWaitTime: 60000,         // 1 minute - max time a job can wait in queue
      priorityThreshold: 5,       // High priority jobs bypass batching
      domainGrouping: true,       // Group jobs by domain for efficiency
      maxConcurrentBatches: 5,    // Max concurrent batch processing
    };

    // Pending jobs storage
    this.pendingJobs = new Map();
    this.batchTimers = new Map();
    
    this.initializeBatchProcessor();
  }

  /**
   * Initialize batch processing
   */
  initializeBatchProcessor() {
    // Start periodic batch creation
    setInterval(() => {
      this.processPendingBatches();
    }, 10000); // Check every 10 seconds

    logger.info('Batch job service initialized', {
      config: this.config,
      type: 'batch_service_initialized'
    });
  }

  /**
   * Add job to batch queue
   */
  async addToBatch(jobData, options = {}) {
    try {
      const job = {
        id: this.generateJobId(),
        data: jobData,
        priority: options.priority || 0,
        domain: this.extractDomain(jobData.url),
        addedAt: Date.now(),
        options
      };

      // High priority jobs bypass batching
      if (job.priority >= this.config.priorityThreshold) {
        return await this.processImmediately(job);
      }

      // Add to pending jobs
      const batchKey = this.getBatchKey(job);
      
      if (!this.pendingJobs.has(batchKey)) {
        this.pendingJobs.set(batchKey, []);
        this.startBatchTimer(batchKey);
      }

      this.pendingJobs.get(batchKey).push(job);

      logger.debug('Job added to batch queue', {
        jobId: job.id,
        batchKey,
        batchSize: this.pendingJobs.get(batchKey).length,
        type: 'job_added_to_batch'
      });

      // Check if batch is ready
      await this.checkBatchReady(batchKey);

      return job.id;
    } catch (error) {
      logger.error('Error adding job to batch', {
        jobData,
        error: error.message,
        type: 'batch_add_error'
      });
      throw error;
    }
  }

  /**
   * Generate unique job ID
   */
  generateJobId() {
    return `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Extract domain from URL
   */
  extractDomain(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.toLowerCase();
    } catch {
      return 'unknown';
    }
  }

  /**
   * Get batch key for grouping jobs
   */
  getBatchKey(job) {
    if (this.config.domainGrouping) {
      return `domain_${job.domain}`;
    }
    return 'default';
  }

  /**
   * Start batch timer
   */
  startBatchTimer(batchKey) {
    if (this.batchTimers.has(batchKey)) {
      clearTimeout(this.batchTimers.get(batchKey));
    }

    const timer = setTimeout(() => {
      this.createBatch(batchKey, 'timeout');
    }, this.config.batchTimeout);

    this.batchTimers.set(batchKey, timer);
  }

  /**
   * Check if batch is ready to be processed
   */
  async checkBatchReady(batchKey) {
    const jobs = this.pendingJobs.get(batchKey) || [];
    
    // Check if batch size reached
    if (jobs.length >= this.config.maxBatchSize) {
      await this.createBatch(batchKey, 'size_limit');
      return;
    }

    // Check for old jobs that need to be processed
    const now = Date.now();
    const oldJobs = jobs.filter(job => 
      now - job.addedAt > this.config.maxWaitTime
    );

    if (oldJobs.length > 0 && jobs.length >= this.config.minBatchSize) {
      await this.createBatch(batchKey, 'wait_time_exceeded');
    }
  }

  /**
   * Create and submit batch
   */
  async createBatch(batchKey, reason) {
    try {
      const jobs = this.pendingJobs.get(batchKey) || [];
      
      if (jobs.length === 0) {
        return;
      }

      // Clear timer
      if (this.batchTimers.has(batchKey)) {
        clearTimeout(this.batchTimers.get(batchKey));
        this.batchTimers.delete(batchKey);
      }

      // Remove from pending
      this.pendingJobs.delete(batchKey);

      // Sort jobs by priority
      jobs.sort((a, b) => b.priority - a.priority);

      const batchId = this.generateBatchId();
      const batch = {
        id: batchId,
        jobs,
        createdAt: Date.now(),
        reason,
        batchKey,
        totalJobs: jobs.length
      };

      // Submit batch to queue
      await this.batchQueue.add('process-batch', batch, {
        priority: Math.max(...jobs.map(j => j.priority)),
        jobId: batchId
      });

      logger.info('Batch created and submitted', {
        batchId,
        batchKey,
        jobCount: jobs.length,
        reason,
        type: 'batch_created'
      });

      return batchId;
    } catch (error) {
      logger.error('Error creating batch', {
        batchKey,
        reason,
        error: error.message,
        type: 'batch_create_error'
      });
      throw error;
    }
  }

  /**
   * Generate unique batch ID
   */
  generateBatchId() {
    return `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Process job immediately (bypass batching)
   */
  async processImmediately(job) {
    try {
      const immediateQueue = new Queue('scrape-jobs', {
        connection: this.redis
      });

      await immediateQueue.add('scrape-product', job.data, {
        priority: job.priority,
        jobId: job.id,
        ...job.options
      });

      logger.info('Job processed immediately', {
        jobId: job.id,
        priority: job.priority,
        type: 'job_immediate_processing'
      });

      return job.id;
    } catch (error) {
      logger.error('Error processing job immediately', {
        jobId: job.id,
        error: error.message,
        type: 'immediate_process_error'
      });
      throw error;
    }
  }

  /**
   * Process pending batches periodically
   */
  async processPendingBatches() {
    try {
      const now = Date.now();
      
      for (const [batchKey, jobs] of this.pendingJobs.entries()) {
        if (jobs.length === 0) continue;

        // Check if minimum batch size is met and timeout reached
        const oldestJob = Math.min(...jobs.map(j => j.addedAt));
        const waitTime = now - oldestJob;

        if (jobs.length >= this.config.minBatchSize && 
            waitTime > this.config.batchTimeout) {
          await this.createBatch(batchKey, 'periodic_check');
        }
        
        // Force process very old jobs even if below minimum batch size
        else if (waitTime > this.config.maxWaitTime) {
          await this.createBatch(batchKey, 'force_timeout');
        }
      }
    } catch (error) {
      logger.error('Error processing pending batches', {
        error: error.message,
        type: 'pending_batch_process_error'
      });
    }
  }

  /**
   * Get batch statistics
   */
  async getBatchStats() {
    try {
      const stats = {
        pendingBatches: this.pendingJobs.size,
        totalPendingJobs: 0,
        batchesByDomain: {},
        config: this.config
      };

      for (const [batchKey, jobs] of this.pendingJobs.entries()) {
        stats.totalPendingJobs += jobs.length;
        stats.batchesByDomain[batchKey] = {
          jobCount: jobs.length,
          oldestJob: jobs.length > 0 ? Math.min(...jobs.map(j => j.addedAt)) : null,
          averagePriority: jobs.length > 0 ? 
            jobs.reduce((sum, j) => sum + j.priority, 0) / jobs.length : 0
        };
      }

      // Get queue stats
      const queueStats = await this.batchQueue.getJobCounts();
      stats.queueStats = queueStats;

      return stats;
    } catch (error) {
      logger.error('Error getting batch stats', {
        error: error.message,
        type: 'batch_stats_error'
      });
      return null;
    }
  }

  /**
   * Force process all pending batches
   */
  async flushAllBatches() {
    try {
      const batchKeys = Array.from(this.pendingJobs.keys());
      const results = [];

      for (const batchKey of batchKeys) {
        const batchId = await this.createBatch(batchKey, 'manual_flush');
        if (batchId) {
          results.push(batchId);
        }
      }

      logger.info('All pending batches flushed', {
        batchCount: results.length,
        type: 'batches_flushed'
      });

      return results;
    } catch (error) {
      logger.error('Error flushing batches', {
        error: error.message,
        type: 'batch_flush_error'
      });
      throw error;
    }
  }

  /**
   * Cancel pending job
   */
  async cancelJob(jobId) {
    try {
      for (const [batchKey, jobs] of this.pendingJobs.entries()) {
        const jobIndex = jobs.findIndex(j => j.id === jobId);
        
        if (jobIndex !== -1) {
          jobs.splice(jobIndex, 1);
          
          // Clean up empty batches
          if (jobs.length === 0) {
            this.pendingJobs.delete(batchKey);
            if (this.batchTimers.has(batchKey)) {
              clearTimeout(this.batchTimers.get(batchKey));
              this.batchTimers.delete(batchKey);
            }
          }

          logger.info('Job cancelled from batch queue', {
            jobId,
            batchKey,
            remainingJobs: jobs.length,
            type: 'job_cancelled'
          });

          return true;
        }
      }

      return false;
    } catch (error) {
      logger.error('Error cancelling job', {
        jobId,
        error: error.message,
        type: 'job_cancel_error'
      });
      return false;
    }
  }

  /**
   * Update batch configuration
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    logger.info('Batch service configuration updated', {
      config: this.config,
      type: 'batch_config_updated'
    });
  }

  /**
   * Get job status
   */
  async getJobStatus(jobId) {
    try {
      // Check pending jobs
      for (const [batchKey, jobs] of this.pendingJobs.entries()) {
        const job = jobs.find(j => j.id === jobId);
        if (job) {
          return {
            status: 'pending',
            batchKey,
            addedAt: job.addedAt,
            waitTime: Date.now() - job.addedAt,
            priority: job.priority
          };
        }
      }

      // Check batch queue
      const batchJob = await this.batchQueue.getJob(jobId);
      if (batchJob) {
        return {
          status: batchJob.finishedOn ? 'completed' : 
                  batchJob.failedReason ? 'failed' : 'processing',
          batchId: batchJob.id,
          progress: batchJob.progress,
          processedOn: batchJob.processedOn,
          finishedOn: batchJob.finishedOn,
          failedReason: batchJob.failedReason
        };
      }

      return null;
    } catch (error) {
      logger.error('Error getting job status', {
        jobId,
        error: error.message,
        type: 'job_status_error'
      });
      return null;
    }
  }

  /**
   * Cleanup old data
   */
  async cleanup() {
    try {
      const now = Date.now();
      let cleanedJobs = 0;

      // Clean up very old pending jobs
      for (const [batchKey, jobs] of this.pendingJobs.entries()) {
        const validJobs = jobs.filter(job => 
          now - job.addedAt < this.config.maxWaitTime * 2
        );
        
        cleanedJobs += jobs.length - validJobs.length;
        
        if (validJobs.length === 0) {
          this.pendingJobs.delete(batchKey);
          if (this.batchTimers.has(batchKey)) {
            clearTimeout(this.batchTimers.get(batchKey));
            this.batchTimers.delete(batchKey);
          }
        } else {
          this.pendingJobs.set(batchKey, validJobs);
        }
      }

      if (cleanedJobs > 0) {
        logger.info('Batch service cleanup completed', {
          cleanedJobs,
          type: 'batch_cleanup'
        });
      }

      return cleanedJobs;
    } catch (error) {
      logger.error('Error during batch service cleanup', {
        error: error.message,
        type: 'batch_cleanup_error'
      });
      return 0;
    }
  }

  /**
   * Shutdown batch service
   */
  async shutdown() {
    try {
      // Clear all timers
      for (const timer of this.batchTimers.values()) {
        clearTimeout(timer);
      }
      this.batchTimers.clear();

      // Flush remaining batches
      await this.flushAllBatches();

      // Close queue
      await this.batchQueue.close();

      logger.info('Batch service shutdown completed', {
        type: 'batch_service_shutdown'
      });
    } catch (error) {
      logger.error('Error during batch service shutdown', {
        error: error.message,
        type: 'batch_shutdown_error'
      });
    }
  }
}

export default BatchJobService;