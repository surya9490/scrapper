import express from 'express';
import prisma from '../utils/prisma.js';
import MatchingService from '../services/matchingService.js';
import ScrapingService from '../services/scrapingService.js';
import AIService from '../services/aiService.js';
import PriceMonitoringService from '../services/priceMonitoringService.js';

const router = express.Router();
const aiService = new AIService();
const scrapingService = new ScrapingService();
const matchingService = new MatchingService();
const priceMonitoringService = new PriceMonitoringService();

// GET /api/dashboard/overview - Dashboard overview statistics
router.get('/overview', async (req, res) => {
  try {
    const userId = req.user.id;
    
    const stats = await Promise.all([
      prisma.userProduct.count({ where: { userId } }),
      prisma.competitorProduct.count({ where: { userId } }),
      prisma.productMapping.count({ where: { userId, status: 'approved' } }),
      prisma.productMapping.count({ where: { userId, status: 'pending' } }),
      prisma.priceHistory.count({ where: { userId } }),
      prisma.uploadBatch.count({ where: { userId } })
    ]);

    const [
      totalUserProducts,
      totalCompetitorProducts,
      approvedMappings,
      pendingMappings,
      totalPricePoints,
      totalUploads
    ] = stats;

    // Get recent activity
    const recentMappings = await prisma.productMapping.findMany({
      where: { userId },
      take: 5,
      orderBy: { createdAt: 'desc' },
      include: {
        userProduct: { select: { title: true, sku: true } },
        competitorProduct: { select: { title: true, url: true, price: true } }
      }
    });

    // Get price alerts (significant price changes)
    const priceAlerts = await prisma.priceHistory.findMany({
      where: {
        userId,
        recordedAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
        }
      },
      include: {
        competitorProduct: {
          include: {
            productMappings: {
              where: { userId, status: 'approved' },
              include: { userProduct: { select: { title: true, sku: true } } }
            }
          }
        }
      },
      orderBy: { recordedAt: 'desc' },
      take: 10
    });

    res.json({
      success: true,
      data: {
        overview: {
          totalUserProducts,
          totalCompetitorProducts,
          approvedMappings,
          pendingMappings,
          totalPricePoints,
          totalUploads,
          matchingRate: totalUserProducts > 0 ? (approvedMappings / totalUserProducts * 100).toFixed(1) : 0
        },
        recentActivity: recentMappings,
        priceAlerts: priceAlerts.filter(alert => 
          alert.competitorProduct.productMappings.length > 0
        )
      }
    });

  } catch (error) {
    console.error('Error fetching dashboard overview:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch dashboard overview'
    });
  }
});

// GET /api/dashboard/products - Get user products with mapping status
router.get('/products', async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 20, status, search, batchId } = req.query;
    const skip = (page - 1) * limit;

    const where = { userId };
    
    if (status) {
      const normalized = String(status).toLowerCase();
      if (["approved", "pending", "rejected"].includes(normalized)) {
        where.productMappings = { some: { userId, status: normalized } };
      } else if (normalized === "unmapped") {
        where.productMappings = { none: { userId } };
      }
    }
    
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { sku: { contains: search, mode: 'insensitive' } },
        { brand: { contains: search, mode: 'insensitive' } }
      ];
    }

    const [products, total] = await Promise.all([
      prisma.userProduct.findMany({
        where,
        skip: parseInt(skip),
        take: parseInt(limit),
        include: {
          productMappings: {
            where: { userId },
            include: {
              competitorProduct: {
                select: {
                  id: true,
                  title: true,
                  url: true,
                  price: true,
                  image: true
                }
              }
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      }),
      prisma.userProduct.count({ where })
    ]);

    res.json({
      success: true,
      data: {
        products,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });

  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch products'
    });
  }
});

// GET /api/dashboard/mappings - Get product mappings
router.get('/mappings', async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 20, status, confidence } = req.query;
    const skip = (page - 1) * limit;

    const where = { userId };
    
    if (status) {
      where.status = status;
    }
    
    if (confidence) {
      where.matchingScore = { gte: parseFloat(confidence) };
    }

    const [mappings, total] = await Promise.all([
      prisma.productMapping.findMany({
        where,
        skip: parseInt(skip),
        take: parseInt(limit),
        include: {
          userProduct: true,
          competitorProduct: {
            include: {
              priceHistories: {
                where: { userId },
                orderBy: { recordedAt: 'desc' },
                take: 5
              }
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      }),
      prisma.productMapping.count({ where })
    ]);

    res.json({
      success: true,
      data: {
        mappings,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });

  } catch (error) {
    console.error('Error fetching mappings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch mappings'
    });
  }
});

