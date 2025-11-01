import express from 'express';
import ShopifyService from '../services/shopifyService.js';
import PriceMonitoringService from '../services/priceMonitoringService.js';
import { authenticateToken } from '../middleware/auth.js';
import prisma from '../utils/prisma.js';

const router = express.Router();
const shopifyService = new ShopifyService();
const priceMonitoringService = new PriceMonitoringService();

// GET /api/shopify/auth - Initiate Shopify OAuth
router.get('/auth', authenticateToken, (req, res) => {
  try {
    const { shop } = req.query;

    if (!shop) {
      return res.status(400).json({
        success: false,
        error: 'Shop parameter is required'
      });
    }

    // Validate shop domain format
    const shopDomain = shop.includes('.myshopify.com') ? shop : `${shop}.myshopify.com`;
    const state = Math.random().toString(36).substring(7);

    const authResult = shopifyService.generateAuthUrl(shopDomain, state);

    if (!authResult.success) {
      return res.status(400).json(authResult);
    }

    // Store state and user ID in session for validation
    req.session = req.session || {};
    req.session.shopifyState = state;
    req.session.shopifyShop = shopDomain;
    req.session.userId = req.user.id; // Store authenticated user ID

    res.json({
      success: true,
      authUrl: authResult.authUrl,
      shop: shopDomain
    });

  } catch (error) {
    console.error('Error initiating Shopify auth:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to initiate Shopify authentication'
    });
  }
});

// GET /api/shopify/callback - Handle Shopify OAuth callback
router.get('/callback', async (req, res) => {
  try {
    const { shop, code, state } = req.query;

    if (!shop || !code) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters'
      });
    }

    // Validate state parameter and get user ID from session
    if (!req.session?.shopifyState || req.session.shopifyState !== state) {
      return res.status(400).json({
        success: false,
        error: 'Invalid state parameter'
      });
    }

    const userId = req.session.userId;
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'User session not found. Please authenticate first.'
      });
    }

    const callbackResult = await shopifyService.handleCallback(shop, code, state, userId);

    if (!callbackResult.success) {
      return res.status(400).json(callbackResult);
    }

    // Clear session state
    if (req.session) {
      delete req.session.shopifyState;
      delete req.session.shopifyShop;
      delete req.session.userId;
    }

    // Redirect to success page or return success response
    res.json({
      success: true,
      message: 'Shopify store connected successfully',
      store: {
        shop: callbackResult.store.shopDomain,
        name: callbackResult.store.storeName,
        connectedAt: callbackResult.store.createdAt
      }
    });

  } catch (error) {
    console.error('Error handling Shopify callback:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to complete Shopify authentication'
    });
  }
});

// GET /api/shopify/status/:shop - Get Shopify store connection status
router.get('/status/:shop', async (req, res) => {
  try {
    const { shop } = req.params;
    const shopDomain = shop.includes('.myshopify.com') ? shop : `${shop}.myshopify.com`;

    const status = await shopifyService.getStoreStatus(shopDomain);
    res.json(status);

  } catch (error) {
    console.error('Error getting Shopify store status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get store status'
    });
  }
});

// GET /api/shopify/products/:shop - Fetch products from Shopify store
router.get('/products/:shop', async (req, res) => {
  try {
    const { shop } = req.params;
    const { limit = 50, cursor, query } = req.query;
    
    const shopDomain = shop.includes('.myshopify.com') ? shop : `${shop}.myshopify.com`;

    const products = await shopifyService.fetchProducts(shopDomain, {
      limit: parseInt(limit),
      cursor,
      query
    });

    res.json(products);

  } catch (error) {
    console.error('Error fetching Shopify products:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch products'
    });
  }
});

// POST /api/shopify/sync-prices - Sync competitor prices to Shopify
router.post('/sync-prices', async (req, res) => {
  try {
    const { shop, mappingIds, options = {} } = req.body;

    if (!shop || !mappingIds || !Array.isArray(mappingIds)) {
      return res.status(400).json({
        success: false,
        error: 'Shop and mappingIds array are required'
      });
    }

    const shopDomain = shop.includes('.myshopify.com') ? shop : `${shop}.myshopify.com`;

    const syncResult = await shopifyService.syncCompetitorPrices(
      shopDomain,
      mappingIds,
      options
    );

    res.json(syncResult);

  } catch (error) {
    console.error('Error syncing prices to Shopify:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to sync prices'
    });
  }
});

