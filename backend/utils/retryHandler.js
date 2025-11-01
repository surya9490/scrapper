import logger from './logger.js';

class RetryHandler {
  constructor() {
    this.config = {
      maxRetries: 3,
      baseDelay: 1000,        // 1 second base delay
      maxDelay: 30000,        // 30 seconds max delay
      backoffMultiplier: 2,   // Exponential backoff multiplier
      jitterMax: 0.1,         // Add up to 10% jitter to prevent thundering herd
    };

    // Retryable error types
    this.retryableErrors = [
      'ECONNRESET',
      'ECONNREFUSED', 
      'ETIMEDOUT',
      'ENOTFOUND',
      'EAI_AGAIN',
      'EPIPE',
      'ECONNABORTED'
    ];

    // HTTP status codes that should be retried
    this.retryableStatusCodes = [
      408, // Request Timeout
      429, // Too Many Requests
      500, // Internal Server Error
      502, // Bad Gateway
      503, // Service Unavailable
      504, // Gateway Timeout
      520, // Unknown Error (Cloudflare)
      521, // Web Server Is Down (Cloudflare)
      522, // Connection Timed Out (Cloudflare)
      523, // Origin Is Unreachable (Cloudflare)
      524, // A Timeout Occurred (Cloudflare)
    ];
  }

  /**
   * Check if an error is retryable
   */
  isRetryableError(error) {
    if (!error) return false;

    // Check error code
    if (error.code && this.retryableErrors.includes(error.code)) {
      return true;
    }

    // Check HTTP status code
    if (error.response && error.response.status) {
      return this.retryableStatusCodes.includes(error.response.status);
    }

    // Check error message for common network issues
    const errorMessage = error.message?.toLowerCase() || '';
    const networkErrorPatterns = [
      'network error',
      'connection refused',
      'timeout',
      'socket hang up',
      'connect etimedout',
      'getaddrinfo enotfound',
      'read econnreset',
      'write epipe'
    ];

    return networkErrorPatterns.some(pattern => errorMessage.includes(pattern));
  }

  /**
   * Calculate delay with exponential backoff and jitter
   */
  calculateDelay(attempt) {
    const exponentialDelay = this.config.baseDelay * Math.pow(this.config.backoffMultiplier, attempt - 1);
    const cappedDelay = Math.min(exponentialDelay, this.config.maxDelay);
    
    // Add jitter to prevent thundering herd
    const jitter = cappedDelay * this.config.jitterMax * Math.random();
    
    return Math.floor(cappedDelay + jitter);
  }

  /**
   * Sleep for specified milliseconds
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Execute function with retry logic
   */
  async execute(fn, options = {}) {
    const config = { ...this.config, ...options };
    let lastError;

    for (let attempt = 1; attempt <= config.maxRetries + 1; attempt++) {
      try {
        const result = await fn();
        
        if (attempt > 1) {
          logger.info('Retry succeeded', {
            attempt,
            totalAttempts: config.maxRetries + 1,
            type: 'retry_success'
          });
        }
        
        return result;
      } catch (error) {
        lastError = error;
        
        // Don't retry on last attempt
        if (attempt === config.maxRetries + 1) {
          break;
        }

        // Check if error is retryable
        if (!this.isRetryableError(error)) {
          logger.debug('Error is not retryable, failing immediately', {
            error: error.message,
            code: error.code,
            status: error.response?.status,
            attempt,
            type: 'retry_non_retryable'
          });
          throw error;
        }

        const delay = this.calculateDelay(attempt);
        
        logger.warn('Retrying after error', {
          error: error.message,
          code: error.code,
          status: error.response?.status,
          attempt,
          totalAttempts: config.maxRetries + 1,
          delayMs: delay,
          type: 'retry_attempt'
        });

        await this.sleep(delay);
      }
    }

    // All retries exhausted
    logger.error('All retries exhausted', {
      error: lastError.message,
      code: lastError.code,
      status: lastError.response?.status,
      totalAttempts: config.maxRetries + 1,
      type: 'retry_exhausted'
    });

    throw lastError;
  }

  /**
   * Execute with custom retry configuration
   */
  async executeWithConfig(fn, retryConfig) {
    return this.execute(fn, retryConfig);
  }

  /**
   * Execute with specific retry count
   */
  async executeWithRetries(fn, maxRetries) {
    return this.execute(fn, { maxRetries });
  }

  /**
   * Execute with timeout and retries
   */
  async executeWithTimeout(fn, timeoutMs, retryConfig = {}) {
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs}ms`)), timeoutMs);
    });

    const wrappedFn = async () => {
      return Promise.race([fn(), timeoutPromise]);
    };

    return this.execute(wrappedFn, retryConfig);
  }

  /**
   * Update retry configuration
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    logger.info('Retry handler configuration updated', {
      config: this.config,
      type: 'retry_config_updated'
    });
  }

  /**
   * Get current configuration
   */
  getConfig() {
    return { ...this.config };
  }

  /**
   * Add custom retryable error codes
   */
  addRetryableErrors(errorCodes) {
    if (Array.isArray(errorCodes)) {
      this.retryableErrors.push(...errorCodes);
    } else {
      this.retryableErrors.push(errorCodes);
    }
    
    logger.info('Added custom retryable error codes', {
      newCodes: errorCodes,
      allCodes: this.retryableErrors,
      type: 'retry_codes_updated'
    });
  }

  /**
   * Add custom retryable status codes
   */
  addRetryableStatusCodes(statusCodes) {
    if (Array.isArray(statusCodes)) {
      this.retryableStatusCodes.push(...statusCodes);
    } else {
      this.retryableStatusCodes.push(statusCodes);
    }
    
    logger.info('Added custom retryable status codes', {
      newCodes: statusCodes,
      allCodes: this.retryableStatusCodes,
      type: 'retry_status_codes_updated'
    });
  }

  /**
   * Create a retryable version of an async function
   */
  wrap(fn, retryConfig = {}) {
    return async (...args) => {
      return this.execute(() => fn(...args), retryConfig);
    };
  }

  /**
   * Get retry statistics for monitoring
   */
  getStats() {
    return {
      config: this.config,
      retryableErrors: this.retryableErrors,
      retryableStatusCodes: this.retryableStatusCodes
    };
  }
}

export default RetryHandler;