import stringSimilarity from 'string-similarity';
import AIService from './aiService.js';
import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

class MatchingService {
  constructor() {
    this.aiService = new AIService();
    this.prisma = prisma;
    this.maxRetries = 3;
    this.timeout = 30000; // 30 seconds
  }

  // Main product matching function
  async findProductMatches(userProductId, competitorProducts, options = {}) {
    try {
      // Validate inputs
      if (!userProductId) {
        throw new Error('User product ID is required');
      }
      
      if (!Array.isArray(competitorProducts) || competitorProducts.length === 0) {
        logger.warn('No competitor products provided for matching', { userProductId });
        return [];
      }

      logger.info('Starting product matching', { 
        userProductId, 
        competitorCount: competitorProducts.length,
        threshold: options.threshold || 0.6
      });

      const userProduct = await this.prisma.userProduct.findUnique({
        where: { id: userProductId }
      });

      if (!userProduct) {
        throw new Error(`User product not found: ${userProductId}`);
      }

      const matches = [];
      const errors = [];

      for (const [index, competitorProduct] of competitorProducts.entries()) {
        try {
          if (!competitorProduct || typeof competitorProduct !== 'object') {
            logger.warn('Invalid competitor product', { index, userProductId });
            continue;
          }

          const matchScore = await this.calculateMatchScore(userProduct, competitorProduct, options);
          
          if (matchScore.totalScore >= (options.threshold || 0.6)) {
            matches.push({
              competitorProduct,
              matchScore,
              confidence: this.calculateConfidence(matchScore)
            });
          }
        } catch (error) {
          logger.error('Error matching individual product', { 
            index, 
            userProductId, 
            error: error.message 
          });
          errors.push({ index, error: error.message });
        }
      }

      // Sort by total score descending
      matches.sort((a, b) => b.matchScore.totalScore - a.matchScore.totalScore);

      logger.info('Product matching completed', { 
        userProductId, 
        matchCount: matches.length,
        errorCount: errors.length
      });

      return matches;

    } catch (error) {
      logger.error('Error finding product matches', { 
        userProductId, 
        error: error.message,
        stack: error.stack
      });
      throw new Error(`Product matching failed: ${error.message}`);
    }
  }

  // Calculate comprehensive match score
  async calculateMatchScore(userProduct, competitorProduct, options = {}) {
    try {
      // Validate inputs
      if (!userProduct || !competitorProduct) {
        throw new Error('Both user product and competitor product are required');
      }

      const weights = {
        title: options.titleWeight || 0.4,
        brand: options.brandWeight || 0.2,
        category: options.categoryWeight || 0.15,
        attributes: options.attributesWeight || 0.15,
        embedding: options.embeddingWeight || 0.1
      };

      const scores = {
        titleScore: 0,
        brandScore: 0,
        categoryScore: 0,
        attributesScore: 0,
        embeddingScore: 0
      };

      // 1. Title similarity
      try {
        scores.titleScore = this.calculateTitleSimilarity(
          userProduct.title,
          competitorProduct.title
        );
      } catch (error) {
        logger.warn('Error calculating title similarity', { error: error.message });
        scores.titleScore = 0;
      }

      // 2. Brand similarity
      try {
        scores.brandScore = this.calculateBrandSimilarity(
          userProduct.brand,
          competitorProduct.brand
        );
      } catch (error) {
        logger.warn('Error calculating brand similarity', { error: error.message });
        scores.brandScore = 0;
      }

      // 3. Category similarity
      try {
        scores.categoryScore = this.calculateCategorySimilarity(
          userProduct.category,
          competitorProduct.category
        );
      } catch (error) {
        logger.warn('Error calculating category similarity', { error: error.message });
        scores.categoryScore = 0;
      }

      // 4. Attributes similarity
      try {
        scores.attributesScore = this.calculateAttributesSimilarity(
          userProduct,
          competitorProduct
        );
      } catch (error) {
        logger.warn('Error calculating attributes similarity', { error: error.message });
        scores.attributesScore = 0;
      }

      // 5. Embedding similarity (AI-based)
      try {
        if (options.useEmbedding !== false) {
          scores.embeddingScore = await this.calculateEmbeddingSimilarity(
            userProduct,
            competitorProduct
          );
        }
      } catch (error) {
        logger.warn('Error calculating embedding similarity', { error: error.message });
        scores.embeddingScore = 0;
      }

      // Calculate weighted total score
      const totalScore = (
        scores.titleScore * weights.title +
        scores.brandScore * weights.brand +
        scores.categoryScore * weights.category +
        scores.attributesScore * weights.attributes +
        scores.embeddingScore * weights.embedding
      );

      return {
        totalScore: Math.min(Math.max(totalScore, 0), 1), // Clamp between 0 and 1
        breakdown: this.generateScoreBreakdown(scores, weights),
        scores,
        weights
      };

    } catch (error) {
      logger.error('Error calculating match score', { 
        error: error.message,
        userProductId: userProduct?.id,
        competitorProductId: competitorProduct?.id
      });
      
      // Return a zero score instead of throwing to allow processing to continue
      return {
        totalScore: 0,
        breakdown: {},
        scores: {
          titleScore: 0,
          brandScore: 0,
          categoryScore: 0,
          attributesScore: 0,
          embeddingScore: 0
        },
        weights: options,
        error: error.message
      };
    }
  }

