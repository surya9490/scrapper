import { getRedisClient } from './redis.js';
import logger from './logger.js';

class CircuitBreaker {
  constructor() {
    this.redis = getRedisClient();
    
    // Circuit breaker configuration
    this.config = {
      failureThreshold: 5,        // Number of failures before opening circuit
      recoveryTimeout: 60000,     // Time to wait before trying again (1 minute)
      monitoringWindow: 300000,   // Time window for failure counting (5 minutes)
      halfOpenMaxCalls: 3,        // Max calls to allow in half-open state
      successThreshold: 2,        // Successes needed to close circuit from half-open
    };

    // Circuit states
    this.STATES = {
      CLOSED: 'closed',       // Normal operation
      OPEN: 'open',           // Failing, reject all calls
      HALF_OPEN: 'half_open'  // Testing if service recovered
    };
  }

  /**
   * Get Redis keys for circuit breaker data
   */
  getKeys(domain) {
    const normalizedDomain = domain.toLowerCase();
    return {
      state: `circuit:state:${normalizedDomain}`,
      failures: `circuit:failures:${normalizedDomain}`,
      lastFailure: `circuit:last_failure:${normalizedDomain}`,
      halfOpenCalls: `circuit:half_open_calls:${normalizedDomain}`,
      successes: `circuit:successes:${normalizedDomain}`
    };
  }

  /**
   * Check if circuit is open for a domain
   */
  async isOpen(domain) {
    if (!domain) return false;

    try {
      const keys = this.getKeys(domain);
      const state = await this.redis.get(keys.state);
      
      if (state === this.STATES.OPEN) {
        // Check if recovery timeout has passed
        const lastFailure = await this.redis.get(keys.lastFailure);
        if (lastFailure) {
          const timeSinceFailure = Date.now() - parseInt(lastFailure);
          if (timeSinceFailure >= this.config.recoveryTimeout) {
            // Move to half-open state
            await this.setHalfOpen(domain);
            return false;
          }
        }
        return true;
      }

      return false;
    } catch (error) {
      logger.error('Error checking circuit breaker state', {
        domain,
        error: error.message
      });
      return false; // Fail open - allow requests if we can't check state
    }
  }

  /**
   * Record a successful operation
   */
  async recordSuccess(domain) {
    if (!domain) return;

    try {
      const keys = this.getKeys(domain);
      const state = await this.redis.get(keys.state);

      if (state === this.STATES.HALF_OPEN) {
        // Increment success counter in half-open state
        const successes = await this.redis.incr(keys.successes);
        await this.redis.expire(keys.successes, Math.ceil(this.config.recoveryTimeout / 1000));

        if (successes >= this.config.successThreshold) {
          // Close the circuit - service is healthy
          await this.setClosed(domain);
          logger.info(`Circuit breaker closed for domain ${domain}`, {
            domain,
            successes,
            type: 'circuit_breaker_closed'
          });
        }
      } else if (state === this.STATES.CLOSED) {
        // Reset failure count on success in closed state
        await this.redis.del(keys.failures);
      }

      logger.debug(`Recorded success for domain ${domain}`, {
        domain,
        state,
        type: 'circuit_breaker_success'
      });

    } catch (error) {
      logger.error('Error recording circuit breaker success', {
        domain,
        error: error.message
      });
    }
  }

  /**
   * Record a failed operation
   */
  async recordFailure(domain) {
    if (!domain) return;

    try {
      const keys = this.getKeys(domain);
      const state = await this.redis.get(keys.state) || this.STATES.CLOSED;

      if (state === this.STATES.HALF_OPEN) {
        // Failure in half-open state - go back to open
        await this.setOpen(domain);
        logger.warn(`Circuit breaker reopened for domain ${domain}`, {
          domain,
          type: 'circuit_breaker_reopened'
        });
        return;
      }

      if (state === this.STATES.CLOSED) {
        // Increment failure count
        const failures = await this.redis.incr(keys.failures);
        await this.redis.expire(keys.failures, Math.ceil(this.config.monitoringWindow / 1000));
        await this.redis.set(keys.lastFailure, Date.now().toString());
        await this.redis.expire(keys.lastFailure, Math.ceil(this.config.recoveryTimeout / 1000));

        if (failures >= this.config.failureThreshold) {
          // Open the circuit
          await this.setOpen(domain);
          logger.warn(`Circuit breaker opened for domain ${domain}`, {
            domain,
            failures,
            threshold: this.config.failureThreshold,
            type: 'circuit_breaker_opened'
          });
        } else {
          logger.debug(`Recorded failure for domain ${domain}`, {
            domain,
            failures,
            threshold: this.config.failureThreshold,
            type: 'circuit_breaker_failure'
          });
        }
      }

    } catch (error) {
      logger.error('Error recording circuit breaker failure', {
        domain,
        error: error.message
      });
    }
  }

