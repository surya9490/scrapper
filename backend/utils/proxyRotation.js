import { getRedisClient } from './redis.js';
import logger from './logger.js';

class ProxyRotationService {
  constructor() {
    this.redis = getRedisClient();
    
    // Proxy configuration
    this.config = {
      healthCheckInterval: 300000,    // 5 minutes
      failureThreshold: 3,            // Mark proxy as unhealthy after 3 failures
      recoveryTime: 1800000,          // 30 minutes before retrying failed proxy
      maxConcurrentRequests: 5,       // Max concurrent requests per proxy
      rotationStrategy: 'round_robin', // 'round_robin', 'random', 'least_used'
    };

    // Proxy pool - these would typically come from environment variables or config
    this.proxyPool = [
      // Example proxy configurations - replace with actual proxy services
      // {
      //   id: 'proxy1',
      //   host: 'proxy1.example.com',
      //   port: 8080,
      //   username: 'user1',
      //   password: 'pass1',
      //   type: 'http', // 'http', 'https', 'socks4', 'socks5'
      //   country: 'US',
      //   provider: 'provider1'
      // }
    ];

    this.currentIndex = 0;
    this.initializeFromEnv();
  }

  /**
   * Initialize proxy pool from environment variables
   */
  initializeFromEnv() {
    try {
      // Load proxies from environment variable
      const proxyConfig = process.env.PROXY_CONFIG;
      if (proxyConfig) {
        this.proxyPool = JSON.parse(proxyConfig);
        logger.info('Proxy pool loaded from environment', {
          count: this.proxyPool.length,
          type: 'proxy_pool_loaded'
        });
      }

      // Load individual proxy from environment
      const proxyHost = process.env.PROXY_HOST;
      const proxyPort = process.env.PROXY_PORT;
      const proxyUser = process.env.PROXY_USERNAME;
      const proxyPass = process.env.PROXY_PASSWORD;

      if (proxyHost && proxyPort) {
        const envProxy = {
          id: 'env_proxy',
          host: proxyHost,
          port: parseInt(proxyPort),
          username: proxyUser,
          password: proxyPass,
          type: process.env.PROXY_TYPE || 'http',
          country: process.env.PROXY_COUNTRY || 'Unknown',
          provider: 'environment'
        };
        
        this.proxyPool.push(envProxy);
        logger.info('Proxy added from environment variables', {
          proxy: envProxy.id,
          type: 'proxy_env_loaded'
        });
      }

    } catch (error) {
      logger.error('Error loading proxy configuration', {
        error: error.message,
        type: 'proxy_config_error'
      });
    }
  }

  /**
   * Get Redis keys for proxy data
   */
  getKeys(proxyId) {
    return {
      health: `proxy:health:${proxyId}`,
      failures: `proxy:failures:${proxyId}`,
      lastUsed: `proxy:last_used:${proxyId}`,
      activeRequests: `proxy:active:${proxyId}`,
      stats: `proxy:stats:${proxyId}`,
      lastFailure: `proxy:last_failure:${proxyId}`
    };
  }

  /**
   * Get next proxy based on rotation strategy
   */
  async getNextProxy() {
    if (this.proxyPool.length === 0) {
      return null;
    }

    const healthyProxies = await this.getHealthyProxies();
    
    if (healthyProxies.length === 0) {
      logger.warn('No healthy proxies available', {
        totalProxies: this.proxyPool.length,
        type: 'proxy_no_healthy'
      });
      return null;
    }

    let selectedProxy;

    switch (this.config.rotationStrategy) {
      case 'random':
        selectedProxy = healthyProxies[Math.floor(Math.random() * healthyProxies.length)];
        break;
      
      case 'least_used':
        selectedProxy = await this.getLeastUsedProxy(healthyProxies);
        break;
      
      case 'round_robin':
      default:
        this.currentIndex = (this.currentIndex + 1) % healthyProxies.length;
        selectedProxy = healthyProxies[this.currentIndex];
        break;
    }

    // Check concurrent request limit
    if (await this.isProxyOverloaded(selectedProxy.id)) {
      // Try to find another proxy
      const availableProxies = [];
      for (const proxy of healthyProxies) {
        if (!(await this.isProxyOverloaded(proxy.id))) {
          availableProxies.push(proxy);
        }
      }
      
      if (availableProxies.length > 0) {
        selectedProxy = availableProxies[0];
      } else {
        logger.warn('All proxies are overloaded', {
          type: 'proxy_all_overloaded'
        });
        return null;
      }
    }

    await this.recordProxyUsage(selectedProxy.id);
    return selectedProxy;
  }

  /**
   * Get healthy proxies
   */
  async getHealthyProxies() {
    const healthyProxies = [];
    
    for (const proxy of this.proxyPool) {
      if (await this.isProxyHealthy(proxy.id)) {
        healthyProxies.push(proxy);
      }
    }

    return healthyProxies;
  }

