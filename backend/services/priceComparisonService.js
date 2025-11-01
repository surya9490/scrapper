import { PrismaClient } from '@prisma/client';
import nodemailer from 'nodemailer';

class PriceComparisonService {
  constructor() {
    this.prisma = new PrismaClient();
    this.emailTransporter = this.initializeEmailTransporter();
  }

  // Initialize email transporter for notifications
  initializeEmailTransporter() {
    if (!process.env.EMAIL_HOST || !process.env.EMAIL_USER) {
      console.warn('⚠️ Email configuration not found. Email notifications will be disabled.');
      return null;
    }

    try {
      return nodemailer.createTransporter({
        host: process.env.EMAIL_HOST,
        port: process.env.EMAIL_PORT || 587,
        secure: process.env.EMAIL_SECURE === 'true',
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS
        }
      });
    } catch (error) {
      console.error('❌ Failed to initialize email transporter:', error);
      return null;
    }
  }

  // Analyze price trends for a specific product
  async analyzePriceTrends(competitorProductId, days = 30) {
    try {
      const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      
      const priceHistory = await this.prisma.priceHistory.findMany({
        where: {
          competitorProductId,
          recordedAt: { gte: cutoffDate }
        },
        orderBy: { recordedAt: 'asc' }
      });

      if (priceHistory.length < 2) {
        return {
          success: false,
          message: 'Insufficient price history for analysis'
        };
      }

      const prices = priceHistory.map(h => h.price);
      const dates = priceHistory.map(h => h.recordedAt);
      
      // Calculate trend metrics
      const currentPrice = prices[prices.length - 1];
      const initialPrice = prices[0];
      const minPrice = Math.min(...prices);
      const maxPrice = Math.max(...prices);
      const avgPrice = prices.reduce((sum, price) => sum + price, 0) / prices.length;
      
      const totalChange = currentPrice - initialPrice;
      const totalChangePercent = initialPrice > 0 ? (totalChange / initialPrice) * 100 : 0;
      
      // Calculate volatility (standard deviation)
      const variance = prices.reduce((sum, price) => sum + Math.pow(price - avgPrice, 2), 0) / prices.length;
      const volatility = Math.sqrt(variance);
      
      // Determine trend direction
      const recentPrices = prices.slice(-7); // Last 7 data points
      const recentTrend = this.calculateTrend(recentPrices);
      
      // Price stability analysis
      const priceChanges = priceHistory.slice(1).map((h, i) => 
        Math.abs((h.price - priceHistory[i].price) / priceHistory[i].price) * 100
      );
      const avgChangePercent = priceChanges.length > 0 
        ? priceChanges.reduce((sum, change) => sum + change, 0) / priceChanges.length 
        : 0;

      return {
        success: true,
        analysis: {
          period: `${days} days`,
          dataPoints: priceHistory.length,
          currentPrice,
          initialPrice,
          minPrice,
          maxPrice,
          avgPrice,
          totalChange,
          totalChangePercent,
          volatility,
          recentTrend,
          avgChangePercent,
          priceHistory: priceHistory.map(h => ({
            price: h.price,
            date: h.recordedAt,
            change: h.priceChange,
            changePercent: h.priceChangePercent
          }))
        }
      };
    } catch (error) {
      console.error('❌ Error analyzing price trends:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Calculate trend direction using linear regression
  calculateTrend(prices) {
    if (prices.length < 2) return 'insufficient_data';
    
    const n = prices.length;
    const x = Array.from({ length: n }, (_, i) => i);
    const y = prices;
    
    const sumX = x.reduce((sum, val) => sum + val, 0);
    const sumY = y.reduce((sum, val) => sum + val, 0);
    const sumXY = x.reduce((sum, val, i) => sum + val * y[i], 0);
    const sumXX = x.reduce((sum, val) => sum + val * val, 0);
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    
    if (Math.abs(slope) < 0.01) return 'stable';
    return slope > 0 ? 'increasing' : 'decreasing';
  }

  // Compare prices across competitors for user products
  async compareCompetitorPrices(userProductId) {
    try {
      const userProduct = await this.prisma.userProduct.findUnique({
        where: { id: userProductId },
        include: {
          productMappings: {
            include: {
              competitorProduct: {
                include: {
                  priceHistory: {
                    orderBy: { recordedAt: 'desc' },
                    take: 1
                  }
                }
              }
            }
          }
        }
      });

      if (!userProduct) {
        return {
          success: false,
          message: 'User product not found'
        };
      }

      const competitors = userProduct.productMappings.map(mapping => {
        const competitor = mapping.competitorProduct;
        const latestPrice = competitor.priceHistory[0];
        
        return {
          id: competitor.id,
          title: competitor.title,
          url: competitor.url,
          currentPrice: competitor.price,
          lastUpdated: competitor.lastScrapedAt,
          priceHistory: latestPrice,
          confidence: mapping.confidence
        };
      });

      if (competitors.length === 0) {
        return {
          success: false,
          message: 'No competitors found for this product'
        };
      }

      // Calculate comparison metrics
      const prices = competitors.map(c => c.currentPrice).filter(p => p > 0);
      const minPrice = Math.min(...prices);
      const maxPrice = Math.max(...prices);
      const avgPrice = prices.reduce((sum, price) => sum + price, 0) / prices.length;
      
      // Find best and worst deals
      const bestDeal = competitors.find(c => c.currentPrice === minPrice);
      const worstDeal = competitors.find(c => c.currentPrice === maxPrice);
      
      // Calculate user product position
      const userPrice = userProduct.price || 0;
      const pricePosition = userPrice > 0 ? this.calculatePricePosition(userPrice, prices) : null;

      return {
        success: true,
        comparison: {
          userProduct: {
            id: userProduct.id,
            title: userProduct.title,
            price: userPrice,
            pricePosition
          },
          competitors,
          metrics: {
            totalCompetitors: competitors.length,
            minPrice,
            maxPrice,
            avgPrice,
            priceRange: maxPrice - minPrice,
            priceSpread: ((maxPrice - minPrice) / avgPrice) * 100
          },
          bestDeal,
          worstDeal,
          recommendations: this.generatePriceRecommendations(userPrice, prices, avgPrice)
        }
      };
    } catch (error) {
      console.error('❌ Error comparing competitor prices:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Calculate price position relative to competitors
  calculatePricePosition(userPrice, competitorPrices) {
    const sortedPrices = [...competitorPrices].sort((a, b) => a - b);
    const position = sortedPrices.findIndex(price => price >= userPrice);
    const percentile = position === -1 ? 100 : (position / sortedPrices.length) * 100;
    
    let category;
    if (percentile <= 25) category = 'very_competitive';
    else if (percentile <= 50) category = 'competitive';
    else if (percentile <= 75) category = 'above_average';
    else category = 'premium';
    
    return {
      percentile: Math.round(percentile),
      category,
      position: position === -1 ? sortedPrices.length : position + 1,
      totalCompetitors: sortedPrices.length
    };
  }

  // Generate pricing recommendations
  generatePriceRecommendations(userPrice, competitorPrices, avgPrice) {
    const recommendations = [];
    
    if (userPrice === 0) {
      recommendations.push({
        type: 'set_price',
        message: 'Set a price for your product to enable price comparison',
        priority: 'high'
      });
      return recommendations;
    }
    
    const minPrice = Math.min(...competitorPrices);
    const maxPrice = Math.max(...competitorPrices);
    
    if (userPrice > maxPrice) {
      recommendations.push({
        type: 'price_too_high',
        message: `Your price is ${((userPrice - maxPrice) / maxPrice * 100).toFixed(1)}% higher than the highest competitor`,
        priority: 'high',
        suggestedAction: 'Consider reducing price to improve competitiveness'
      });
    } else if (userPrice < minPrice) {
      recommendations.push({
        type: 'price_very_low',
        message: `Your price is ${((minPrice - userPrice) / minPrice * 100).toFixed(1)}% lower than the lowest competitor`,
        priority: 'medium',
        suggestedAction: 'You may be able to increase price while remaining competitive'
      });
    } else if (userPrice > avgPrice * 1.1) {
      recommendations.push({
        type: 'above_average',
        message: `Your price is ${((userPrice - avgPrice) / avgPrice * 100).toFixed(1)}% above market average`,
        priority: 'medium',
        suggestedAction: 'Monitor competitor reactions to price changes'
      });
    } else if (userPrice < avgPrice * 0.9) {
      recommendations.push({
        type: 'below_average',
        message: `Your price is ${((avgPrice - userPrice) / avgPrice * 100).toFixed(1)}% below market average`,
        priority: 'low',
        suggestedAction: 'Consider gradual price increases to optimize revenue'
      });
    } else {
      recommendations.push({
        type: 'well_positioned',
        message: 'Your price is well-positioned within the competitive range',
        priority: 'low',
        suggestedAction: 'Continue monitoring for market changes'
      });
    }
    
    return recommendations;
  }

  // Create price alert with notification
  async createPriceAlert(alertData) {
    try {
      const {
        type,
        competitorProductId,
        userProductId,
        priceHistoryId,
        message,
        severity = 'MEDIUM',
        notificationMethods = ['system']
      } = alertData;

      // For now, we'll create a comprehensive alert object
      // In a full implementation, this would save to a PriceAlert table
      const alert = {
        id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type,
        severity,
        competitorProductId,
        userProductId,
        priceHistoryId,
        message,
        notificationMethods,
        isRead: false,
        createdAt: new Date(),
        metadata: {}
      };

      // Get additional context
      if (competitorProductId) {
        const competitor = await this.prisma.competitorProduct.findUnique({
          where: { id: competitorProductId },
          include: {
            productMappings: {
              include: {
                userProduct: true
              }
            }
          }
        });
        
        if (competitor) {
          alert.metadata.competitor = {
            title: competitor.title,
            url: competitor.url,
            currentPrice: competitor.price
          };
          
          if (competitor.productMappings.length > 0) {
            alert.metadata.userProduct = {
              title: competitor.productMappings[0].userProduct.title,
              price: competitor.productMappings[0].userProduct.price
            };
          }
        }
      }

      // Send notifications
      if (notificationMethods.includes('email')) {
        await this.sendEmailNotification(alert);
      }

      if (notificationMethods.includes('webhook')) {
        await this.sendWebhookNotification(alert);
      }

      console.log('🚨 Price Alert Created:', {
        id: alert.id,
        type: alert.type,
        severity: alert.severity,
        message: alert.message
      });

      return {
        success: true,
        alert
      };
    } catch (error) {
      console.error('❌ Error creating price alert:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Send email notification
  async sendEmailNotification(alert) {
    if (!this.emailTransporter) {
      console.warn('⚠️ Email transporter not available');
      return;
    }

    try {
      const subject = `Price Alert: ${alert.type.replace('_', ' ')}`;
      const html = this.generateEmailTemplate(alert);

      await this.emailTransporter.sendMail({
        from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
        to: process.env.ALERT_EMAIL || process.env.EMAIL_USER,
        subject,
        html
      });

      console.log('📧 Email notification sent for alert:', alert.id);
    } catch (error) {
      console.error('❌ Error sending email notification:', error);
    }
  }

  // Generate email template
  generateEmailTemplate(alert) {
    const { metadata } = alert;
    const competitor = metadata.competitor || {};
    const userProduct = metadata.userProduct || {};

    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Price Alert Notification</h2>
        
        <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 15px 0;">
          <h3 style="margin: 0 0 10px 0; color: ${alert.severity === 'HIGH' ? '#d32f2f' : alert.severity === 'MEDIUM' ? '#f57c00' : '#388e3c'};">
            ${alert.type.replace('_', ' ').toUpperCase()}
          </h3>
          <p style="margin: 5px 0;"><strong>Message:</strong> ${alert.message}</p>
          <p style="margin: 5px 0;"><strong>Severity:</strong> ${alert.severity}</p>
          <p style="margin: 5px 0;"><strong>Time:</strong> ${alert.createdAt.toLocaleString()}</p>
        </div>

        ${competitor.title ? `
        <div style="background: #fff; border: 1px solid #ddd; padding: 15px; border-radius: 5px; margin: 15px 0;">
          <h4 style="margin: 0 0 10px 0;">Competitor Product</h4>
          <p style="margin: 5px 0;"><strong>Title:</strong> ${competitor.title}</p>
          <p style="margin: 5px 0;"><strong>Current Price:</strong> $${competitor.currentPrice}</p>
          <p style="margin: 5px 0;"><strong>URL:</strong> <a href="${competitor.url}">${competitor.url}</a></p>
        </div>
        ` : ''}

        ${userProduct.title ? `
        <div style="background: #fff; border: 1px solid #ddd; padding: 15px; border-radius: 5px; margin: 15px 0;">
          <h4 style="margin: 0 0 10px 0;">Your Product</h4>
          <p style="margin: 5px 0;"><strong>Title:</strong> ${userProduct.title}</p>
          <p style="margin: 5px 0;"><strong>Your Price:</strong> $${userProduct.price}</p>
        </div>
        ` : ''}

        <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #ddd; color: #666; font-size: 12px;">
          <p>This is an automated price monitoring alert from your scraping application.</p>
        </div>
      </div>
    `;
  }

  // Send webhook notification
  async sendWebhookNotification(alert) {
    const webhookUrl = process.env.ALERT_WEBHOOK_URL;
    if (!webhookUrl) {
      console.warn('⚠️ Webhook URL not configured');
      return;
    }

    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          alert,
          timestamp: new Date().toISOString(),
          source: 'price-monitoring-system'
        })
      });

      if (response.ok) {
        console.log('🔗 Webhook notification sent for alert:', alert.id);
      } else {
        console.error('❌ Webhook notification failed:', response.status, response.statusText);
      }
    } catch (error) {
      console.error('❌ Error sending webhook notification:', error);
    }
  }

  // Get price alerts with filtering
  async getPriceAlerts(filters = {}) {
    try {
      const {
        type,
        severity,
        isRead,
        competitorProductId,
        userProductId,
        limit = 50,
        offset = 0
      } = filters;

      // For now, return mock data since PriceAlert table doesn't exist yet
      // In a full implementation, this would query the database
      
      console.log('📋 Getting price alerts with filters:', filters);
      
      return {
        success: true,
        alerts: [],
        pagination: {
          total: 0,
          limit,
          offset,
          hasMore: false
        }
      };
    } catch (error) {
      console.error('❌ Error getting price alerts:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Mark alert as read
  async markAlertAsRead(alertId) {
    try {
      // TODO: Implement when PriceAlert table exists
      console.log('✅ Marked alert as read:', alertId);
      
      return {
        success: true,
        message: 'Alert marked as read'
      };
    } catch (error) {
      console.error('❌ Error marking alert as read:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Get price comparison dashboard data
  async getDashboardData() {
    try {
      const now = new Date();
      const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      // Get recent price changes
      const recentPriceChanges = await this.prisma.priceHistory.count({
        where: {
          recordedAt: { gte: last24Hours }
        }
      });

      // Get significant price changes
      const significantChanges = await this.prisma.priceHistory.count({
        where: {
          recordedAt: { gte: last24Hours },
          OR: [
            { priceChangePercent: { gte: 5 } },
            { priceChangePercent: { lte: -5 } }
          ]
        }
      });

      // Get total products being monitored
      const totalProducts = await this.prisma.competitorProduct.count();

      // Get active product mappings (approved status)
      const activeMappings = await this.prisma.productMapping.count({
        where: { 
          status: 'approved',
          priceMonitoringEnabled: true 
        }
      });

      // Get recent price trends
      const priceTrends = await this.prisma.priceHistory.findMany({
        where: {
          recordedAt: { gte: last7Days }
        },
        select: {
          price: true,
          priceChangePercent: true,
          recordedAt: true,
          competitorProduct: {
            select: {
              id: true,
              title: true
            }
          }
        },
        orderBy: { recordedAt: 'desc' },
        take: 100
      });

      return {
        success: true,
        dashboard: {
          summary: {
            totalProducts,
            activeMappings,
            recentPriceChanges,
            significantChanges
          },
          trends: priceTrends,
          lastUpdated: now
        }
      };
    } catch (error) {
      console.error('❌ Error getting dashboard data:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

export default PriceComparisonService;