router.post('/test', async (req, res) => {
  try {
    const { title, description } = req.body;

    if (!title) {
      return res.status(400).json({
        success: false,
        error: 'Title is required'
      });
    }

    const attributes = await aiService.extractAttributes(title, description);

    res.json({
      success: true,
      data: attributes
    });

  } catch (error) {
    console.error('Error testing attributes extraction:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to test attributes extraction'
    });
  }
});



// POST /api/dashboard/find-matches - Find matches for a user product
router.post('/find-matches', async (req, res) => {
  try {
    const userId = req.user.id;
    const { userProductId, competitorDomains = [], searchKeywords } = req.body;

    if (!userProductId) {
      return res.status(400).json({
        success: false,
        error: 'User product ID is required'
      });
    }

    const userProduct = await prisma.userProduct.findUnique({
      where: { id: userProductId }
    });

    if (!userProduct || userProduct.userId !== userId) {
      return res.status(404).json({
        success: false,
        error: 'User product not found'
      });
    }

    // Generate search keywords if not provided
    let keywords = searchKeywords;
    if (!keywords || keywords.length === 0) {
      keywords = await aiService.generateSearchKeywords(userProduct);
    }

    // Search competitor sites
    const competitorProducts = [];
    
    for (const domain of competitorDomains) {
      try {
        const searchResults = await scrapingService.searchCompetitorSite(domain, keywords, userProduct.title);
        
        // Scrape top results
        const scrapedProducts = await scrapingService.batchScrapeProducts(
          searchResults.slice(0, 5).map(r => r.url),
          2 // Concurrency limit
        );

        // Save competitor products to database
        for (const product of scrapedProducts.results) {
          const competitorProduct = await prisma.competitorProduct.create({
            data: {
              userId,
              title: product.title || `Product from ${domain}`,
              url: product.sourceUrl,
              price: product.price ?? null,
              image: product.image ?? null,
              brand: product.brand ?? null,
              category: product.category ?? null,
              threadCount: product.threadCount ?? null,
              material: product.material ?? null,
              size: product.size ?? null,
              design: product.design ?? null,
              color: product.color ?? null,
              competitorDomain: domain.replace(/^www\./, ''),
              competitorName: null,
              lastScrapedAt: new Date()
            }
          });

          competitorProducts.push(competitorProduct);
        }
      } catch (error) {
        console.error(`Error searching ${domain}:`, error);
      }
    }

    // Find matches using matching service
    const matches = await matchingService.findProductMatches(
      userProductId,
      competitorProducts,
      { threshold: 0.5 }
    );

    // Save potential matches to database
    for (const match of matches) {
      await prisma.productMapping.create({
        data: {
          userId,
          userProductId: userProductId,
          competitorProductId: match.competitorProduct.id,
          matchingScore: match.matchScore.totalScore,
          matchingAlgorithm: 'composite_similarity',
          matchingDetails: JSON.stringify(match.matchScore),
          status: 'pending'
        }
      });
    }

    res.json({
      success: true,
      data: {
        userProduct,
        matches: matches.slice(0, 10), // Return top 10 matches
        totalFound: matches.length,
        searchKeywords: keywords
      }
    });

  } catch (error) {
    console.error('Error finding matches:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to find product matches'
    });
  }
});

// POST /api/dashboard/mappings/:id/approve - Approve a product mapping
router.post('/mappings/:id/approve', async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { notes } = req.body;

    const mapping = await prisma.productMapping.findUnique({
      where: { id: parseInt(id) },
      include: {
        userProduct: true,
        competitorProduct: true
      }
    });

    if (!mapping || mapping.userId !== userId) {
      return res.status(404).json({
        success: false,
        error: 'Product mapping not found'
      });
    }

    // Update mapping status
    const updatedMapping = await prisma.productMapping.update({
      where: { id: parseInt(id) },
      data: {
        status: 'approved',
        reviewedAt: new Date(),
        reviewNotes: notes || null
      },
      include: {
        userProduct: true,
        competitorProduct: true
      }
    });

    // Optional: could update related monitoring settings here if needed

    res.json({
      success: true,
      data: updatedMapping,
      message: 'Product mapping approved successfully'
    });

  } catch (error) {
    console.error('Error approving mapping:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to approve product mapping'
    });
  }
});

