import IORedis from 'ioredis';
import logger from './logger.js';

let redisClient = null;

/**
 * Initialize Redis connection with proper validation and configuration
 */
export function initializeRedis() {
  const redisUrl = process.env.REDIS_URL;
  const isProduction = process.env.NODE_ENV === 'production';

  // Fail-fast validation for production
  if (isProduction && !redisUrl) {
    logger.error('REDIS_URL is required in production environment', {
      type: 'redis_config_error',
      environment: process.env.NODE_ENV
    });
    process.exit(1);
  }

  // Default to localhost for development
  const connectionString = redisUrl || 'redis://localhost:6379';

  try {
    redisClient = new IORedis(connectionString, {
      // Connection options for rate limiting compatibility
      maxRetriesPerRequest: 3, // Allow retries for rate limiting
      enableReadyCheck: false,
      maxLoadingTimeout: 1000,
      
      // Connection pool settings
      lazyConnect: true,
      keepAlive: 30000,
      
      // Retry configuration
      retryDelayOnClusterDown: 300,
      retryDelayOnFailover: 100,
      
      // Timeouts
      connectTimeout: 10000,
      commandTimeout: 30000, // Increased timeout for stability
      
      // Enable offline queue for rate limiting
      enableOfflineQueue: true,
      
      // Family preference (IPv4)
      family: 4,
    });

    // Event handlers
    redisClient.on('connect', () => {
      logger.info('Redis connection established', {
        type: 'redis_connected',
        url: connectionString.replace(/\/\/.*@/, '//***@') // Hide credentials in logs
      });
    });

    redisClient.on('ready', () => {
      logger.info('Redis client ready', { type: 'redis_ready' });
    });

    redisClient.on('error', (error) => {
      logger.error('Redis connection error', {
        type: 'redis_error',
        error: error.message,
        code: error.code
      });
      
      // Fail-fast in production for critical Redis errors
      if (isProduction && (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND')) {
        logger.error('Critical Redis error in production, exiting', {
          type: 'redis_critical_error',
          error: error.message
        });
        process.exit(1);
      }
    });

    redisClient.on('close', () => {
      logger.warn('Redis connection closed', { type: 'redis_disconnected' });
    });

    redisClient.on('reconnecting', (delay) => {
      logger.info('Redis reconnecting', { 
        type: 'redis_reconnecting',
        delay: `${delay}ms`
      });
    });

    return redisClient;
  } catch (error) {
    logger.error('Failed to initialize Redis client', {
      type: 'redis_init_error',
      error: error.message
    });
    
    if (isProduction) {
      process.exit(1);
    }
    
    throw error;
  }
}

/**
 * Get the Redis client instance
 */
export function getRedisClient() {
  if (!redisClient) {
    return initializeRedis();
  }
  return redisClient;
}

/**
 * Test Redis connection
 */
export async function testRedisConnection() {
  try {
    const client = getRedisClient();
    await client.ping();
    logger.info('Redis connection test successful', { type: 'redis_test_success' });
    return true;
  } catch (error) {
    logger.error('Redis connection test failed', {
      type: 'redis_test_failed',
      error: error.message
    });
    return false;
  }
}

/**
 * Gracefully disconnect Redis
 */
export async function disconnectRedis() {
  if (redisClient) {
    try {
      await redisClient.quit();
      logger.info('Redis disconnected gracefully', { type: 'redis_disconnected' });
    } catch (error) {
      logger.error('Error disconnecting Redis', {
        type: 'redis_disconnect_error',
        error: error.message
      });
    } finally {
      redisClient = null;
    }
  }
}

// Graceful shutdown handlers
process.on('SIGTERM', async () => {
  await disconnectRedis();
});

process.on('SIGINT', async () => {
  await disconnectRedis();
});

process.on('uncaughtException', async (error) => {
  logger.error('Uncaught exception, disconnecting Redis', {
    type: 'uncaught_exception',
    error: error.message
  });
  await disconnectRedis();
});

process.on('unhandledRejection', async (reason) => {
  logger.error('Unhandled rejection, disconnecting Redis', {
    type: 'unhandled_rejection',
    reason: reason?.message || reason
  });
  await disconnectRedis();
});