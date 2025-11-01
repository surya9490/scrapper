import express from 'express';
import CronJobService from '../services/cronJobService.js';
import PriceComparisonService from '../services/priceComparisonService.js';

const router = express.Router();
const cronJobService = new CronJobService();
const priceComparisonService = new PriceComparisonService();

// Initialize cron job service
router.post('/initialize', async (req, res) => {
  try {
    await cronJobService.initialize();
    res.json({
      success: true,
      message: 'Cron job service initialized successfully'
    });
  } catch (error) {
    console.error('❌ Error initializing cron job service:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get job status
router.get('/status', (req, res) => {
  try {
    const status = cronJobService.getJobStatus();
    res.json({
      success: true,
      ...status
    });
  } catch (error) {
    console.error('❌ Error getting job status:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Create custom scheduled job
router.post('/create', async (req, res) => {
  try {
    const { name, schedule, type, description, config } = req.body;

    if (!name || !schedule || !type) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: name, schedule, type'
      });
    }

    const result = await cronJobService.createScheduledJob({
      name,
      schedule,
      type,
      description,
      config
    });

    res.json(result);
  } catch (error) {
    console.error('❌ Error creating scheduled job:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Stop specific job
router.post('/stop/:jobName', (req, res) => {
  try {
    const { jobName } = req.params;
    const result = cronJobService.stopJob(jobName);
    res.json(result);
  } catch (error) {
    console.error('❌ Error stopping job:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Stop all jobs
router.post('/stop-all', (req, res) => {
  try {
    const result = cronJobService.stopAllJobs();
    res.json(result);
  } catch (error) {
    console.error('❌ Error stopping all jobs:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Trigger manual price monitoring
router.post('/trigger/price-monitoring', async (req, res) => {
  try {
    const result = await cronJobService.runPriceMonitoring();
    res.json(result);
  } catch (error) {
    console.error('❌ Error triggering price monitoring:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Trigger manual price comparison
router.post('/trigger/price-comparison', async (req, res) => {
  try {
    const result = await cronJobService.runPriceComparison();
    res.json(result);
  } catch (error) {
    console.error('❌ Error triggering price comparison:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Price comparison routes

// Analyze price trends for a product
router.get('/price-analysis/:competitorProductId', async (req, res) => {
  try {
    const { competitorProductId } = req.params;
    const { days = 30 } = req.query;

    const result = await priceComparisonService.analyzePriceTrends(
      parseInt(competitorProductId),
      parseInt(days)
    );

    res.json(result);
  } catch (error) {
    console.error('❌ Error analyzing price trends:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Compare competitor prices for a user product
router.get('/price-comparison/:userProductId', async (req, res) => {
  try {
    const { userProductId } = req.params;

    const result = await priceComparisonService.compareCompetitorPrices(
      parseInt(userProductId)
    );

    res.json(result);
  } catch (error) {
    console.error('❌ Error comparing prices:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Create price alert
router.post('/alerts', async (req, res) => {
  try {
    const alertData = req.body;

    if (!alertData.type || !alertData.message) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: type, message'
      });
    }

    const result = await priceComparisonService.createPriceAlert(alertData);
    res.json(result);
  } catch (error) {
    console.error('❌ Error creating price alert:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get price alerts
router.get('/alerts', async (req, res) => {
  try {
    const filters = {
      type: req.query.type,
      severity: req.query.severity,
      isRead: req.query.isRead === 'true',
      competitorProductId: req.query.competitorProductId ? parseInt(req.query.competitorProductId) : undefined,
      userProductId: req.query.userProductId ? parseInt(req.query.userProductId) : undefined,
      limit: req.query.limit ? parseInt(req.query.limit) : 50,
      offset: req.query.offset ? parseInt(req.query.offset) : 0
    };

    const result = await priceComparisonService.getPriceAlerts(filters);
    res.json(result);
  } catch (error) {
    console.error('❌ Error getting price alerts:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Mark alert as read
router.patch('/alerts/:alertId/read', async (req, res) => {
  try {
    const { alertId } = req.params;
    const result = await priceComparisonService.markAlertAsRead(alertId);
    res.json(result);
  } catch (error) {
    console.error('❌ Error marking alert as read:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get dashboard data
router.get('/dashboard', async (req, res) => {
  try {
    const result = await priceComparisonService.getDashboardData();
    res.json(result);
  } catch (error) {
    console.error('❌ Error getting dashboard data:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Health check for cron job system
router.get('/health', (req, res) => {
  try {
    const status = cronJobService.getJobStatus();
    res.json({
      success: true,
      status: 'healthy',
      cronJobService: {
        initialized: status.isInitialized,
        totalJobs: status.totalJobs
      },
      priceComparisonService: {
        available: true
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Error in health check:', error);
    res.status(500).json({
      success: false,
      status: 'unhealthy',
      error: error.message
    });
  }
});

export default router;