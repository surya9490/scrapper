import { getRedisClient } from './redis.js';
import logger from './logger.js';

class CacheService {
  constructor() {
    this.redis = getRedisClient();
    
    // Default TTL values (in seconds)
    this.defaultTTL = {
      product: 3600,          // 1 hour for product data
      price: 1800,            // 30 minutes for price data
      availability: 900,      // 15 minutes for availability
      metadata: 7200,         // 2 hours for metadata
      search: 1800,           // 30 minutes for search results
      user: 3600,             // 1 hour for user data
      session: 86400,         // 24 hours for session data
      config: 43200,          // 12 hours for configuration
      analytics: 300,         // 5 minutes for analytics data
      temporary: 300,         // 5 minutes for temporary data
    };

    // Cache key prefixes
    this.prefixes = {
      product: 'cache:product:',
      price: 'cache:price:',
      availability: 'cache:availability:',
      metadata: 'cache:metadata:',
      search: 'cache:search:',
      user: 'cache:user:',
      session: 'cache:session:',
      config: 'cache:config:',
      analytics: 'cache:analytics:',
      temporary: 'cache:temp:',
    };
  }

  /**
   * Generate cache key with prefix
   */
  generateKey(type, identifier) {
    const prefix = this.prefixes[type] || 'cache:general:';
    return `${prefix}${identifier}`;
  }

  /**
   * Set cache with TTL
   */
  async set(type, key, value, customTTL = null) {
    try {
      const cacheKey = this.generateKey(type, key);
      const ttl = customTTL || this.defaultTTL[type] || this.defaultTTL.temporary;
      
      let serializedValue;
      if (typeof value === 'object') {
        serializedValue = JSON.stringify(value);
      } else {
        serializedValue = String(value);
      }

      await this.redis.setex(cacheKey, ttl, serializedValue);
      
      logger.debug('Cache set', {
        type,
        key: cacheKey,
        ttl,
        size: serializedValue.length,
        operation: 'cache_set'
      });

      return true;
    } catch (error) {
      logger.error('Error setting cache', {
        type,
        key,
        error: error.message,
        operation: 'cache_set_error'
      });
      return false;
    }
  }

  /**
   * Get cache value
   */
  async get(type, key) {
    try {
      const cacheKey = this.generateKey(type, key);
      const value = await this.redis.get(cacheKey);
      
      if (value === null) {
        logger.debug('Cache miss', {
          type,
          key: cacheKey,
          operation: 'cache_miss'
        });
        return null;
      }

      // Try to parse as JSON, fallback to string
      let parsedValue;
      try {
        parsedValue = JSON.parse(value);
      } catch {
        parsedValue = value;
      }

      logger.debug('Cache hit', {
        type,
        key: cacheKey,
        operation: 'cache_hit'
      });

      return parsedValue;
    } catch (error) {
      logger.error('Error getting cache', {
        type,
        key,
        error: error.message,
        operation: 'cache_get_error'
      });
      return null;
    }
  }

  /**
   * Delete cache entry
   */
  async delete(type, key) {
    try {
      const cacheKey = this.generateKey(type, key);
      const result = await this.redis.del(cacheKey);
      
      logger.debug('Cache deleted', {
        type,
        key: cacheKey,
        existed: result > 0,
        operation: 'cache_delete'
      });

      return result > 0;
    } catch (error) {
      logger.error('Error deleting cache', {
        type,
        key,
        error: error.message,
        operation: 'cache_delete_error'
      });
      return false;
    }
  }

  /**
   * Check if cache key exists
   */
  async exists(type, key) {
    try {
      const cacheKey = this.generateKey(type, key);
      const exists = await this.redis.exists(cacheKey);
      return exists === 1;
    } catch (error) {
      logger.error('Error checking cache existence', {
        type,
        key,
        error: error.message,
        operation: 'cache_exists_error'
      });
      return false;
    }
  }

  /**
   * Get TTL for cache key
   */
  async getTTL(type, key) {
    try {
      const cacheKey = this.generateKey(type, key);
      const ttl = await this.redis.ttl(cacheKey);
      return ttl;
    } catch (error) {
      logger.error('Error getting cache TTL', {
        type,
        key,
        error: error.message,
        operation: 'cache_ttl_error'
      });
      return -1;
    }
  }

  /**
   * Extend TTL for existing cache key
   */
  async extendTTL(type, key, additionalSeconds) {
    try {
      const cacheKey = this.generateKey(type, key);
      const currentTTL = await this.redis.ttl(cacheKey);
      
      if (currentTTL > 0) {
        const newTTL = currentTTL + additionalSeconds;
        await this.redis.expire(cacheKey, newTTL);
        
        logger.debug('Cache TTL extended', {
          type,
          key: cacheKey,
          oldTTL: currentTTL,
          newTTL,
          operation: 'cache_ttl_extended'
        });
        
        return true;
      }
      
      return false;
    } catch (error) {
      logger.error('Error extending cache TTL', {
        type,
        key,
        error: error.message,
        operation: 'cache_ttl_extend_error'
      });
      return false;
    }
  }