// POST /api/dashboard/mappings/:id/approve-and-monitor - Approve and start monitoring
router.post('/mappings/:id/approve-and-monitor', async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { notes, schedule = 'daily' } = req.body;

    const mapping = await prisma.productMapping.findUnique({
      where: { id: parseInt(id) },
      include: { userProduct: true, competitorProduct: true }
    });

    if (!mapping || mapping.userId !== userId) {
      return res.status(404).json({ success: false, error: 'Product mapping not found' });
    }

    const updatedMapping = await prisma.productMapping.update({
      where: { id: parseInt(id) },
      data: { status: 'approved', reviewedAt: new Date(), reviewNotes: notes || null },
      include: { userProduct: true, competitorProduct: true }
    });

    // Schedule monitoring immediately after approval
    const scheduleResult = await priceMonitoringService.schedulePriceMonitoring(parseInt(id), schedule);

    res.json({
      success: true,
      data: {
        mapping: updatedMapping,
        monitoring: scheduleResult
      },
      message: 'Product mapping approved and monitoring scheduled'
    });

  } catch (error) {
    console.error('Error approving and scheduling monitoring:', error);
    res.status(500).json({ success: false, error: 'Failed to approve mapping and schedule monitoring' });
  }
});

// POST /api/dashboard/mappings/:id/reject - Reject a product mapping
router.post('/mappings/:id/reject', async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { reason } = req.body;

    const mapping = await prisma.productMapping.findUnique({
      where: { id: parseInt(id) }
    });

    if (!mapping || mapping.userId !== userId) {
      return res.status(404).json({
        success: false,
        error: 'Product mapping not found'
      });
    }

    // Update mapping status
    const updatedMapping = await prisma.productMapping.update({
      where: { id: parseInt(id) },
      data: {
        status: 'rejected',
        reviewedAt: new Date(),
        reviewNotes: reason || null
      },
      include: {
        userProduct: true,
        competitorProduct: true
      }
    });

    res.json({
      success: true,
      data: updatedMapping,
      message: 'Product mapping rejected successfully'
    });

  } catch (error) {
    console.error('Error rejecting mapping:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to reject product mapping'
    });
  }
});

// DELETE /api/dashboard/mappings/:id - Delete a product mapping
router.delete('/mappings/:id', async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const mapping = await prisma.productMapping.findUnique({
      where: { id: parseInt(id) }
    });

    if (!mapping || mapping.userId !== userId) {
      return res.status(404).json({
        success: false,
        error: 'Product mapping not found'
      });
    }

    await prisma.productMapping.delete({
      where: { id: parseInt(id) }
    });

    res.json({
      success: true,
      message: 'Product mapping deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting mapping:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete product mapping'
    });
  }
});

// GET /api/dashboard/price-history/:competitorProductId - Get price history
router.get('/price-history/:competitorProductId', async (req, res) => {
  try {
    const userId = req.user.id;
    const { competitorProductId } = req.params;
    const { days = 30 } = req.query;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    // First verify the competitor product belongs to the user
    const competitorProduct = await prisma.competitorProduct.findUnique({
      where: { id: parseInt(competitorProductId) },
      select: { userId: true, title: true, url: true, price: true }
    });

    if (!competitorProduct || competitorProduct.userId !== userId) {
      return res.status(404).json({
        success: false,
        error: 'Competitor product not found'
      });
    }

    const priceHistory = await prisma.priceHistory.findMany({
      where: {
        competitorProductId: parseInt(competitorProductId),
        userId,
        recordedAt: { gte: startDate }
      },
      orderBy: { recordedAt: 'asc' }
    });

    res.json({
      success: true,
      data: {
        competitorProduct: { title: competitorProduct.title, url: competitorProduct.url, price: competitorProduct.price },
        priceHistory,
        summary: {
          currentPrice: competitorProduct?.price,
          lowestPrice: Math.min(...priceHistory.map(p => p.price)),
          highestPrice: Math.max(...priceHistory.map(p => p.price)),
          averagePrice: priceHistory.length > 0 
            ? priceHistory.reduce((sum, p) => sum + p.price, 0) / priceHistory.length 
            : 0,
          totalDataPoints: priceHistory.length
        }
      }
    });

  } catch (error) {
    console.error('Error fetching price history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch price history'
    });
  }
});

export default router;