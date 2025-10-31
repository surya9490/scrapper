import { chromium } from 'playwright';
import * as cheerio from 'cheerio';
import AIService from './aiService.js';

class ScrapingService {
  constructor() {
    this.aiService = new AIService();
    this.browser = null;
  }

  async initBrowser() {
    if (!this.browser) {
      this.browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
    }
    return this.browser;
  }

  async closeBrowser() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  // Enhanced product scraping with AI attribute extraction
  async scrapeProduct(url) {
    const browser = await this.initBrowser();
    const page = await browser.newPage();

    try {
      // Set user agent and headers to avoid detection
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
      
      await page.goto(url, { 
        waitUntil: 'networkidle',
        timeout: 30000 
      });

      // Wait for content to load
      await page.waitForTimeout(2000);

      const content = await page.content();
      const $ = cheerio.load(content);

      // Extract basic product information
      const productData = await this.extractProductData($, url);

      // Use AI to extract additional attributes
      const aiAttributes = await this.aiService.extractProductAttributes(
        productData.title,
        productData.description
      );

      // Combine scraped data with AI-extracted attributes
      const enhancedProduct = {
        ...productData,
        ...aiAttributes,
        scrapedAt: new Date(),
        sourceUrl: url
      };

      return enhancedProduct;

    } catch (error) {
      console.error(`Error scraping ${url}:`, error);
      throw error;
    } finally {
      await page.close();
    }
  }

  // Extract product data using multiple selectors
  extractProductData($, url) {
    const selectors = {
      title: [
        'h1[data-testid="product-title"]',
        'h1.product-title',
        'h1.pdp-product-name',
        '.product-name h1',
        '.product-title',
        'h1[class*="title"]',
        'h1[class*="name"]',
        'h1',
        '.title',
        '[data-cy="product-name"]'
      ],
      price: [
        '[data-testid="price"]',
        '.price-current',
        '.current-price',
        '.price .current',
        '.product-price',
        '.price-box .price',
        '[class*="price"][class*="current"]',
        '.price',
        '[data-cy="price"]'
      ],
      image: [
        '[data-testid="product-image"] img',
        '.product-image img',
        '.product-photo img',
        '.main-image img',
        '.hero-image img',
        '.product-gallery img:first',
        'img[class*="product"]'
      ],
      description: [
        '[data-testid="product-description"]',
        '.product-description',
        '.product-details',
        '.description',
        '.product-info',
        '[class*="description"]'
      ]
    };

    const extractText = (selectorArray) => {
      for (const selector of selectorArray) {
        const element = $(selector).first();
        if (element.length) {
          return element.text().trim();
        }
      }
      return null;
    };

    const extractAttribute = (selectorArray, attribute = 'src') => {
      for (const selector of selectorArray) {
        const element = $(selector).first();
        if (element.length) {
          return element.attr(attribute);
        }
      }
      return null;
    };

    // Extract price and clean it
    const priceText = extractText(selectors.price);
    const price = priceText ? this.parsePrice(priceText) : null;

    // Extract image URL
    let imageUrl = extractAttribute(selectors.image);
    if (imageUrl && !imageUrl.startsWith('http')) {
      const baseUrl = new URL(url).origin;
      imageUrl = new URL(imageUrl, baseUrl).href;
    }

    return {
      title: extractText(selectors.title),
      price: price,
      image: imageUrl,
      description: extractText(selectors.description),
      availability: this.checkAvailability($),
      rating: this.extractRating($),
      reviewCount: this.extractReviewCount($)
    };
  }

  // Parse price from text
  parsePrice(priceText) {
    if (!priceText) return null;
    
    // Remove currency symbols and extract number
    const cleanPrice = priceText.replace(/[^\d.,]/g, '');
    const price = parseFloat(cleanPrice.replace(',', ''));
    
    return isNaN(price) ? null : price;
  }

  // Check product availability
  checkAvailability($) {
    const availabilitySelectors = [
      '.availability',
      '.stock-status',
      '[data-testid="availability"]',
      '.in-stock',
      '.out-of-stock'
    ];

    for (const selector of availabilitySelectors) {
      const element = $(selector);
      if (element.length) {
        const text = element.text().toLowerCase();
        if (text.includes('in stock') || text.includes('available')) {
          return 'IN_STOCK';
        } else if (text.includes('out of stock') || text.includes('unavailable')) {
          return 'OUT_OF_STOCK';
        }
      }
    }

    return 'UNKNOWN';
  }