  /**
   * Check if proxy is healthy
   */
  async isProxyHealthy(proxyId) {
    try {
      const keys = this.getKeys(proxyId);
      const [health, failures, lastFailure] = await Promise.all([
        this.redis.get(keys.health),
        this.redis.get(keys.failures),
        this.redis.get(keys.lastFailure)
      ]);

      // If explicitly marked as unhealthy
      if (health === 'unhealthy') {
        // Check if recovery time has passed
        if (lastFailure) {
          const timeSinceFailure = Date.now() - parseInt(lastFailure);
          if (timeSinceFailure >= this.config.recoveryTime) {
            // Reset proxy health for retry
            await this.resetProxyHealth(proxyId);
            return true;
          }
        }
        return false;
      }

      // Check failure count
      const failureCount = parseInt(failures || '0');
      return failureCount < this.config.failureThreshold;

    } catch (error) {
      logger.error('Error checking proxy health', {
        proxyId,
        error: error.message,
        type: 'proxy_health_check_error'
      });
      return true; // Assume healthy if we can't check
    }
  }

  /**
   * Check if proxy is overloaded
   */
  async isProxyOverloaded(proxyId) {
    try {
      const keys = this.getKeys(proxyId);
      const activeRequests = await this.redis.get(keys.activeRequests);
      const count = parseInt(activeRequests || '0');
      
      return count >= this.config.maxConcurrentRequests;
    } catch (error) {
      logger.error('Error checking proxy load', {
        proxyId,
        error: error.message,
        type: 'proxy_load_check_error'
      });
      return false;
    }
  }

  /**
   * Get least used proxy
   */
  async getLeastUsedProxy(proxies) {
    let leastUsedProxy = proxies[0];
    let minUsage = Infinity;

    for (const proxy of proxies) {
      const keys = this.getKeys(proxy.id);
      const lastUsed = await this.redis.get(keys.lastUsed);
      const usage = lastUsed ? parseInt(lastUsed) : 0;
      
      if (usage < minUsage) {
        minUsage = usage;
        leastUsedProxy = proxy;
      }
    }

    return leastUsedProxy;
  }

  /**
   * Record proxy usage
   */
  async recordProxyUsage(proxyId) {
    try {
      const keys = this.getKeys(proxyId);
      const now = Date.now();
      
      await Promise.all([
        this.redis.set(keys.lastUsed, now.toString()),
        this.redis.incr(keys.activeRequests),
        this.redis.expire(keys.activeRequests, 300) // 5 minutes expiry
      ]);

      logger.debug('Proxy usage recorded', {
        proxyId,
        timestamp: now,
        type: 'proxy_usage_recorded'
      });

    } catch (error) {
      logger.error('Error recording proxy usage', {
        proxyId,
        error: error.message,
        type: 'proxy_usage_record_error'
      });
    }
  }

  /**
   * Record proxy request completion
   */
  async recordProxyCompletion(proxyId, success = true) {
    try {
      const keys = this.getKeys(proxyId);
      
      // Decrement active requests
      const activeRequests = await this.redis.get(keys.activeRequests);
      if (activeRequests && parseInt(activeRequests) > 0) {
        await this.redis.decr(keys.activeRequests);
      }

      // Update stats
      const statsKey = keys.stats;
      const stats = await this.redis.hgetall(statsKey);
      const currentStats = {
        total: parseInt(stats.total || '0'),
        success: parseInt(stats.success || '0'),
        failure: parseInt(stats.failure || '0')
      };

      currentStats.total++;
      if (success) {
        currentStats.success++;
      } else {
        currentStats.failure++;
      }

      await this.redis.hmset(statsKey, currentStats);
      await this.redis.expire(statsKey, 86400); // 24 hours

      logger.debug('Proxy completion recorded', {
        proxyId,
        success,
        stats: currentStats,
        type: 'proxy_completion_recorded'
      });

    } catch (error) {
      logger.error('Error recording proxy completion', {
        proxyId,
        success,
        error: error.message,
        type: 'proxy_completion_record_error'
      });
    }
  }

  /**
   * Record proxy failure
   */
  async recordProxyFailure(proxyId, error) {
    try {
      const keys = this.getKeys(proxyId);
      const failures = await this.redis.incr(keys.failures);
      const now = Date.now();
      
      await Promise.all([
        this.redis.set(keys.lastFailure, now.toString()),
        this.redis.expire(keys.failures, this.config.recoveryTime / 1000)
      ]);

      // Mark as unhealthy if threshold exceeded
      if (failures >= this.config.failureThreshold) {
        await this.redis.set(keys.health, 'unhealthy');
        await this.redis.expire(keys.health, this.config.recoveryTime / 1000);
        
        logger.warn('Proxy marked as unhealthy', {
          proxyId,
          failures,
          threshold: this.config.failureThreshold,
          type: 'proxy_marked_unhealthy'
        });
      }

      await this.recordProxyCompletion(proxyId, false);

      logger.warn('Proxy failure recorded', {
        proxyId,
        failures,
        error: error?.message,
        type: 'proxy_failure_recorded'
      });

    } catch (redisError) {
      logger.error('Error recording proxy failure', {
        proxyId,
        error: redisError.message,
        type: 'proxy_failure_record_error'
      });
    }
  }