  // Calculate title similarity using multiple methods
  calculateTitleSimilarity(title1, title2) {
    if (!title1 || !title2) return 0;

    const cleanTitle1 = this.cleanTitle(title1);
    const cleanTitle2 = this.cleanTitle(title2);

    // Method 1: String similarity
    const stringSim = stringSimilarity.compareTwoStrings(cleanTitle1, cleanTitle2);

    // Method 2: Jaccard similarity (word overlap)
    const jaccardSim = this.calculateJaccardSimilarity(cleanTitle1, cleanTitle2);

    // Method 3: Longest common subsequence
    const lcsSim = this.calculateLCSSimilarity(cleanTitle1, cleanTitle2);

    // Combine methods with weights
    return (stringSim * 0.5) + (jaccardSim * 0.3) + (lcsSim * 0.2);
  }

  // Clean and normalize titles for comparison
  cleanTitle(title) {
    return title
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ') // Remove special characters
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
  }

  // Calculate Jaccard similarity (word overlap)
  calculateJaccardSimilarity(text1, text2) {
    const words1 = new Set(text1.split(' ').filter(word => word.length > 2));
    const words2 = new Set(text2.split(' ').filter(word => word.length > 2));

    const intersection = new Set([...words1].filter(word => words2.has(word)));
    const union = new Set([...words1, ...words2]);

    return union.size === 0 ? 0 : intersection.size / union.size;
  }

  // Calculate Longest Common Subsequence similarity
  calculateLCSSimilarity(text1, text2) {
    const words1 = text1.split(' ');
    const words2 = text2.split(' ');

    const lcsLength = this.longestCommonSubsequence(words1, words2);
    const maxLength = Math.max(words1.length, words2.length);

    return maxLength === 0 ? 0 : lcsLength / maxLength;
  }

  // Longest Common Subsequence algorithm
  longestCommonSubsequence(arr1, arr2) {
    const m = arr1.length;
    const n = arr2.length;
    const dp = Array(m + 1).fill().map(() => Array(n + 1).fill(0));

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (arr1[i - 1] === arr2[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
      }
    }

    return dp[m][n];
  }

  // Calculate brand similarity
  calculateBrandSimilarity(brand1, brand2) {
    if (!brand1 || !brand2) return 0;

    const cleanBrand1 = brand1.toLowerCase().trim();
    const cleanBrand2 = brand2.toLowerCase().trim();

    // Exact match
    if (cleanBrand1 === cleanBrand2) return 1;

    // Partial match
    return stringSimilarity.compareTwoStrings(cleanBrand1, cleanBrand2);
  }

  // Calculate category similarity
  calculateCategorySimilarity(category1, category2) {
    if (!category1 || !category2) return 0;

    const cleanCat1 = category1.toLowerCase().trim();
    const cleanCat2 = category2.toLowerCase().trim();

    // Exact match
    if (cleanCat1 === cleanCat2) return 1;

    // Check for category hierarchy matches
    const hierarchyScore = this.checkCategoryHierarchy(cleanCat1, cleanCat2);
    if (hierarchyScore > 0) return hierarchyScore;

    // Partial match
    return stringSimilarity.compareTwoStrings(cleanCat1, cleanCat2);
  }