  /**
   * Set circuit to closed state
   */
  async setClosed(domain) {
    const keys = this.getKeys(domain);
    await this.redis.set(keys.state, this.STATES.CLOSED);
    await this.redis.del(keys.failures);
    await this.redis.del(keys.lastFailure);
    await this.redis.del(keys.halfOpenCalls);
    await this.redis.del(keys.successes);
  }

  /**
   * Set circuit to open state
   */
  async setOpen(domain) {
    const keys = this.getKeys(domain);
    await this.redis.set(keys.state, this.STATES.OPEN);
    await this.redis.expire(keys.state, Math.ceil(this.config.recoveryTimeout / 1000));
    await this.redis.set(keys.lastFailure, Date.now().toString());
    await this.redis.expire(keys.lastFailure, Math.ceil(this.config.recoveryTimeout / 1000));
    await this.redis.del(keys.halfOpenCalls);
    await this.redis.del(keys.successes);
  }

  /**
   * Set circuit to half-open state
   */
  async setHalfOpen(domain) {
    const keys = this.getKeys(domain);
    await this.redis.set(keys.state, this.STATES.HALF_OPEN);
    await this.redis.expire(keys.state, Math.ceil(this.config.recoveryTimeout / 1000));
    await this.redis.del(keys.halfOpenCalls);
    await this.redis.del(keys.successes);
    
    logger.info(`Circuit breaker half-opened for domain ${domain}`, {
      domain,
      type: 'circuit_breaker_half_opened'
    });
  }

  /**
   * Check if we can make a call in half-open state
   */
  async canCallInHalfOpen(domain) {
    try {
      const keys = this.getKeys(domain);
      const calls = await this.redis.get(keys.halfOpenCalls) || '0';
      const callCount = parseInt(calls);
      
      if (callCount >= this.config.halfOpenMaxCalls) {
        return false;
      }

      // Increment call count
      await this.redis.incr(keys.halfOpenCalls);
      await this.redis.expire(keys.halfOpenCalls, Math.ceil(this.config.recoveryTimeout / 1000));
      
      return true;
    } catch (error) {
      logger.error('Error checking half-open call limit', {
        domain,
        error: error.message
      });
      return false;
    }
  }

  /**
   * Get circuit breaker status for a domain
   */
  async getStatus(domain) {
    if (!domain) return null;

    try {
      const keys = this.getKeys(domain);
      const [state, failures, lastFailure, halfOpenCalls, successes] = await Promise.all([
        this.redis.get(keys.state),
        this.redis.get(keys.failures),
        this.redis.get(keys.lastFailure),
        this.redis.get(keys.halfOpenCalls),
        this.redis.get(keys.successes)
      ]);

      return {
        domain: domain.toLowerCase(),
        state: state || this.STATES.CLOSED,
        failures: parseInt(failures || '0'),
        lastFailure: lastFailure ? new Date(parseInt(lastFailure)) : null,
        halfOpenCalls: parseInt(halfOpenCalls || '0'),
        successes: parseInt(successes || '0'),
        config: this.config
      };
    } catch (error) {
      logger.error('Error getting circuit breaker status', {
        domain,
        error: error.message
      });
      return null;
    }
  }

  /**
   * Get status for all domains with circuit breakers
   */
  async getAllStatuses() {
    try {
      const stateKeys = await this.redis.keys('circuit:state:*');
      const statuses = {};

      for (const key of stateKeys) {
        const domain = key.replace('circuit:state:', '');
        statuses[domain] = await this.getStatus(domain);
      }

      return statuses;
    } catch (error) {
      logger.error('Error getting all circuit breaker statuses', {
        error: error.message
      });
      return {};
    }
  }

  /**
   * Manually reset circuit breaker for a domain
   */
  async reset(domain) {
    if (!domain) return false;

    try {
      await this.setClosed(domain);
      logger.info(`Circuit breaker manually reset for domain ${domain}`, {
        domain,
        type: 'circuit_breaker_reset'
      });
      return true;
    } catch (error) {
      logger.error('Error resetting circuit breaker', {
        domain,
        error: error.message
      });
      return false;
    }
  }

  /**
   * Update circuit breaker configuration
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    logger.info('Circuit breaker configuration updated', {
      config: this.config,
      type: 'circuit_breaker_config_updated'
    });
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute(domain, fn) {
    if (!domain || typeof fn !== 'function') {
      throw new Error('Domain and function are required');
    }

    // Check if circuit is open
    if (await this.isOpen(domain)) {
      throw new Error(`Circuit breaker is open for domain: ${domain}`);
    }

    const state = await this.redis.get(this.getKeys(domain).state);
    
    // Check half-open call limit
    if (state === this.STATES.HALF_OPEN) {
      if (!(await this.canCallInHalfOpen(domain))) {
        throw new Error(`Circuit breaker half-open call limit exceeded for domain: ${domain}`);
      }
    }

    try {
      const result = await fn();
      await this.recordSuccess(domain);
      return result;
    } catch (error) {
      await this.recordFailure(domain);
      throw error;
    }
  }
}

export default CircuitBreaker;