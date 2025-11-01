import express from 'express';
import prisma from '../utils/prisma.js';
import MatchingService from '../services/matchingService.js';
import ScrapingService from '../services/scrapingService.js';
import AIService from '../services/aiService.js';

const router = express.Router();
const aiService = new AIService();
const scrapingService = new ScrapingService();
const matchingService = new MatchingService();

// GET /api/dashboard/overview - Dashboard overview statistics
router.get('/overview', async (req, res) => {
  try {
    const stats = await Promise.all([
      prisma.userProduct.count(),
      prisma.competitorProduct.count(),
      prisma.productMapping.count({ where: { status: 'approved' } }),
      prisma.productMapping.count({ where: { status: 'pending' } }),
      prisma.priceHistory.count(),
      prisma.uploadBatch.count()
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
        recordedAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
        }
      },
      include: {
        competitorProduct: {
          include: {
            productMappings: {
              where: { status: 'approved' },
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
    const { page = 1, limit = 20, status, search, batchId } = req.query;
    const skip = (page - 1) * limit;

    const where = {};
    
    if (status) {
      where.status = status;
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
    const { page = 1, limit = 20, status, confidence } = req.query;
    const skip = (page - 1) * limit;

    const where = {};
    
    if (status) {
      where.status = status;
    }
    
    if (confidence) {
      where.confidence = { gte: parseFloat(confidence) };
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

    if (!userProduct) {
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
        const searchResults = await scrapingService.searchCompetitorSite(domain, keywords);
        
        // Scrape top results
        const scrapedProducts = await scrapingService.batchScrapeProducts(
          searchResults.slice(0, 5).map(r => r.url),
          2 // Concurrency limit
        );

        // Save competitor products to database
        for (const product of scrapedProducts.results) {
          const competitorProduct = await prisma.competitorProduct.create({
            data: {
              title: product.title,
              url: product.sourceUrl,
              price: product.price,
              image: product.image,
              description: product.description,
              brand: product.brand,
              category: product.category,
              material: product.material,
              size: product.size,
              color: product.color,
              availability: product.availability || 'UNKNOWN',
              rating: product.rating,
              reviewCount: product.reviewCount,
              domain: domain,
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
          userProductId: userProductId,
          competitorProductId: match.competitorProduct.id,
          confidence: match.confidence,
          matchScore: match.matchScore,
          status: 'PENDING'
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
    const { id } = req.params;
    const { notes } = req.body;

    const mapping = await prisma.productMapping.findUnique({
      where: { id: parseInt(id) },
      include: {
        userProduct: true,
        competitorProduct: true
      }
    });

    if (!mapping) {
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

    // Update user product status
    await prisma.userProduct.update({
      where: { id: mapping.userProductId },
      data: { status: 'MAPPED' }
    });

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

// POST /api/dashboard/mappings/:id/reject - Reject a product mapping
router.post('/mappings/:id/reject', async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const mapping = await prisma.productMapping.findUnique({
      where: { id: parseInt(id) }
    });

    if (!mapping) {
      return res.status(404).json({
        success: false,
        error: 'Product mapping not found'
      });
    }

    // Update mapping status
    const updatedMapping = await prisma.productMapping.update({
      where: { id: parseInt(id) },
      data: {
        status: 'REJECTED',
        rejectedAt: new Date(),
        notes: reason || null
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
    const { id } = req.params;

    const mapping = await prisma.productMapping.findUnique({
      where: { id: parseInt(id) }
    });

    if (!mapping) {
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
    const { competitorProductId } = req.params;
    const { days = 30 } = req.query;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    const priceHistory = await prisma.priceHistory.findMany({
      where: {
        competitorProductId: parseInt(competitorProductId),
        recordedAt: { gte: startDate }
      },
      orderBy: { recordedAt: 'asc' }
    });

    const competitorProduct = await prisma.competitorProduct.findUnique({
      where: { id: parseInt(competitorProductId) },
      select: { title: true, url: true, currentPrice: true }
    });

    res.json({
      success: true,
      data: {
        competitorProduct,
        priceHistory,
        summary: {
          currentPrice: competitorProduct?.currentPrice,
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