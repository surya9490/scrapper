import express from 'express';
import PriceMonitoringService from '../services/priceMonitoringService.js';
import prisma from '../utils/prisma.js';

const router = express.Router();
const priceMonitoringService = new PriceMonitoringService();

// GET /api/price-monitoring/status - Get overall monitoring status
router.get('/status', async (req, res) => {
  try {
    const status = await priceMonitoringService.getMonitoringStatus();
    res.json(status);

  } catch (error) {
    console.error('Error getting monitoring status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get monitoring status'
    });
  }
});

// POST /api/price-monitoring/schedule - Schedule price monitoring for mappings
router.post('/schedule', async (req, res) => {
  try {
    const { mappingIds, schedule = 'daily' } = req.body;

    if (!mappingIds || !Array.isArray(mappingIds)) {
      return res.status(400).json({
        success: false,
        error: 'mappingIds array is required'
      });
    }

    const validSchedules = ['hourly', 'daily', 'weekly', 'monthly'];
    if (!validSchedules.includes(schedule)) {
      return res.status(400).json({
        success: false,
        error: `Invalid schedule. Must be one of: ${validSchedules.join(', ')}`
      });
    }

    const results = [];
    const errors = [];

    for (const mappingId of mappingIds) {
      try {
        const result = await priceMonitoringService.schedulePriceMonitoring(
          mappingId,
          schedule
        );
        results.push({ mappingId, ...result });
      } catch (error) {
        errors.push({ mappingId, error: error.message });
      }
    }

    res.json({
      success: true,
      data: {
        scheduled: results.length,
        errors: errors.length,
        results,
        errors,
        schedule
      }
    });

  } catch (error) {
    console.error('Error scheduling price monitoring:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to schedule price monitoring'
    });
  }
});

// POST /api/price-monitoring/stop - Stop price monitoring for mappings
router.post('/stop', async (req, res) => {
  try {
    const { mappingIds } = req.body;

    if (!mappingIds || !Array.isArray(mappingIds)) {
      return res.status(400).json({
        success: false,
        error: 'mappingIds array is required'
      });
    }

    const results = [];
    const errors = [];

    for (const mappingId of mappingIds) {
      try {
        const result = await priceMonitoringService.stopPriceMonitoring(mappingId);
        results.push({ mappingId, ...result });
      } catch (error) {
        errors.push({ mappingId, error: error.message });
      }
    }

    res.json({
      success: true,
      data: {
        stopped: results.length,
        errors: errors.length,
        results,
        errors
      }
    });

  } catch (error) {
    console.error('Error stopping price monitoring:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to stop price monitoring'
    });
  }
});

// POST /api/price-monitoring/monitor-now - Manually trigger price monitoring
router.post('/monitor-now', async (req, res) => {
  try {
    const { competitorProductIds } = req.body;

    if (!competitorProductIds || !Array.isArray(competitorProductIds)) {
      return res.status(400).json({
        success: false,
        error: 'competitorProductIds array is required'
      });
    }

    const batchResult = await priceMonitoringService.batchMonitorPrices(
      competitorProductIds,
      5 // Batch size
    );

    res.json(batchResult);

  } catch (error) {
    console.error('Error triggering manual price monitoring:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to trigger price monitoring'
    });
  }
});

// GET /api/price-monitoring/trends/:competitorProductId - Get price trends
router.get('/trends/:competitorProductId', async (req, res) => {
  try {
    const { competitorProductId } = req.params;
    const { days = 30 } = req.query;

    const trends = await priceMonitoringService.getPriceTrends(
      parseInt(competitorProductId),
      parseInt(days)
    );

    res.json(trends);

  } catch (error) {
    console.error('Error getting price trends:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get price trends'
    });
  }
});

// GET /api/price-monitoring/alerts - Get price alerts
router.get('/alerts', async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 20, days = 7 } = req.query;
    const skip = (page - 1) * limit;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    // Get significant price changes as alerts
    const [alerts, total] = await Promise.all([
      prisma.priceHistory.findMany({
        where: {
          recordedAt: { gte: startDate },
          OR: [
            { priceChangePercent: { gte: 5 } },   // 5% increase
            { priceChangePercent: { lte: -5 } }   // 5% decrease
          ],
          competitorProduct: {
            productMappings: {
              some: {
                userProduct: {
                  userId
                }
              }
            }
          }
        },
        skip: parseInt(skip),
        take: parseInt(limit),
        include: {
          competitorProduct: {
            include: {
              productMappings: {
                where: { 
                  status: 'approved',
                  userProduct: {
                    userId
                  }
                },
                include: {
                  userProduct: {
                    select: { title: true, sku: true }
                  }
                }
              }
            }
          }
        },
        orderBy: { recordedAt: 'desc' }
      }),
      prisma.priceHistory.count({
        where: {
          recordedAt: { gte: startDate },
          OR: [
            { priceChangePercent: { gte: 5 } },
            { priceChangePercent: { lte: -5 } }
          ],
          competitorProduct: {
            productMappings: {
              some: {
                userProduct: {
                  userId
                }
              }
            }
          }
        }
      })
    ]);

    const formattedAlerts = alerts
      .filter(alert => alert.competitorProduct.productMappings.length > 0)
      .map(alert => ({
        id: alert.id,
        type: alert.priceChange > 0 ? 'PRICE_INCREASE' : 'PRICE_DECREASE',
        severity: Math.abs(alert.priceChangePercent) >= 10 ? 'HIGH' : 'MEDIUM',
        price: alert.price,
        previousPrice: alert.previousPrice,
        priceChange: alert.priceChange,
        priceChangePercent: alert.priceChangePercent,
        createdAt: alert.recordedAt,
        competitorProduct: {
          id: alert.competitorProduct.id,
          title: alert.competitorProduct.title,
          url: alert.competitorProduct.url,
          domain: alert.competitorProduct.competitorDomain
        },
        userProduct: alert.competitorProduct.productMappings[0]?.userProduct || null
      }));

    res.json({
      success: true,
      data: {
        alerts: formattedAlerts,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        },
        summary: {
          totalAlerts: total,
          priceIncreases: formattedAlerts.filter(a => a.type === 'PRICE_INCREASE').length,
          priceDecreases: formattedAlerts.filter(a => a.type === 'PRICE_DECREASE').length,
          highSeverity: formattedAlerts.filter(a => a.severity === 'HIGH').length
        }
      }
    });

  } catch (error) {
    console.error('Error getting price alerts:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get price alerts'
    });
  }
});

