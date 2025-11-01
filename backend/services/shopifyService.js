import { shopifyApi, LATEST_API_VERSION } from '@shopify/shopify-api';
import prisma from '../utils/prisma.js';
import '@shopify/shopify-api/adapters/node';
import crypto from 'crypto';

class ShopifyService {
  constructor() {
    this.prisma = prisma;
    
    // Only initialize Shopify API if credentials are provided
    if (process.env.SHOPIFY_API_KEY && process.env.SHOPIFY_API_SECRET) {
      this.shopify = shopifyApi({
        apiKey: process.env.SHOPIFY_API_KEY,
        apiSecretKey: process.env.SHOPIFY_API_SECRET,
        scopes: ['read_products', 'write_products', 'read_orders', 'write_orders'],
        hostName: process.env.SHOPIFY_APP_URL || 'localhost:4000',
        apiVersion: LATEST_API_VERSION,
        isEmbeddedApp: true,
        logger: {
          level: process.env.NODE_ENV === 'development' ? 'debug' : 'info',
        },
      });
    } else {
      console.warn('Shopify API credentials not provided. Shopify features will be disabled.');
      this.shopify = null;
    }
  }

  // Helper method to check if Shopify is available
  isShopifyAvailable() {
    return this.shopify !== null;
  }

  // Generate OAuth URL for app installation
  generateAuthUrl(shop, state) {
    if (!this.isShopifyAvailable()) {
      throw new Error('Shopify API not configured. Please set SHOPIFY_API_KEY and SHOPIFY_API_SECRET.');
    }
    
    try {
      const authRoute = this.shopify.auth.begin({
        shop: shop,
        callbackPath: '/api/shopify/callback',
        isOnline: false,
        rawRequest: { query: { state } }
      });

      return {
        success: true,
        authUrl: authRoute
      };

    } catch (error) {
      console.error('Error generating Shopify auth URL:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Handle OAuth callback and store access token
  async handleCallback(shop, code, state, userId) {
    if (!this.isShopifyAvailable()) {
      throw new Error('Shopify API not configured. Please set SHOPIFY_API_KEY and SHOPIFY_API_SECRET.');
    }
    
    try {
      const callback = await this.shopify.auth.callback({
        rawRequest: {
          query: { shop, code, state }
        }
      });

      const { session } = callback;

      // Store or update Shopify store information with user association
      const shopifyStore = await this.prisma.shopifyStore.upsert({
        where: { shopDomain: session.shop },
        update: {
          userId: userId,
          accessToken: session.accessToken,
          updatedAt: new Date()
        },
        create: {
          userId: userId,
          shopDomain: session.shop,
          accessToken: session.accessToken,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      });

      // Fetch and store basic shop information
      await this.fetchAndStoreShopInfo(shopifyStore.id, session);

      return {
        success: true,
        store: shopifyStore,
        session
      };

    } catch (error) {
      console.error('Error handling Shopify callback:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Fetch and store shop information
  async fetchAndStoreShopInfo(storeId, session) {
    try {
      const client = new this.shopify.clients.Graphql({ session });

      const shopQuery = `
        query {
          shop {
            id
            name
            email
            domain
            myshopifyDomain
            plan {
              displayName
            }
            currencyCode
            timezoneAbbreviation
            weightUnit
          }
        }
      `;

      const response = await client.query({
        data: { query: shopQuery }
      });

      const shopData = response.body.data.shop;

      // Update store with shop information
      await this.prisma.shopifyStore.update({
        where: { id: storeId },
        data: {
          storeName: shopData.name,
          storeEmail: shopData.email,
          currency: shopData.currencyCode,
          timezone: shopData.timezoneAbbreviation,
          updatedAt: new Date()
        }
      });

      return shopData;

    } catch (error) {
      console.error('Error fetching shop info:', error);
      // Don't throw error, just log it as shop info is not critical
      return null;
    }
  }

  // Get active session for a shop
  async getSession(shop) {
    if (!this.isShopifyAvailable()) {
      return null;
    }
    
    try {
      const store = await this.prisma.shopifyStore.findUnique({
        where: { shop: shop, isActive: true }
      });

      if (!store) {
        throw new Error('Shop not found or not active');
      }

      return {
        id: `offline_${shop}`,
        shop: shop,
        accessToken: store.accessToken,
        scope: store.scope
      };

    } catch (error) {
      console.error('Error getting session:', error);
      throw error;
    }
  }

  // Fetch products from Shopify store
  async fetchProducts(shop, options = {}) {
    if (!this.isShopifyAvailable()) {
      throw new Error('Shopify API not configured. Please set SHOPIFY_API_KEY and SHOPIFY_API_SECRET.');
    }
    
    try {
      const session = await this.getSession(shop);
      const client = new this.shopify.clients.Graphql({ session });

      const { limit = 50, cursor = null, query = '' } = options;

      const productsQuery = `
        query getProducts($first: Int!, $after: String, $query: String) {
          products(first: $first, after: $after, query: $query) {
            edges {
              node {
                id
                title
                handle
                description
                vendor
                productType
                tags
                status
                createdAt
                updatedAt
                variants(first: 10) {
                  edges {
                    node {
                      id
                      title
                      sku
                      price
                      compareAtPrice
                      inventoryQuantity
                      weight
                      weightUnit
                      barcode
                    }
                  }
                }
                images(first: 5) {
                  edges {
                    node {
                      id
                      url
                      altText
                    }
                  }
                }
              }
              cursor
            }
            pageInfo {
              hasNextPage
              hasPreviousPage
            }
          }
        }
      `;

      const response = await client.query({
        data: {
          query: productsQuery,
          variables: {
            first: limit,
            after: cursor,
            query: query
          }
        }
      });

      const products = response.body.data.products;

      return {
        success: true,
        products: products.edges.map(edge => ({
          ...edge.node,
          cursor: edge.cursor
        })),
        pageInfo: products.pageInfo
      };

    } catch (error) {
      console.error('Error fetching Shopify products:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Update product price in Shopify
  async updateProductPrice(shop, variantId, newPrice, compareAtPrice = null) {
    try {
      const session = await this.getSession(shop);
      const client = new this.shopify.clients.Graphql({ session });

      const updateMutation = `
        mutation productVariantUpdate($input: ProductVariantInput!) {
          productVariantUpdate(input: $input) {
            productVariant {
              id
              price
              compareAtPrice
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

      const variables = {
        input: {
          id: variantId,
          price: newPrice.toString()
        }
      };

      if (compareAtPrice !== null) {
        variables.input.compareAtPrice = compareAtPrice.toString();
      }

      const response = await client.query({
        data: {
          query: updateMutation,
          variables
        }
      });

      const result = response.body.data.productVariantUpdate;

      if (result.userErrors && result.userErrors.length > 0) {
        throw new Error(`Shopify API errors: ${result.userErrors.map(e => e.message).join(', ')}`);
      }

      return {
        success: true,
        variant: result.productVariant
      };

    } catch (error) {
      console.error('Error updating product price:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Sync competitor prices to Shopify products
  async syncCompetitorPrices(shop, mappingIds, options = {}) {
    try {
      const { dryRun = false, priceStrategy = 'match', margin = 0 } = options;
      
      const mappings = await this.prisma.productMapping.findMany({
        where: {
          id: { in: mappingIds },
          status: 'APPROVED'
        },
        include: {
          userProduct: true,
          competitorProduct: true
        }
      });

      const results = [];
      const errors = [];

      for (const mapping of mappings) {
        try {
          const competitorPrice = mapping.competitorProduct.price;
          let newPrice = competitorPrice;

          // Apply pricing strategy
          switch (priceStrategy) {
            case 'match':
              newPrice = competitorPrice;
              break;
            case 'undercut':
              newPrice = competitorPrice * (1 - margin / 100);
              break;
            case 'premium':
              newPrice = competitorPrice * (1 + margin / 100);
              break;
          }

          // Round to 2 decimal places
          newPrice = Math.round(newPrice * 100) / 100;

          if (!dryRun) {
            // Find Shopify product by SKU
            const shopifyProducts = await this.fetchProducts(shop, {
              query: `sku:${mapping.userProduct.sku}`
            });

            if (shopifyProducts.success && shopifyProducts.products.length > 0) {
              const product = shopifyProducts.products[0];
              const variant = product.variants.edges.find(v => 
                v.node.sku === mapping.userProduct.sku
              );

              if (variant) {
                const updateResult = await this.updateProductPrice(
                  shop,
                  variant.node.id,
                  newPrice
                );

                if (updateResult.success) {
                  // Record price sync in database
                  await this.prisma.priceHistory.create({
                    data: {
                      competitorProductId: mapping.competitorProductId,
                      price: newPrice,
                      previousPrice: parseFloat(variant.node.price),
                      priceChange: newPrice - parseFloat(variant.node.price),
                      priceChangePercent: ((newPrice - parseFloat(variant.node.price)) / parseFloat(variant.node.price)) * 100,
                      syncedToShopify: true,
                      shopifyVariantId: variant.node.id
                    }
                  });

                  results.push({
                    mappingId: mapping.id,
                    sku: mapping.userProduct.sku,
                    oldPrice: parseFloat(variant.node.price),
                    newPrice: newPrice,
                    competitorPrice: competitorPrice,
                    strategy: priceStrategy,
                    success: true
                  });
                } else {
                  errors.push({
                    mappingId: mapping.id,
                    sku: mapping.userProduct.sku,
                    error: updateResult.error
                  });
                }
              } else {
                errors.push({
                  mappingId: mapping.id,
                  sku: mapping.userProduct.sku,
                  error: 'Variant not found in Shopify'
                });
              }
            } else {
              errors.push({
                mappingId: mapping.id,
                sku: mapping.userProduct.sku,
                error: 'Product not found in Shopify'
              });
            }
          } else {
            // Dry run - just return what would be changed
            results.push({
              mappingId: mapping.id,
              sku: mapping.userProduct.sku,
              currentPrice: 'N/A (dry run)',
              newPrice: newPrice,
              competitorPrice: competitorPrice,
              strategy: priceStrategy,
              dryRun: true
            });
          }

        } catch (error) {
          errors.push({
            mappingId: mapping.id,
            sku: mapping.userProduct?.sku || 'Unknown',
            error: error.message
          });
        }
      }

      return {
        success: true,
        processed: results.length,
        errors: errors.length,
        results,
        errors,
        dryRun
      };

    } catch (error) {
      console.error('Error syncing competitor prices:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Get Shopify store status and connection info
  async getStoreStatus(shop) {
    try {
      const store = await this.prisma.shopifyStore.findUnique({
        where: { shop: shop }
      });

      if (!store) {
        return {
          success: false,
          connected: false,
          error: 'Store not found'
        };
      }

      // Test connection by making a simple API call
      try {
        const session = await this.getSession(shop);
        const client = new this.shopify.clients.Graphql({ session });

        const testQuery = `
          query {
            shop {
              name
              plan {
                displayName
              }
            }
          }
        `;

        await client.query({ data: { query: testQuery } });

        return {
          success: true,
          connected: true,
          store: {
            shop: store.shop,
            name: store.name,
            domain: store.domain,
            plan: store.plan,
            currencyCode: store.currencyCode,
            lastConnectedAt: store.lastConnectedAt,
            isActive: store.isActive
          }
        };

      } catch (apiError) {
        // Update store status if API call fails
        await this.prisma.shopifyStore.update({
          where: { id: store.id },
          data: { isActive: false }
        });

        return {
          success: false,
          connected: false,
          error: 'API connection failed - token may be invalid',
          store: {
            shop: store.shop,
            name: store.name,
            lastConnectedAt: store.lastConnectedAt,
            isActive: false
          }
        };
      }

    } catch (error) {
      console.error('Error getting store status:', error);
      return {
        success: false,
        connected: false,
        error: error.message
      };
    }
  }

  // Disconnect Shopify store
  async disconnectStore(shop) {
    try {
      await this.prisma.shopifyStore.update({
        where: { shop: shop },
        data: {
          isActive: false,
          accessToken: null
        }
      });

      return {
        success: true,
        message: 'Store disconnected successfully'
      };

    } catch (error) {
      console.error('Error disconnecting store:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Validate webhook (for future webhook implementation)
  validateWebhook(rawBody, signature) {
    const hmac = crypto.createHmac('sha256', process.env.SHOPIFY_WEBHOOK_SECRET);
    hmac.update(rawBody, 'utf8');
    const hash = hmac.digest('base64');

    return hash === signature;
  }
}

export default ShopifyService;