  // Extract product rating
  extractRating($) {
    const ratingSelectors = [
      '[data-testid="rating"]',
      '.rating',
      '.stars',
      '.review-rating'
    ];

    for (const selector of ratingSelectors) {
      const element = $(selector);
      if (element.length) {
        const ratingText = element.text() || element.attr('aria-label') || '';
        const rating = parseFloat(ratingText.match(/[\d.]+/)?.[0]);
        if (!isNaN(rating)) {
          return rating;
        }
      }
    }

    return null;
  }

  // Extract review count
  extractReviewCount($) {
    const reviewSelectors = [
      '[data-testid="review-count"]',
      '.review-count',
      '.reviews-count',
      '.rating-count'
    ];

    for (const selector of reviewSelectors) {
      const element = $(selector);
      if (element.length) {
        const reviewText = element.text();
        const count = parseInt(reviewText.match(/\d+/)?.[0]);
        if (!isNaN(count)) {
          return count;
        }
      }
    }

    return null;
  }

  // Search for products on competitor sites
  async searchCompetitorSite(domain, searchKeywords) {
    const browser = await this.initBrowser();
    const page = await browser.newPage();

    try {
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

      // Common search URL patterns
      const searchUrls = {
        'amazon.com': `https://www.amazon.com/s?k=${encodeURIComponent(searchKeywords.join(' '))}`,
        'ebay.com': `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(searchKeywords.join(' '))}`,
        'walmart.com': `https://www.walmart.com/search?q=${encodeURIComponent(searchKeywords.join(' '))}`,
        'target.com': `https://www.target.com/s?searchTerm=${encodeURIComponent(searchKeywords.join(' '))}`
      };

      const searchUrl = searchUrls[domain] || `https://${domain}/search?q=${encodeURIComponent(searchKeywords.join(' '))}`;

      await page.goto(searchUrl, { 
        waitUntil: 'networkidle',
        timeout: 30000 
      });

      await page.waitForTimeout(3000);

      const content = await page.content();
      const $ = cheerio.load(content);

      // Extract product links from search results
      const productLinks = this.extractProductLinks($, domain);

      return productLinks.slice(0, 10); // Return top 10 results

    } catch (error) {
      console.error(`Error searching ${domain}:`, error);
      return [];
    } finally {
      await page.close();
    }
  }

  // Extract product links from search results
  extractProductLinks($, domain) {
    const linkSelectors = {
      'amazon.com': 'h2 a, .s-link-style a',
      'ebay.com': '.s-item__link',
      'walmart.com': '[data-testid="product-title"] a',
      'target.com': '[data-test="product-title"] a',
      'default': 'a[href*="/product"], a[href*="/item"], a[href*="/p/"]'
    };

    const selector = linkSelectors[domain] || linkSelectors.default;
    const links = [];

    $(selector).each((i, element) => {
      let href = $(element).attr('href');
      if (href) {
        // Convert relative URLs to absolute
        if (!href.startsWith('http')) {
          href = `https://${domain}${href.startsWith('/') ? '' : '/'}${href}`;
        }
        
        // Extract title if available
        const title = $(element).text().trim() || $(element).attr('title') || '';
        
        links.push({
          url: href,
          title: title
        });
      }
    });

    return links;
  }

  // Batch scrape multiple URLs
  async batchScrapeProducts(urls, concurrency = 3) {
    const results = [];
    const errors = [];

    // Process URLs in batches to avoid overwhelming the target site
    for (let i = 0; i < urls.length; i += concurrency) {
      const batch = urls.slice(i, i + concurrency);
      
      const batchPromises = batch.map(async (url) => {
        try {
          const product = await this.scrapeProduct(url);
          return { url, success: true, data: product };
        } catch (error) {
          return { url, success: false, error: error.message };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      
      batchResults.forEach(result => {
        if (result.success) {
          results.push(result.data);
        } else {
          errors.push(result);
        }
      });

      // Add delay between batches
      if (i + concurrency < urls.length) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    return { results, errors };
  }
}

export default ScrapingService;