  // Check category hierarchy relationships
  checkCategoryHierarchy(cat1, cat2) {
    const categoryMappings = {
      'clothing': ['apparel', 'fashion', 'wear'],
      'electronics': ['tech', 'gadgets', 'devices'],
      'home': ['house', 'household', 'domestic'],
      'beauty': ['cosmetics', 'skincare', 'makeup'],
      'sports': ['fitness', 'athletic', 'exercise']
    };

    for (const [parent, children] of Object.entries(categoryMappings)) {
      if ((cat1.includes(parent) && children.some(child => cat2.includes(child))) ||
          (cat2.includes(parent) && children.some(child => cat1.includes(child)))) {
        return 0.8; // High similarity for related categories
      }
    }

    return 0;
  }

  // Calculate attributes similarity
  calculateAttributesSimilarity(product1, product2) {
    const attributes = ['material', 'size', 'color', 'design'];
    let totalScore = 0;
    let validAttributes = 0;

    for (const attr of attributes) {
      const val1 = product1[attr];
      const val2 = product2[attr];

      if (val1 && val2) {
        validAttributes++;
        
        if (attr === 'size') {
          totalScore += this.calculateSizeSimilarity(val1, val2);
        } else {
          const similarity = stringSimilarity.compareTwoStrings(
            val1.toLowerCase(),
            val2.toLowerCase()
          );
          totalScore += similarity;
        }
      }
    }

    return validAttributes === 0 ? 0 : totalScore / validAttributes;
  }

  // Calculate size similarity with normalization
  calculateSizeSimilarity(size1, size2) {
    const normalizedSize1 = this.normalizeSize(size1);
    const normalizedSize2 = this.normalizeSize(size2);

    if (normalizedSize1 === normalizedSize2) return 1;

    // Check for size equivalents
    const sizeEquivalents = {
      'xs': ['extra small'],
      's': ['small'],
      'm': ['medium'],
      'l': ['large'],
      'xl': ['extra large'],
      'xxl': ['2xl', 'extra extra large']
    };

    for (const [standard, equivalents] of Object.entries(sizeEquivalents)) {
      if ((normalizedSize1 === standard && equivalents.includes(normalizedSize2)) ||
          (normalizedSize2 === standard && equivalents.includes(normalizedSize1))) {
        return 0.9;
      }
    }

    return stringSimilarity.compareTwoStrings(normalizedSize1, normalizedSize2);
  }

  // Normalize size values
  normalizeSize(size) {
    return size.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Calculate embedding similarity using AI
  async calculateEmbeddingSimilarity(product1, product2) {
    try {
      return await this.aiService.calculateProductSimilarity(product1, product2);
    } catch (error) {
      console.error('Error calculating embedding similarity:', error);
      return 0;
    }
  }

  // Calculate confidence score
  calculateConfidence(matchScore) {
    const { totalScore, titleScore, brandScore, categoryScore } = matchScore;

    let confidence = totalScore * 100;

    // Boost confidence for strong individual scores
    if (titleScore > 0.8) confidence += 5;
    if (brandScore > 0.9) confidence += 10;
    if (categoryScore > 0.9) confidence += 5;

    // Reduce confidence if key scores are low
    if (titleScore < 0.3) confidence -= 10;
    if (brandScore === 0 && categoryScore === 0) confidence -= 15;

    return Math.max(0, Math.min(100, confidence));
  }

  // Generate detailed score breakdown
  generateScoreBreakdown(scores, weights) {
    return {
      title: {
        score: scores.titleScore,
        weight: weights.title,
        contribution: scores.titleScore * weights.title,
        description: 'Product title similarity'
      },
      brand: {
        score: scores.brandScore,
        weight: weights.brand,
        contribution: scores.brandScore * weights.brand,
        description: 'Brand name similarity'
      },
      category: {
        score: scores.categoryScore,
        weight: weights.category,
        contribution: scores.categoryScore * weights.category,
        description: 'Product category similarity'
      },
      attributes: {
        score: scores.attributesScore,
        weight: weights.attributes,
        contribution: scores.attributesScore * weights.attributes,
        description: 'Product attributes similarity'
      },
      embedding: {
        score: scores.embeddingScore,
        weight: weights.embedding,
        contribution: scores.embeddingScore * weights.embedding,
        description: 'AI semantic similarity'
      }
    };
  }

  // Batch process multiple user products
  async batchMatchProducts(userProductIds, competitorProducts, options = {}) {
    const results = [];

    for (const userProductId of userProductIds) {
      try {
        const matches = await this.findProductMatches(userProductId, competitorProducts, options);
        results.push({
          userProductId,
          matches,
          success: true
        });
      } catch (error) {
        results.push({
          userProductId,
          error: error.message,
          success: false
        });
      }
    }

    return results;
  }
}

export default MatchingService;