import express from 'express';
import DomainThrottler from '../utils/domainThrottler.js';
import CircuitBreaker from '../utils/circuitBreaker.js';
import RetryHandler from '../utils/retryHandler.js';
import CacheService from '../utils/cacheService.js';
import ProxyRotation from '../utils/proxyRotation.js';
import BatchJobService from '../utils/batchJobService.js';
import logger from '../utils/logger.js';

const router = express.Router();

// Initialize optimization utilities
const domainThrottler = new DomainThrottler();
const circuitBreaker = new CircuitBreaker();
const retryHandler = new RetryHandler();
const cacheService = new CacheService();
const proxyRotation = new ProxyRotation();
const batchJobService = new BatchJobService();

// Get optimization statistics
router.get('/stats', async (req, res) => {
  try {
    const stats = {
      domainThrottler: await domainThrottler.getStats(),
      circuitBreaker: await circuitBreaker.getStats(),
      cache: await cacheService.getStats(),
      proxy: await proxyRotation.getStats(),
      batch: await batchJobService.getStats()
    };

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('Error getting optimization stats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Domain throttling management
router.get('/throttling/domains', async (req, res) => {
  try {
    const stats = await domainThrottler.getStats();
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('Error getting domain throttling stats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.post('/throttling/clear/:domain', async (req, res) => {
  try {
    const { domain } = req.params;
    await domainThrottler.clearThrottle(domain);
    
    res.json({
      success: true,
      message: `Throttle cleared for domain: ${domain}`
    });
  } catch (error) {
    logger.error('Error clearing domain throttle:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.put('/throttling/config', async (req, res) => {
  try {
    const { delays } = req.body;
    await domainThrottler.updateDelays(delays);
    
    res.json({
      success: true,
      message: 'Domain throttling configuration updated'
    });
  } catch (error) {
    logger.error('Error updating throttling config:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Circuit breaker management
router.get('/circuit-breaker/status', async (req, res) => {
  try {
    const stats = await circuitBreaker.getStats();
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('Error getting circuit breaker stats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.post('/circuit-breaker/reset/:domain', async (req, res) => {
  try {
    const { domain } = req.params;
    await circuitBreaker.reset(domain);
    
    res.json({
      success: true,
      message: `Circuit breaker reset for domain: ${domain}`
    });
  } catch (error) {
    logger.error('Error resetting circuit breaker:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Cache management
router.get('/cache/stats', async (req, res) => {
  try {
    const stats = await cacheService.getStats();
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('Error getting cache stats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.delete('/cache/clear', async (req, res) => {
  try {
    const { pattern } = req.query;
    
    if (pattern) {
      await cacheService.invalidateByPattern(pattern);
    } else {
      await cacheService.clearAll();
    }
    
    res.json({
      success: true,
      message: pattern ? `Cache cleared for pattern: ${pattern}` : 'All cache cleared'
    });
  } catch (error) {
    logger.error('Error clearing cache:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.post('/cache/warm', async (req, res) => {
  try {
    const { keys } = req.body;
    await cacheService.warmUp(keys);
    
    res.json({
      success: true,
      message: 'Cache warming initiated'
    });
  } catch (error) {
    logger.error('Error warming cache:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Proxy management
router.get('/proxy/status', async (req, res) => {
  try {
    const stats = await proxyRotation.getStats();
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('Error getting proxy stats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.post('/proxy/add', async (req, res) => {
  try {
    const proxyConfig = req.body;
    await proxyRotation.addProxy(proxyConfig);
    
    res.json({
      success: true,
      message: 'Proxy added successfully'
    });
  } catch (error) {
    logger.error('Error adding proxy:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.delete('/proxy/:proxyId', async (req, res) => {
  try {
    const { proxyId } = req.params;
    await proxyRotation.removeProxy(proxyId);
    
    res.json({
      success: true,
      message: `Proxy ${proxyId} removed successfully`
    });
  } catch (error) {
    logger.error('Error removing proxy:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.post('/proxy/health-check', async (req, res) => {
  try {
    const results = await proxyRotation.performHealthCheck();
    
    res.json({
      success: true,
      data: results
    });
  } catch (error) {
    logger.error('Error performing proxy health check:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Batch job management
router.get('/batch/stats', async (req, res) => {
  try {
    const stats = await batchJobService.getStats();
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('Error getting batch stats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.get('/batch/:batchId/status', async (req, res) => {
  try {
    const { batchId } = req.params;
    const status = await batchJobService.getBatchStatus(batchId);
    
    res.json({
      success: true,
      data: status
    });
  } catch (error) {
    logger.error('Error getting batch status:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.post('/batch/cleanup', async (req, res) => {
  try {
    const { olderThan } = req.body;
    const result = await batchJobService.cleanup(olderThan);
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('Error cleaning up batches:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Retry handler configuration
router.put('/retry/config', async (req, res) => {
  try {
    const config = req.body;
    retryHandler.updateConfig(config);
    
    res.json({
      success: true,
      message: 'Retry handler configuration updated'
    });
  } catch (error) {
    logger.error('Error updating retry config:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;