  /**
   * Record proxy success
   */
  async recordProxySuccess(proxyId) {
    try {
      const keys = this.getKeys(proxyId);
      
      // Reset failure count on success
      await this.redis.del(keys.failures);
      await this.redis.set(keys.health, 'healthy');
      
      await this.recordProxyCompletion(proxyId, true);

      logger.debug('Proxy success recorded', {
        proxyId,
        type: 'proxy_success_recorded'
      });

    } catch (error) {
      logger.error('Error recording proxy success', {
        proxyId,
        error: error.message,
        type: 'proxy_success_record_error'
      });
    }
  }

  /**
   * Reset proxy health
   */
  async resetProxyHealth(proxyId) {
    try {
      const keys = this.getKeys(proxyId);
      
      await Promise.all([
        this.redis.del(keys.health),
        this.redis.del(keys.failures),
        this.redis.del(keys.lastFailure)
      ]);

      logger.info('Proxy health reset', {
        proxyId,
        type: 'proxy_health_reset'
      });

    } catch (error) {
      logger.error('Error resetting proxy health', {
        proxyId,
        error: error.message,
        type: 'proxy_health_reset_error'
      });
    }
  }

  /**
   * Get proxy statistics
   */
  async getProxyStats() {
    try {
      const stats = {};
      
      for (const proxy of this.proxyPool) {
        const keys = this.getKeys(proxy.id);
        const [health, failures, lastUsed, activeRequests, proxyStats] = await Promise.all([
          this.redis.get(keys.health),
          this.redis.get(keys.failures),
          this.redis.get(keys.lastUsed),
          this.redis.get(keys.activeRequests),
          this.redis.hgetall(keys.stats)
        ]);

        stats[proxy.id] = {
          ...proxy,
          health: health || 'healthy',
          failures: parseInt(failures || '0'),
          lastUsed: lastUsed ? new Date(parseInt(lastUsed)) : null,
          activeRequests: parseInt(activeRequests || '0'),
          stats: {
            total: parseInt(proxyStats.total || '0'),
            success: parseInt(proxyStats.success || '0'),
            failure: parseInt(proxyStats.failure || '0')
          }
        };
      }

      return stats;
    } catch (error) {
      logger.error('Error getting proxy stats', {
        error: error.message,
        type: 'proxy_stats_error'
      });
      return {};
    }
  }

  /**
   * Add proxy to pool
   */
  addProxy(proxy) {
    if (!proxy.id || !proxy.host || !proxy.port) {
      throw new Error('Proxy must have id, host, and port');
    }

    this.proxyPool.push(proxy);
    logger.info('Proxy added to pool', {
      proxyId: proxy.id,
      host: proxy.host,
      port: proxy.port,
      type: 'proxy_added'
    });
  }

  /**
   * Remove proxy from pool
   */
  removeProxy(proxyId) {
    const index = this.proxyPool.findIndex(p => p.id === proxyId);
    if (index !== -1) {
      this.proxyPool.splice(index, 1);
      logger.info('Proxy removed from pool', {
        proxyId,
        type: 'proxy_removed'
      });
      return true;
    }
    return false;
  }

  /**
   * Get proxy configuration for HTTP client
   */
  getProxyConfig(proxy) {
    if (!proxy) return null;

    const config = {
      host: proxy.host,
      port: proxy.port,
      protocol: proxy.type || 'http'
    };

    if (proxy.username && proxy.password) {
      config.auth = {
        username: proxy.username,
        password: proxy.password
      };
    }

    return config;
  }

  /**
   * Get proxy URL for Playwright
   */
  getProxyUrl(proxy) {
    if (!proxy) return null;

    let url = `${proxy.type || 'http'}://`;
    
    if (proxy.username && proxy.password) {
      url += `${proxy.username}:${proxy.password}@`;
    }
    
    url += `${proxy.host}:${proxy.port}`;
    
    return url;
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    logger.info('Proxy rotation configuration updated', {
      config: this.config,
      type: 'proxy_config_updated'
    });
  }

  /**
   * Health check all proxies
   */
  async healthCheckAll() {
    logger.info('Starting proxy health check', {
      proxyCount: this.proxyPool.length,
      type: 'proxy_health_check_start'
    });

    const results = [];
    
    for (const proxy of this.proxyPool) {
      try {
        // Simple health check - could be enhanced with actual HTTP requests
        const isHealthy = await this.isProxyHealthy(proxy.id);
        results.push({
          proxyId: proxy.id,
          healthy: isHealthy
        });
      } catch (error) {
        logger.error('Health check failed for proxy', {
          proxyId: proxy.id,
          error: error.message,
          type: 'proxy_health_check_failed'
        });
        results.push({
          proxyId: proxy.id,
          healthy: false,
          error: error.message
        });
      }
    }

    logger.info('Proxy health check completed', {
      total: results.length,
      healthy: results.filter(r => r.healthy).length,
      unhealthy: results.filter(r => !r.healthy).length,
      type: 'proxy_health_check_completed'
    });

    return results;
  }
}

export default ProxyRotationService;