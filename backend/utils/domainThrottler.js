import { getRedisClient } from './redis.js';
import logger from './logger.js';

class DomainThrottler {
  constructor() {
    this.redis = getRedisClient();
    this.defaultDelay = 2000; // 2 seconds between requests to same domain
    this.domainDelays = new Map([
      // Popular e-commerce sites with stricter limits
      ['amazon.com', 5000],
      ['amazon.co.uk', 5000],
      ['amazon.ca', 5000],
      ['ebay.com', 3000],
      ['ebay.co.uk', 3000],
      ['walmart.com', 4000],
      ['target.com', 3000],
      ['bestbuy.com', 3000],
      ['homedepot.com', 3000],
      ['lowes.com', 3000],
      
      // Shopify stores (more lenient)
      ['shopify.com', 1500],
      
      // Social commerce
      ['etsy.com', 2500],
      ['mercari.com', 2500],
      
      // Default for unknown domains
      ['default', this.defaultDelay]
    ]);
  }

  /**
   * Get the appropriate delay for a domain
   */
  getDelayForDomain(domain) {
    // Check for exact match first
    if (this.domainDelays.has(domain)) {
      return this.domainDelays.get(domain);
    }

    // Check for parent domain matches
    for (const [configDomain, delay] of this.domainDelays.entries()) {
      if (domain.includes(configDomain) || configDomain.includes(domain)) {
        return delay;
      }
    }

    return this.defaultDelay;
  }

  /**
   * Get Redis key for domain throttling
   */
  getThrottleKey(domain) {
    return `throttle:domain:${domain}`;
  }

  /**
   * Throttle requests to a specific domain
   */
  async throttle(domain) {
    if (!domain) {
      logger.warn('No domain provided for throttling');
      return;
    }

    const normalizedDomain = domain.toLowerCase();
    const throttleKey = this.getThrottleKey(normalizedDomain);
    const delay = this.getDelayForDomain(normalizedDomain);

    try {
      // Check if we need to wait
      const lastRequest = await this.redis.get(throttleKey);
      
      if (lastRequest) {
        const timeSinceLastRequest = Date.now() - parseInt(lastRequest);
        const remainingDelay = delay - timeSinceLastRequest;

        if (remainingDelay > 0) {
          logger.info(`Throttling domain ${normalizedDomain}`, {
            domain: normalizedDomain,
            delay: remainingDelay,
            configuredDelay: delay,
            type: 'domain_throttle'
          });

          await new Promise(resolve => setTimeout(resolve, remainingDelay));
        }
      }

      // Record this request timestamp
      await this.redis.setex(throttleKey, Math.ceil(delay / 1000) + 10, Date.now().toString());

      logger.debug(`Domain throttle check completed for ${normalizedDomain}`, {
        domain: normalizedDomain,
        delay,
        type: 'domain_throttle_completed'
      });

    } catch (error) {
      logger.error('Error in domain throttling', {
        domain: normalizedDomain,
        error: error.message,
        type: 'domain_throttle_error'
      });
      
      // Fallback to simple delay if Redis fails
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  /**
   * Get throttling statistics for monitoring
   */
  async getThrottleStats() {
    try {
      const keys = await this.redis.keys('throttle:domain:*');
      const stats = {};

      for (const key of keys) {
        const domain = key.replace('throttle:domain:', '');
        const lastRequest = await this.redis.get(key);
        const ttl = await this.redis.ttl(key);
        
        stats[domain] = {
          lastRequest: lastRequest ? new Date(parseInt(lastRequest)) : null,
          ttl,
          configuredDelay: this.getDelayForDomain(domain)
        };
      }

      return stats;
    } catch (error) {
      logger.error('Error getting throttle stats', { error: error.message });
      return {};
    }
  }

  /**
   * Clear throttling for a specific domain (admin function)
   */
  async clearDomainThrottle(domain) {
    if (!domain) return false;

    try {
      const normalizedDomain = domain.toLowerCase();
      const throttleKey = this.getThrottleKey(normalizedDomain);
      const result = await this.redis.del(throttleKey);
      
      logger.info(`Cleared throttle for domain ${normalizedDomain}`, {
        domain: normalizedDomain,
        type: 'domain_throttle_cleared'
      });

      return result > 0;
    } catch (error) {
      logger.error('Error clearing domain throttle', {
        domain,
        error: error.message
      });
      return false;
    }
  }

  /**
   * Update delay configuration for a domain
   */
  setDomainDelay(domain, delay) {
    if (!domain || delay < 0) return false;

    const normalizedDomain = domain.toLowerCase();
    this.domainDelays.set(normalizedDomain, delay);
    
    logger.info(`Updated delay for domain ${normalizedDomain}`, {
      domain: normalizedDomain,
      delay,
      type: 'domain_delay_updated'
    });

    return true;
  }

  /**
   * Get current domain delay configurations
   */
  getDomainDelays() {
    return Object.fromEntries(this.domainDelays);
  }

  /**
   * Batch throttle multiple domains (useful for batch operations)
   */
  async batchThrottle(domains) {
    if (!Array.isArray(domains) || domains.length === 0) {
      return;
    }

    const uniqueDomains = [...new Set(domains.map(d => d.toLowerCase()))];
    
    logger.info(`Batch throttling ${uniqueDomains.length} domains`, {
      domains: uniqueDomains,
      type: 'batch_domain_throttle'
    });

    // Process domains sequentially to respect individual throttling
    for (const domain of uniqueDomains) {
      await this.throttle(domain);
    }
  }

  /**
   * Check if a domain is currently throttled
   */
  async isDomainThrottled(domain) {
    if (!domain) return false;

    try {
      const normalizedDomain = domain.toLowerCase();
      const throttleKey = this.getThrottleKey(normalizedDomain);
      const lastRequest = await this.redis.get(throttleKey);
      
      if (!lastRequest) return false;

      const delay = this.getDelayForDomain(normalizedDomain);
      const timeSinceLastRequest = Date.now() - parseInt(lastRequest);
      
      return timeSinceLastRequest < delay;
    } catch (error) {
      logger.error('Error checking domain throttle status', {
        domain,
        error: error.message
      });
      return false;
    }
  }
}

export default DomainThrottler;