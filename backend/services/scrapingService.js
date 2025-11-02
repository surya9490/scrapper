import { chromium } from 'playwright';
import * as cheerio from 'cheerio';
import AIService from './aiService.js';
import logger from '../utils/logger.js';
import DomainThrottler from '../utils/domainThrottler.js';
import CircuitBreaker from '../utils/circuitBreaker.js';
import RetryHandler from '../utils/retryHandler.js';
import CacheService from '../utils/cacheService.js';
import ProxyRotation from '../utils/proxyRotation.js';
import BatchJobService from '../utils/batchJobService.js';
import { extractFromSuggestJson, extractProductsFromSearchPage } from '../utils/extractSearch.js';

class ScrapingService {
  constructor() {
    this.aiService = new AIService();
    this.browser = null;
    this.timeout = 30000;

    // Initialize optimization utilities
    this.domainThrottler = new DomainThrottler();
    this.circuitBreaker = new CircuitBreaker();
    this.retryHandler = new RetryHandler();
    this.cacheService = new CacheService();
    this.proxyRotation = new ProxyRotation();
    this.batchJobService = new BatchJobService();
  }

  async initBrowser() {
    if (!this.browser) {
      try {
        // Get proxy configuration
        const proxy = await this.proxyRotation.getNextProxy();

        const launchOptions = {
          headless: true,
          timeout: this.timeout,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu'
          ]
        };

        // Add proxy configuration if available
        if (proxy) {
          launchOptions.proxy = {
            server: `${proxy.protocol}://${proxy.host}:${proxy.port}`,
            username: proxy.username,
            password: proxy.password
          };
          logger.info('Using proxy for browser', { proxyId: proxy.id });
        }

        this.browser = await chromium.launch(launchOptions);
        logger.info('Browser initialized for scraping service');
      } catch (error) {
        logger.error('Failed to initialize browser:', { error: error.message });
        throw new Error(`Browser initialization failed: ${error.message}`);
      }
    }
    return this.browser;
  }

  async closeBrowser() {
    if (this.browser) {
      try {
        await this.browser.close();
        this.browser = null;
        logger.info('Browser closed successfully');
      } catch (error) {
        logger.error('Error closing browser:', { error: error.message });
      }
    }
  }

  // Enhanced product scraping with all optimizations
  async scrapeProduct(url, retryCount = 0) {
    if (!url || typeof url !== 'string') {
      throw new Error('Invalid URL provided for scraping');
    }

    const domain = new URL(url).hostname;
    const cacheKey = this.cacheService.generateKey('product', url);

    // Check cache first
    const cachedProduct = await this.cacheService.get(cacheKey);
    if (cachedProduct) {
      logger.info('Product found in cache', { url });
      return cachedProduct;
    }

    // Check circuit breaker for domain
    if (await this.circuitBreaker.isOpen(domain)) {
      throw new Error(`Circuit breaker is open for domain: ${domain}`);
    }

    // Apply domain throttling
    await this.domainThrottler.throttle(domain);

    // Use retry handler with exponential backoff
    return await this.retryHandler.execute(async () => {
      return await this._performScrape(url, domain, cacheKey);
    });
  }

  async _performScrape(url, domain, cacheKey) {
    const browser = await this.initBrowser();
    let page = null;
    let context = null;
    const proxy = await this.proxyRotation.getNextProxy();

    try {
      // Create browser context with user agent and headers to avoid detection
      context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        viewport: { width: 1920, height: 1080 },
        extraHTTPHeaders: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate',
          'DNT': '1',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
        }
      });

      page = await context.newPage();

      logger.info('Starting product scrape', { url, proxy: proxy?.id });

      await page.goto(url, {
        waitUntil: 'networkidle',
        timeout: this.timeout
      });

      // Wait for content to load
      await page.waitForTimeout(2000);

      const content = await page.content();
      const $ = cheerio.load(content);

      // Extract basic product information
      const productData = await this.extractProductData($, url);

      // Use AI to extract additional attributes
      const aiAttributes = await this.aiService.extractAttributes(
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

      // Cache the result
      await this.cacheService.set(cacheKey, enhancedProduct, 'product');

      // Record success for circuit breaker
      this.circuitBreaker.recordSuccess(domain);

      // Record proxy completion
      if (proxy) {
        await this.proxyRotation.recordCompletion(proxy.id);
      }

      logger.info('Product scrape completed successfully', {
        url,
        hasTitle: !!productData.title,
        hasPrice: !!productData.price
      });

      return enhancedProduct;

    } catch (error) {
      // Record failure for circuit breaker
      this.circuitBreaker.recordFailure(domain);

      // Record proxy failure
      if (proxy) {
        await this.proxyRotation.recordFailure(proxy.id, error.message);
      }

      logger.error('Product scrape failed', {
        url,
        error: error.message
      });

      throw error;
    } finally {
      if (page) {
        try {
          await page.close();
        } catch (error) {
          logger.error('Error closing page:', { error: error.message });
        }
      }
      if (context) {
        try {
          await context.close();
        } catch (error) {
          logger.error('Error closing context:', { error: error.message });
        }
      }
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
  async searchCompetitorSite(urlsOrDomain, keywordOrKeywords) {
    const isArrayInput = Array.isArray(urlsOrDomain);
    const normalizedInput = !isArrayInput && typeof urlsOrDomain === 'string'
      ? (urlsOrDomain.startsWith('http') ? urlsOrDomain : `https://${urlsOrDomain}`)
      : null;
    const maxResults = 20;
    const keyword = Array.isArray(keywordOrKeywords) ? (keywordOrKeywords[0] || '') : (keywordOrKeywords || '');
    const normalizeUrl = (u) => (u && u.startsWith('http')) ? u : (u ? `https://${u}` : u);
    const browser = await this.initBrowser();
    let context = null;
    let page = null;
    const results = [];

    try {
      // Create browser context with user agent
      context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        viewport: { width: 1920, height: 1080 }
      });

      page = await context.newPage();

      // Build candidate URLs from input (array of URLs or domain)
      let candidates = [];
      if (isArrayInput) {
        candidates = urlsOrDomain.map(normalizeUrl).filter(Boolean);
      } else if (normalizedInput) {
        candidates = [
          `${normalizedInput}/search?q=${encodeURIComponent(keyword)}`,
          `${normalizedInput}/search?type=product&q=${encodeURIComponent(keyword)}`,
          `${normalizedInput}/collections/all?q=${encodeURIComponent(keyword)}`,
          `${normalizedInput}/search/suggest.json?q=${encodeURIComponent(keyword)}`,
          `${normalizedInput}/search/suggest?q=${encodeURIComponent(keyword)}`
        ];
      }

      let searchUrl = null;
      for (const candidate of candidates) {
        if (await page.goto(candidate, {
          waitUntil: 'networkidle',
          timeout: 30000
        })) {
          searchUrl = candidate;
          break;
        }
      }

      if (!searchUrl) {
        logger.error('No valid search URL found for input');
        return [];
      }

      for (const url of candidates) {
        const res = await page.goto(url, {
          waitUntil: 'networkidle',
          timeout: 30000
        });
        if (!res || res.status() >= 400) continue;
        const ct = res.headers()['content-type'] || '';
        if (ct.includes('application/json') || page.url().endsWith('.json')) {
          const body = await res.text();
          const json = JSON.parse(body);
          const items = extractFromSuggestJson(json);
          for (const i of items) {
            results.push(i);
            if (results.length >= maxResults) break;
          }
          if (results.length) return results;
        }
        const found = await extractProductsFromSearchPage(page, maxResults - results.length);
        if (found && found.length) {
          results.push(...found);
          if (results.length >= maxResults) return results;
        }

        // 2) Fallback: load homepage and use visible search form (type into input and submit)
        await page.goto(normalizedInput || candidates[0], { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => { });
        // find search input heuristically
        const searchSelectors = [
          'input[type="search"]', 'input[name="q"]', 'input[aria-label*="search"]',
          'input[placeholder*="Search"]', 'form[action*="/search"] input'
        ];
        for (const sel of searchSelectors) {
          if (await page.$(sel)) {
            await page.fill(sel, keyword);
            await Promise.all([
              page.press(sel, 'Enter'),
              
              page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => { })
            ]);
            const found = await extractProductsFromSearchPage(page, maxResults - results.length);
            if (found && found.length) {
              results.push(...found);
              if (results.length >= maxResults) break;
            }
          }
        }
      }




      await page.waitForTimeout(3000);

      const content = await page.content();
      const $ = cheerio.load(content);

      const currentDomain = (() => { try { const u = new URL(page.url()); return u.hostname.replace(/^www\./, ''); } catch { return null; } })();

      // Extract product links from search results
      const productLinks = currentDomain ? this.extractProductLinks($, currentDomain) : [];

      return productLinks.slice(0, 10); // Return top 10 results

    } catch (error) {
      console.error('Error searching competitor sites:', error);
      return [];
    } finally {
      if (page) {
        try {
          await page.close();
        } catch (error) {
          logger.error('Error closing page:', { error: error.message });
        }
      }
      if (context) {
        try {
          await context.close();
        } catch (error) {
          logger.error('Error closing context:', { error: error.message });
        }
      }
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
  // Enhanced batch scraping with optimization utilities
  async batchScrapeProducts(urls, options = {}) {
    const {
      concurrency = 3,
      useBatching = true,
      priority = 'normal'
    } = options;

    if (useBatching) {
      // Use batch job service for efficient processing
      const batchId = await this.batchJobService.addJobsToBatch(
        urls.map(url => ({
          url,
          type: 'scrape-product',
          priority: priority === 'high' ? 1 : priority === 'low' ? 3 : 2
        }))
      );

      logger.info('Batch scraping job created', { batchId, urlCount: urls.length });
      return { batchId, status: 'queued' };
    }

    // Fallback to direct processing
    const results = [];
    const errors = [];

    // Group URLs by domain for better throttling
    const domainGroups = {};
    urls.forEach(url => {
      const domain = new URL(url).hostname;
      if (!domainGroups[domain]) {
        domainGroups[domain] = [];
      }
      domainGroups[domain].push(url);
    });

    // Process each domain group separately
    for (const [domain, domainUrls] of Object.entries(domainGroups)) {
      logger.info('Processing domain batch', { domain, urlCount: domainUrls.length });

      // Process URLs in batches to avoid overwhelming the target site
      for (let i = 0; i < domainUrls.length; i += concurrency) {
        const batch = domainUrls.slice(i, i + concurrency);

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

        // Add delay between batches for the same domain
        if (i + concurrency < domainUrls.length) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      // Add delay between different domains
      const domainKeys = Object.keys(domainGroups);
      const currentIndex = domainKeys.indexOf(domain);
      if (currentIndex < domainKeys.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    return { results, errors };
  }

  // Get batch job status
  async getBatchStatus(batchId) {
    return await this.batchJobService.getBatchStatus(batchId);
  }

  // Process immediate batch (for high priority jobs)
  async processImmediateBatch(urls, priority = 'high') {
    return await this.batchJobService.processImmediate(
      urls.map(url => ({
        url,
        type: 'scrape-product',
        priority: 1
      }))
    );
  }
}

export default ScrapingService;