  /**
   * Get or set cache (cache-aside pattern)
   */
  async getOrSet(type, key, fetchFunction, customTTL = null) {
    try {
      // Try to get from cache first
      let value = await this.get(type, key);
      
      if (value !== null) {
        return value;
      }

      // Cache miss - fetch data
      logger.debug('Cache miss, fetching data', {
        type,
        key,
        operation: 'cache_fetch'
      });

      value = await fetchFunction();
      
      if (value !== null && value !== undefined) {
        // Store in cache
        await this.set(type, key, value, customTTL);
      }

      return value;
    } catch (error) {
      logger.error('Error in getOrSet cache operation', {
        type,
        key,
        error: error.message,
        operation: 'cache_get_or_set_error'
      });
      
      // If cache fails, still try to fetch data
      try {
        return await fetchFunction();
      } catch (fetchError) {
        logger.error('Error fetching data after cache failure', {
          type,
          key,
          error: fetchError.message,
          operation: 'cache_fetch_fallback_error'
        });
        throw fetchError;
      }
    }
  }

  /**
   * Invalidate cache by pattern
   */
  async invalidatePattern(type, pattern = '*') {
    try {
      const prefix = this.prefixes[type] || 'cache:general:';
      const searchPattern = `${prefix}${pattern}`;
      
      const keys = await this.redis.keys(searchPattern);
      
      if (keys.length > 0) {
        await this.redis.del(...keys);
        
        logger.info('Cache invalidated by pattern', {
          type,
          pattern: searchPattern,
          keysDeleted: keys.length,
          operation: 'cache_invalidate_pattern'
        });
      }

      return keys.length;
    } catch (error) {
      logger.error('Error invalidating cache by pattern', {
        type,
        pattern,
        error: error.message,
        operation: 'cache_invalidate_pattern_error'
      });
      return 0;
    }
  }

  /**
   * Get cache statistics
   */
  async getStats() {
    try {
      const stats = {};
      
      for (const [type, prefix] of Object.entries(this.prefixes)) {
        const keys = await this.redis.keys(`${prefix}*`);
        stats[type] = {
          count: keys.length,
          keys: keys.slice(0, 10) // Show first 10 keys as sample
        };
      }

      const info = await this.redis.info('memory');
      const memoryInfo = {};
      
      info.split('\r\n').forEach(line => {
        if (line.includes(':')) {
          const [key, value] = line.split(':');
          if (key.startsWith('used_memory')) {
            memoryInfo[key] = value;
          }
        }
      });

      return {
        cacheStats: stats,
        memoryInfo,
        defaultTTL: this.defaultTTL
      };
    } catch (error) {
      logger.error('Error getting cache stats', {
        error: error.message,
        operation: 'cache_stats_error'
      });
      return null;
    }
  }

  /**
   * Warm up cache with data
   */
  async warmUp(type, dataMap, customTTL = null) {
    try {
      const promises = Object.entries(dataMap).map(([key, value]) =>
        this.set(type, key, value, customTTL)
      );

      const results = await Promise.allSettled(promises);
      const successful = results.filter(r => r.status === 'fulfilled' && r.value).length;

      logger.info('Cache warm-up completed', {
        type,
        total: Object.keys(dataMap).length,
        successful,
        failed: Object.keys(dataMap).length - successful,
        operation: 'cache_warmup'
      });

      return successful;
    } catch (error) {
      logger.error('Error warming up cache', {
        type,
        error: error.message,
        operation: 'cache_warmup_error'
      });
      return 0;
    }
  }

  /**
   * Update default TTL for a type
   */
  updateTTL(type, ttl) {
    this.defaultTTL[type] = ttl;
    logger.info('Default TTL updated', {
      type,
      ttl,
      operation: 'cache_ttl_updated'
    });
  }

  /**
   * Clear all cache
   */
  async clearAll() {
    try {
      const allKeys = await this.redis.keys('cache:*');
      
      if (allKeys.length > 0) {
        await this.redis.del(...allKeys);
        
        logger.warn('All cache cleared', {
          keysDeleted: allKeys.length,
          operation: 'cache_clear_all'
        });
      }

      return allKeys.length;
    } catch (error) {
      logger.error('Error clearing all cache', {
        error: error.message,
        operation: 'cache_clear_all_error'
      });
      return 0;
    }
  }

  /**
   * Batch get multiple cache keys
   */
  async batchGet(type, keys) {
    try {
      const cacheKeys = keys.map(key => this.generateKey(type, key));
      const values = await this.redis.mget(...cacheKeys);
      
      const result = {};
      keys.forEach((key, index) => {
        const value = values[index];
        if (value !== null) {
          try {
            result[key] = JSON.parse(value);
          } catch {
            result[key] = value;
          }
        }
      });

      logger.debug('Batch cache get', {
        type,
        requested: keys.length,
        found: Object.keys(result).length,
        operation: 'cache_batch_get'
      });

      return result;
    } catch (error) {
      logger.error('Error in batch cache get', {
        type,
        keys,
        error: error.message,
        operation: 'cache_batch_get_error'
      });
      return {};
    }
  }

  /**
   * Batch set multiple cache keys
   */
  async batchSet(type, dataMap, customTTL = null) {
    try {
      const ttl = customTTL || this.defaultTTL[type] || this.defaultTTL.temporary;
      const pipeline = this.redis.pipeline();

      Object.entries(dataMap).forEach(([key, value]) => {
        const cacheKey = this.generateKey(type, key);
        const serializedValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
        pipeline.setex(cacheKey, ttl, serializedValue);
      });

      await pipeline.exec();

      logger.debug('Batch cache set', {
        type,
        count: Object.keys(dataMap).length,
        ttl,
        operation: 'cache_batch_set'
      });

      return true;
    } catch (error) {
      logger.error('Error in batch cache set', {
        type,
        error: error.message,
        operation: 'cache_batch_set_error'
      });
      return false;
    }
  }
}

export default CacheService;