// POST /api/shopify/update-price - Update single product price
router.post('/update-price', async (req, res) => {
  try {
    const { shop, variantId, price, compareAtPrice } = req.body;

    if (!shop || !variantId || !price) {
      return res.status(400).json({
        success: false,
        error: 'Shop, variantId, and price are required'
      });
    }

    const shopDomain = shop.includes('.myshopify.com') ? shop : `${shop}.myshopify.com`;

    const updateResult = await shopifyService.updateProductPrice(
      shopDomain,
      variantId,
      parseFloat(price),
      compareAtPrice ? parseFloat(compareAtPrice) : null
    );

    res.json(updateResult);

  } catch (error) {
    console.error('Error updating product price:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update product price'
    });
  }
});

// GET /api/shopify/sync-history - Get price sync history
router.get('/sync-history', async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 20, shop } = req.query;
    const skip = (page - 1) * limit;

    const where = {
      syncedToShopify: true,
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

    if (shop) {
      // Filter by shop if provided (would need to join with mappings)
      const shopDomain = shop.includes('.myshopify.com') ? shop : `${shop}.myshopify.com`;
      // This would require a more complex query joining through mappings
    }

    const [syncHistory, total] = await Promise.all([
      prisma.priceHistory.findMany({
        where,
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
        orderBy: { createdAt: 'desc' }
      }),
      prisma.priceHistory.count({ where })
    ]);

    res.json({
      success: true,
      data: {
        syncHistory: syncHistory.map(history => ({
          id: history.id,
          price: history.price,
          previousPrice: history.previousPrice,
          priceChange: history.priceChange,
          priceChangePercent: history.priceChangePercent,
          syncedAt: history.createdAt,
          shopifyVariantId: history.shopifyVariantId,
          competitorProduct: {
            title: history.competitorProduct.title,
            url: history.competitorProduct.url
          },
          userProduct: history.competitorProduct.productMappings[0]?.userProduct || null
        })),
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });

  } catch (error) {
    console.error('Error fetching sync history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch sync history'
    });
  }
});

// POST /api/shopify/disconnect - Disconnect Shopify store
router.post('/disconnect', async (req, res) => {
  try {
    const { shop } = req.body;

    if (!shop) {
      return res.status(400).json({
        success: false,
        error: 'Shop parameter is required'
      });
    }

    const shopDomain = shop.includes('.myshopify.com') ? shop : `${shop}.myshopify.com`;

    const disconnectResult = await shopifyService.disconnectStore(shopDomain);
    res.json(disconnectResult);

  } catch (error) {
    console.error('Error disconnecting Shopify store:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to disconnect store'
    });
  }
});

// GET /api/shopify/stores - Get all connected Shopify stores
router.get('/stores', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    
    const stores = await prisma.shopifyStore.findMany({
      where: { 
        userId
      },
      select: {
        id: true,
        shopDomain: true,
        storeName: true,
        storeEmail: true,
        currency: true,
        timezone: true,
        createdAt: true,
        updatedAt: true
      },
      orderBy: { updatedAt: 'desc' }
    });

    res.json({
      success: true,
      data: { stores }
    });

  } catch (error) {
    console.error('Error fetching connected stores:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch connected stores'
    });
  }
});

// POST /api/shopify/schedule-sync - Schedule automatic price sync
router.post('/schedule-sync', async (req, res) => {
  try {
    const { shop, mappingIds, schedule = 'daily' } = req.body;

    if (!shop || !mappingIds || !Array.isArray(mappingIds)) {
      return res.status(400).json({
        success: false,
        error: 'Shop and mappingIds array are required'
      });
    }

    const results = [];
    const errors = [];

    // Schedule price monitoring for each mapping
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
        errors
      }
    });

  } catch (error) {
    console.error('Error scheduling price sync:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to schedule price sync'
    });
  }
});

// Webhook endpoint for Shopify (for future implementation)
router.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  try {
    const signature = req.get('X-Shopify-Hmac-Sha256');
    const body = req.body;

    // Validate webhook signature
    const isValid = shopifyService.validateWebhook(body, signature);

    if (!isValid) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized webhook'
      });
    }

    // Process webhook payload
    const payload = JSON.parse(body.toString());
    
    // Handle different webhook topics
    // This would be expanded based on specific webhook needs
    console.log('Received Shopify webhook:', payload);

    res.status(200).json({ success: true });

  } catch (error) {
    console.error('Error processing Shopify webhook:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process webhook'
    });
  }
});

export default router;