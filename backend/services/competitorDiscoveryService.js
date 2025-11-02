import axios from 'axios';
import * as cheerio from 'cheerio';
import AIService from './aiService.js';
import { URL } from 'url';

const aiService = new AIService();

class CompetitorDiscoveryService {
  constructor() {
    this.searchEngines = {
      google: {
        url: 'https://www.google.com/search',
        params: { q: '', num: 10 },
        selectors: {
          results: 'div.g',
          title: 'h3',
          link: 'a[href]',
          snippet: '.VwiC3b'
        }
      },
      bing: {
        url: 'https://www.bing.com/search',
        params: { q: '', count: 10 },
        selectors: {
          results: '.b_algo',
          title: 'h2 a',
          link: 'h2 a[href]',
          snippet: '.b_caption p'
        }
      }
    };

    this.commonEcommerceDomains = [
      'amazon.com', 'ebay.com', 'walmart.com', 'target.com', 'bestbuy.com',
      'homedepot.com', 'lowes.com', 'costco.com', 'wayfair.com', 'overstock.com',
      'etsy.com', 'shopify.com', 'bigcommerce.com', 'woocommerce.com'
    ];

    this.excludedDomains = [
      'google.com', 'bing.com', 'yahoo.com', 'facebook.com', 'twitter.com',
      'instagram.com', 'youtube.com', 'pinterest.com', 'reddit.com'
    ];

    this.requestConfig = {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      }
    };
  }

  /**
   * Discover competitor URLs for a product
   */
  async discoverCompetitors(userProduct, options = {}) {
    const {
      maxResults = 20,
      searchEngines = ['google'],
      includeKnownDomains = true,
      excludeDomains = []
    } = options;

    try {
      console.log(`Discovering competitors for product: ${userProduct.title}`);
      
      // Generate search queries
      const searchQueries = await aiService.generateSearchKeywords(userProduct);
      console.log(`Generated ${searchQueries.length} search queries`);

      const allResults = [];
      const seenUrls = new Set();

      // Search using different engines and queries
      for (const engine of searchEngines) {
        for (const query of searchQueries.slice(0, 3)) { // Limit queries to avoid rate limiting
          try {
            const results = await this.searchProducts(query, engine, maxResults / searchQueries.length);
            
            for (const result of results) {
              if (!seenUrls.has(result.url) && this.isValidCompetitorUrl(result.url, excludeDomains)) {
                seenUrls.add(result.url);
                allResults.push({
                  ...result,
                  searchQuery: query,
                  searchEngine: engine
                });
              }
            }
          } catch (error) {
            console.error(`Error searching with ${engine} for "${query}":`, error.message);
          }
        }
      }

      console.log(`Found ${allResults.length} potential competitor URLs`);

      // Score and filter results
      const scoredResults = await this.scoreCompetitorCandidates(userProduct, allResults);
      
      // Return top results
      return scoredResults
        .sort((a, b) => b.relevanceScore - a.relevanceScore)
        .slice(0, maxResults);

    } catch (error) {
      console.error('Error discovering competitors:', error.message);
      throw error;
    }
  }

  /**
   * Search for products using a search engine
   */
  async searchProducts(query, engineName = 'google', maxResults = 10) {
    try {
      const engine = this.searchEngines[engineName];
      if (!engine) {
        throw new Error(`Unknown search engine: ${engineName}`);
      }

      const searchUrl = new URL(engine.url);
      const params = { ...engine.params, q: query, num: maxResults, count: maxResults };
      
      Object.entries(params).forEach(([key, value]) => {
        searchUrl.searchParams.set(key, value);
      });

      console.log(`Searching ${engineName} for: "${query}"`);
      
      const response = await axios.get(searchUrl.toString(), this.requestConfig);
      const $ = cheerio.load(response.data);

      const results = [];
      
      $(engine.selectors.results).each((index, element) => {
        try {
          const $element = $(element);
          const title = $element.find(engine.selectors.title).text().trim();
          const linkElement = $element.find(engine.selectors.link).first();
          const href = linkElement.attr('href');
          const snippet = $element.find(engine.selectors.snippet).text().trim();

          if (title && href) {
            let url = href;
            
            // Handle Google's redirect URLs
            if (href.startsWith('/url?q=')) {
              const urlParams = new URLSearchParams(href.substring(6));
              url = urlParams.get('q') || href;
            }

            // Validate URL
            try {
              new URL(url);
              results.push({
                title,
                url,
                snippet,
                source: engineName
              });
            } catch (urlError) {
              console.log(`Invalid URL found: ${url}`);
            }
          }
        } catch (elementError) {
          console.log('Error parsing search result element:', elementError.message);
        }
      });

      console.log(`Found ${results.length} results from ${engineName}`);
      return results;

    } catch (error) {
      console.error(`Error searching ${engineName}:`, error.message);
      return [];
    }
  }

  /**
   * Check if URL is a valid competitor URL
   */
  isValidCompetitorUrl(url, excludeDomains = []) {
    try {
      const urlObj = new URL(url);
      const domain = urlObj.hostname.toLowerCase().replace('www.', '');

      // Exclude specified domains
      if (excludeDomains.some(excluded => domain.includes(excluded.toLowerCase()))) {
        return false;
      }

      // Exclude common non-ecommerce domains
      if (this.excludedDomains.some(excluded => domain.includes(excluded))) {
        return false;
      }

      // Must be HTTP/HTTPS
      if (!['http:', 'https:'].includes(urlObj.protocol)) {
        return false;
      }

      // Exclude file extensions that are not product pages
      const pathname = urlObj.pathname.toLowerCase();
      const excludedExtensions = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.zip', '.rar'];
      if (excludedExtensions.some(ext => pathname.endsWith(ext))) {
        return false;
      }

      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Score competitor candidates based on relevance
   */
  async scoreCompetitorCandidates(userProduct, candidates) {
    const scoredCandidates = [];

    for (const candidate of candidates) {
      try {
        let relevanceScore = 0;

        // Title similarity
        const titleSimilarity = this.calculateTextSimilarity(
          userProduct.title, 
          candidate.title
        );
        relevanceScore += titleSimilarity * 0.4;

        // Snippet similarity (if available)
        if (candidate.snippet) {
          const snippetSimilarity = this.calculateTextSimilarity(
            userProduct.title, 
            candidate.snippet
          );
          relevanceScore += snippetSimilarity * 0.2;
        }

        // Domain reputation (known e-commerce sites get higher scores)
        const domain = new URL(candidate.url).hostname.toLowerCase().replace('www.', '');
        const isDomainKnown = this.commonEcommerceDomains.some(known => 
          domain.includes(known) || known.includes(domain)
        );
        if (isDomainKnown) {
          relevanceScore += 0.2;
        }

        // URL structure (product-like URLs get higher scores)
        const urlScore = this.scoreUrlStructure(candidate.url, userProduct);
        relevanceScore += urlScore * 0.2;

        scoredCandidates.push({
          ...candidate,
          relevanceScore,
          titleSimilarity,
          domain,
          isDomainKnown
        });

      } catch (error) {
        console.error(`Error scoring candidate ${candidate.url}:`, error.message);
      }
    }

    return scoredCandidates;
  }

  /**
   * Score URL structure for product relevance
   */
  scoreUrlStructure(url, userProduct) {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname.toLowerCase();
      const searchParams = urlObj.searchParams;
      
      let score = 0;

      // Product-like path indicators
      const productIndicators = [
        'product', 'item', 'p/', '/p/', 'products', 'shop', 'buy', 'store'
      ];
      
      if (productIndicators.some(indicator => pathname.includes(indicator))) {
        score += 0.3;
      }

      // Brand in URL
      if (userProduct.brand && pathname.includes(userProduct.brand.toLowerCase())) {
        score += 0.2;
      }

      // Category in URL
      if (userProduct.category && pathname.includes(userProduct.category.toLowerCase())) {
        score += 0.1;
      }

      // Avoid non-product pages
      const nonProductIndicators = [
        'blog', 'news', 'about', 'contact', 'help', 'support', 'login', 'register',
        'cart', 'checkout', 'account', 'profile', 'search', 'category', 'categories'
      ];
      
      if (nonProductIndicators.some(indicator => pathname.includes(indicator))) {
        score -= 0.2;
      }

      // Normalize score
      return Math.max(0, Math.min(1, score));

    } catch (error) {
      return 0;
    }
  }

  /**
   * Extract product information from a competitor URL
   */
  async extractProductInfo(url) {
    try {
      console.log(`Extracting product info from: ${url}`);
      
      const response = await axios.get(url, {
        ...this.requestConfig,
        timeout: 15000
      });

      const $ = cheerio.load(response.data);
      
      // Common selectors for product information
      const selectors = {
        title: [
          'h1', '.product-title', '.product-name', '#product-title',
          '[data-testid="product-title"]', '.pdp-product-name'
        ],
        price: [
          '.price', '.product-price', '.current-price', '.sale-price',
          '[data-testid="price"]', '.price-current', '.notranslate'
        ],
        description: [
          '.product-description', '.description', '.product-details',
          '[data-testid="description"]', '.product-info'
        ],
        image: [
          '.product-image img', '.main-image img', '.hero-image img',
          '[data-testid="product-image"] img'
        ],
        brand: [
          '.brand', '.product-brand', '[data-testid="brand"]',
          '.manufacturer', '.brand-name'
        ]
      };

      const extractedData = {
        url,
        title: this.extractTextBySelectors($, selectors.title),
        price: this.extractPriceBySelectors($, selectors.price),
        description: this.extractTextBySelectors($, selectors.description),
        imageUrl: this.extractImageBySelectors($, selectors.image, url),
        brand: this.extractTextBySelectors($, selectors.brand),
        domain: new URL(url).hostname.replace('www.', ''),
        extractedAt: new Date()
      };

      // Clean up extracted data
      if (extractedData.title) {
        extractedData.title = extractedData.title.substring(0, 500).trim();
      }
      
      if (extractedData.description) {
        extractedData.description = extractedData.description.substring(0, 1000).trim();
      }

      return extractedData;

    } catch (error) {
      console.error(`Error extracting product info from ${url}:`, error.message);
      return {
        url,
        error: error.message,
        extractedAt: new Date()
      };
    }
  }

  /**
   * Extract text using multiple selectors
   */
  extractTextBySelectors($, selectors) {
    for (const selector of selectors) {
      const text = $(selector).first().text().trim();
      if (text && text.length > 0) {
        return text;
      }
    }
    return null;
  }

  /**
   * Extract price using multiple selectors
   */
  extractPriceBySelectors($, selectors) {
    for (const selector of selectors) {
      const text = $(selector).first().text().trim();
      if (text) {
        // Extract price from text
        const priceMatch = text.match(/[\$£€¥₹]?[\d,]+\.?\d*/);
        if (priceMatch) {
          const priceStr = priceMatch[0].replace(/[^\d.]/g, '');
          const price = parseFloat(priceStr);
          if (!isNaN(price) && price > 0) {
            return price;
          }
        }
      }
    }
    return null;
  }

  /**
   * Extract image URL using multiple selectors
   */
  extractImageBySelectors($, selectors, baseUrl) {
    for (const selector of selectors) {
      const src = $(selector).first().attr('src') || $(selector).first().attr('data-src');
      if (src) {
        try {
          // Handle relative URLs
          if (src.startsWith('//')) {
            return `https:${src}`;
          } else if (src.startsWith('/')) {
            const baseUrlObj = new URL(baseUrl);
            return `${baseUrlObj.protocol}//${baseUrlObj.host}${src}`;
          } else if (src.startsWith('http')) {
            return src;
          }
        } catch (error) {
          console.log('Error processing image URL:', error.message);
        }
      }
    }
    return null;
  }

  /**
   * Batch process competitor discovery for multiple products
   */
  async batchDiscoverCompetitors(userProducts, options = {}) {
    const results = [];
    const { concurrency = 3, delay = 1000 } = options;

    console.log(`Starting batch competitor discovery for ${userProducts.length} products`);

    for (let i = 0; i < userProducts.length; i += concurrency) {
      const batch = userProducts.slice(i, i + concurrency);
      
      const batchPromises = batch.map(async (product) => {
        try {
          const competitors = await this.discoverCompetitors(product, options);
          return {
            userProduct: product,
            competitors,
            success: true
          };
        } catch (error) {
          console.error(`Error discovering competitors for product ${product.id}:`, error.message);
          return {
            userProduct: product,
            competitors: [],
            success: false,
            error: error.message
          };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      // Add delay between batches to avoid rate limiting
      if (i + concurrency < userProducts.length && delay > 0) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    console.log(`Completed batch competitor discovery. Processed ${results.length} products`);
    return results;
  }

  // Simple text similarity calculation using Jaccard similarity
  calculateTextSimilarity(text1, text2) {
    if (!text1 || !text2) return 0;
    
    // Normalize and tokenize
    const normalize = (text) => text.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(word => word.length > 0);
    const tokens1 = new Set(normalize(text1));
    const tokens2 = new Set(normalize(text2));
    
    // Calculate Jaccard similarity
    const intersection = new Set([...tokens1].filter(x => tokens2.has(x)));
    const union = new Set([...tokens1, ...tokens2]);
    
    return union.size === 0 ? 0 : intersection.size / union.size;
  }
}

export default new CompetitorDiscoveryService();