// GET /api/price-monitoring/history - Get price monitoring history
router.get('/history', async (req, res) => {
  try {
    const userId = req.user.id;
    const { 
      page = 1, 
      limit = 20, 
      competitorProductId, 
      days = 30,
      sortBy = 'recordedAt',
      sortOrder = 'desc'
    } = req.query;
    
    const skip = (page - 1) * limit;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    const where = {
      recordedAt: { gte: startDate },
      competitorProduct: {
        productMappings: {
          some: {
            userProduct: {
              userId
            }
          }
        }
      }
    };

    if (competitorProductId) {
      where.competitorProductId = parseInt(competitorProductId);
    }

    const orderBy = {};
    orderBy[sortBy] = sortOrder;

    const [history, total] = await Promise.all([
      prisma.priceHistory.findMany({
        where,
        skip: parseInt(skip),
        take: parseInt(limit),
        include: {
          competitorProduct: {
            select: {
              id: true,
              title: true,
              url: true,
              competitorDomain: true
            }
          }
        },
        orderBy
      }),
      prisma.priceHistory.count({ where })
    ]);

    res.json({
      success: true,
      data: {
        history,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });

  } catch (error) {
    console.error('Error getting price history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get price history'
    });
  }
});

// POST /api/price-monitoring/cleanup - Cleanup old price history data
router.post('/cleanup', async (req, res) => {
  try {
    const { retentionDays = 90 } = req.body;

    const cleanupResult = await priceMonitoringService.cleanupOldData(
      parseInt(retentionDays)
    );

    res.json(cleanupResult);

  } catch (error) {
    console.error('Error cleaning up old data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to cleanup old data'
    });
  }
});

// GET /api/price-monitoring/statistics - Get monitoring statistics
router.get('/statistics', async (req, res) => {
  try {
    const userId = req.user.id;
    const { days = 30 } = req.query;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    const [
      totalMonitored,
      activeMonitoring,
      priceChanges,
      significantChanges,
      avgPriceChange,
      monitoringFrequency
    ] = await Promise.all([
      // Total products monitored
      prisma.competitorProduct.count({
        where: {
          productMappings: {
            some: { 
              status: 'approved',
              userProduct: {
                userId
              }
            }
          }
        }
      }),
      
      // Active monitoring
      prisma.productMapping.count({
        where: {
          status: 'approved',
          priceMonitoringEnabled: true,
          userProduct: {
            userId
          }
        }
      }),
      
      // Price changes in period
      prisma.priceHistory.count({
        where: {
          recordedAt: { gte: startDate },
          priceChange: { not: 0 },
          competitorProduct: {
            productMappings: {
              some: {
                userProduct: {
                  userId
                }
              }
            }
          }
        }
      }),
      
      // Significant changes (>5%)
      prisma.priceHistory.count({
        where: {
          recordedAt: { gte: startDate },
          OR: [
            { priceChangePercent: { gte: 5 } },
            { priceChangePercent: { lte: -5 } }
          ],
          competitorProduct: {
            productMappings: {
              some: {
                userProduct: {
                  userId
                }
              }
            }
          }
        }
      }),
      
      // Average price change
      prisma.priceHistory.aggregate({
        where: {
          recordedAt: { gte: startDate },
          priceChange: { not: 0 },
          competitorProduct: {
            productMappings: {
              some: {
                userProduct: {
                  userId
                }
              }
            }
          }
        },
        _avg: {
          priceChangePercent: true
        }
      }),
      
      // Monitoring frequency breakdown
      prisma.productMapping.groupBy({
        by: ['monitoringFrequency'],
        where: {
          status: 'approved',
          priceMonitoringEnabled: true,
          userProduct: {
            userId
          }
        },
        _count: {
          monitoringFrequency: true
        }
      })
    ]);

    res.json({
      success: true,
      data: {
        overview: {
          totalMonitored,
          activeMonitoring,
          monitoringRate: totalMonitored > 0 ? (activeMonitoring / totalMonitored * 100).toFixed(1) : 0
        },
        priceChanges: {
          total: priceChanges,
          significant: significantChanges,
          averageChangePercent: avgPriceChange._avg.priceChangePercent || 0
        },
        monitoringFrequency: monitoringFrequency.reduce((acc, item) => {
          acc[item.monitoringSchedule || 'none'] = item._count.monitoringSchedule;
          return acc;
        }, {}),
        period: `${days} days`
      }
    });

  } catch (error) {
    console.error('Error getting monitoring statistics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get monitoring statistics'
    });
  }
});

export default router;