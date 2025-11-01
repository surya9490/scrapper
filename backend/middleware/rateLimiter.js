import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { getRedisClient } from '../utils/redis.js';
import logger from '../utils/logger.js';

// Check if request should bypass rate limiting (internal API key)
function isInternalRequest(req) {
  const bypassKey = process.env.RATE_LIMIT_BYPASS_KEY;
  if (!bypassKey) return false;
  return req.headers["x-internal-api-key"] === bypassKey;
}

// Generate rate limit key based on user ID or IP
function generateRateLimitKey(req, prefix = 'rl') {
  // Use user ID if authenticated, otherwise fall back to IP
  const identifier = req.user?.id || req.ip;
  return `${prefix}:${identifier}`;
}

// Create user-specific rate limiter
export function createUserRateLimiter(options = {}) {
  const {
    windowMs = 15 * 60 * 1000, // 15 minutes default
    max = 100, // requests per window
    prefix = 'user-rate-limit',
    message = 'Too many requests, please try again later.',
    skipSuccessfulRequests = false,
    skipFailedRequests = false,
  } = options;

  return rateLimit({
    store: new RedisStore({
      sendCommand: (...args) => getRedisClient().call(...args),
      prefix: prefix,
    }),
    windowMs,
    max: (req) => {
      // Use user-specific rate limits if available
      if (req.user?.rateLimits) {
        return req.user.rateLimits.requestsPerWindow || max;
      }
      return max;
    },
    standardHeaders: false,
    legacyHeaders: false,
    skip: (req) => isInternalRequest(req),
    skipSuccessfulRequests,
    skipFailedRequests,
    keyGenerator: (req) => generateRateLimitKey(req, prefix),
    handler: (req, res) => {
      const retryAfterSec = Math.ceil((req.rateLimit.resetTime - Date.now()) / 1000) || 60;
      res.set("Retry-After", String(retryAfterSec));
      
      const identifier = req.user?.id ? `user:${req.user.id}` : `ip:${req.ip}`;
      logger.warn(`[${prefix}] BLOCKED ${identifier} ${req.originalUrl}`, {
        userId: req.user?.id,
        ip: req.ip,
        url: req.originalUrl,
        limit: req.rateLimit.limit,
        remaining: req.rateLimit.remaining,
        resetTime: new Date(req.rateLimit.resetTime)
      });
      
      res.status(429).json({ 
        error: message,
        retryAfter: retryAfterSec,
        limit: req.rateLimit.limit,
        remaining: req.rateLimit.remaining,
        resetTime: new Date(req.rateLimit.resetTime)
      });
    },
  });
}

// Pre-configured rate limiters for different endpoints
export const globalUserLimiter = createUserRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // requests per window per user
  prefix: 'global',
  message: 'Too many requests from this account, please try again later.'
});

export const dashboardUserLimiter = createUserRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 600, // requests per minute per user
  prefix: 'dashboard',
  message: 'Too many dashboard requests from this account'
});

export const scrapingUserLimiter = createUserRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: (req) => {
    // Use user-specific scraping limits
    if (req.user?.rateLimits?.scrapingRequestsPerMinute) {
      return req.user.rateLimits.scrapingRequestsPerMinute;
    }
    return 30; // default
  },
  prefix: 'scraping',
  message: 'Scraping rate limit exceeded for this account'
});

export const uploadUserLimiter = createUserRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: (req) => {
    // Use user-specific upload limits
    if (req.user?.rateLimits?.uploadRequestsPerMinute) {
      return req.user.rateLimits.uploadRequestsPerMinute;
    }
    return 10; // default
  },
  prefix: 'upload',
  message: 'Upload rate limit exceeded for this account'
});

// Middleware to load user rate limits into request
export async function loadUserRateLimits(req, res, next) {
  if (req.user?.id) {
    try {
      // Rate limits are already loaded in the user object from auth middleware
      // This middleware ensures they're available for rate limiting
      if (!req.user.rateLimits) {
        logger.warn('User rate limits not found, using defaults', { userId: req.user.id });
      }
    } catch (error) {
      logger.error('Error loading user rate limits', { 
        userId: req.user.id, 
        error: error.message 
      });
    }
  }
  next();
}