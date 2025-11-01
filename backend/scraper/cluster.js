import { chromium } from "playwright";
import logger from "../utils/logger.js";

let browser;
let isShuttingDown = false;

export async function getCluster() {
  if (!browser && !isShuttingDown) {
    try {
      // Allow headless mode to be controlled via environment variable for debugging
      const headlessMode = process.env.HEADLESS !== 'false';
      
      browser = await chromium.launch({
        headless: headlessMode,
        timeout: 30000, // 30 second timeout for browser launch
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding',
          '--disable-features=TranslateUI',
          '--disable-ipc-flooding-protection',
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor',
          '--memory-pressure-off',
          '--max_old_space_size=4096'
        ]
      });

      logger.info("Playwright Browser started successfully", { 
        headless: headlessMode,
        type: 'browser_start' 
      });
      
    } catch (error) {
      logger.error("Failed to start Playwright browser", { error: error.message });
      throw error;
    }
  }

  if (isShuttingDown) {
    throw new Error('Browser is shutting down');
  }

  return {
    execute: async (url, retryCount = 0) => {
      const maxRetries = 2;
      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
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
      
      const page = await context.newPage();
      
      try {
        logger.info("Navigating to URL", { 
          url, 
          attempt: retryCount + 1, 
          maxAttempts: maxRetries + 1,
          type: 'navigation_start'
        });
        
        // Determine timeout based on domain and retry count
        const isAmazon = url.includes('amazon');
        let timeout = isAmazon ? 60000 : 30000; // 60s for Amazon, 30s for others
        
        // Increase timeout on retries
        if (retryCount > 0) {
          timeout = timeout + (retryCount * 30000); // Add 30s per retry
        }
        
        const waitStrategy = isAmazon ? "domcontentloaded" : "networkidle";
        
        logger.info("Navigation strategy configured", {
          timeout: timeout/1000,
          strategy: waitStrategy,
          siteType: isAmazon ? 'Amazon' : 'general',
          type: 'navigation_config'
        });
        
        await page.goto(url, { waitUntil: waitStrategy, timeout });
        
        // Log the final URL after navigation (handles redirects)
        logger.info("Navigation completed", { 
          finalUrl: page.url(),
          type: 'navigation_complete'
        });
        
        // Amazon-specific handling
        if (isAmazon) {
          logger.info("Amazon page detected, applying specific handling", { type: 'amazon_handling' });
          
          // Wait for Amazon's main content to load
          try {
            await page.waitForSelector("#productTitle, .product-title, [data-testid*='title']", { timeout: 15000 });
            logger.info("Amazon product title found", { type: 'amazon_title_found' });
          } catch (error) {
            logger.warn("Amazon product title not found, trying alternatives", { type: 'amazon_title_fallback' });
            
            // Try waiting for any content indicator
            try {
              await page.waitForSelector("#dp, .s-result-item, .product", { timeout: 10000 });
              logger.info("Amazon content area found", { type: 'amazon_content_found' });
            } catch (fallbackError) {
              logger.warn("No Amazon content indicators found, proceeding anyway", { type: 'amazon_content_missing' });
            }
          }
          
          // Handle Amazon's cookie consent and popups
          try {
            const cookieButton = await page.$('#sp-cc-accept, [data-testid="accept-cookies"], .a-button-primary');
            if (cookieButton) {
              await cookieButton.click();
              logger.info("Amazon cookie consent clicked", { type: 'cookie_consent' });
              await page.waitForTimeout(2000); // Wait for any animations
            }
          } catch (error) {
            logger.warn("Amazon cookie consent handling failed", { 
              error: error.message,
              type: 'cookie_consent_error'
            });
          }
        } else {
          // Wait for product title elements to ensure page is loaded (non-Amazon)
          try {
            await page.waitForSelector(".product-title, h1, [data-testid*='title'], .product-name, .pdp-product-name", { timeout: 10000 });
            logger.info("Product title element found", { type: 'product_title_found' });
          } catch (error) {
            logger.warn("Product title element not found, proceeding anyway", { 
              error: error.message,
              type: 'product_title_missing'
            });
          }
        }
        
        // Remove cookie modals and popups that might block content
        try {
          await page.evaluate(() => {
            // Common cookie modal selectors
            const cookieSelectors = [
              '[id*="cookie"]', '[class*="cookie"]', '[id*="gdpr"]', '[class*="gdpr"]',
              '[id*="consent"]', '[class*="consent"]', '[id*="privacy"]', '[class*="privacy"]',
              '.modal', '.popup', '.overlay', '[role="dialog"]'
            ];
            
            cookieSelectors.forEach(selector => {
              const elements = document.querySelectorAll(selector);
              elements.forEach(el => {
                if (el.style.position === 'fixed' || el.style.position === 'absolute') {
                  el.remove();
                }
              });
            });
          });
          logger.info("Cookie modals removed", { type: 'cookie_modals_removed' });
        } catch (error) {
          logger.warn("Error removing cookie modals", { 
            error: error.message,
            type: 'cookie_modal_error'
          });
        }
        
        const pageContent = await page.content();
        
        // Check HTML length before processing
        const contentLength = pageContent ? pageContent.length : 0;
        logger.info("HTML content retrieved", { 
          contentLength,
          type: 'content_retrieved'
        });
        
        if (!pageContent || pageContent.length < 1000) {
          logger.warn("HTML content seems too short, might indicate loading issues", {
            contentLength,
            type: 'content_warning'
          });
        }
        
        logger.info("Browser task completed successfully", { 
          url,
          contentLength,
          type: 'task_complete'
        });
        return pageContent;
        
      } catch (error) {
        logger.error("Error during scraping attempt", {
          attempt: retryCount + 1,
          error: error.message,
          errorName: error.name,
          url,
          type: 'scraping_error'
        });
        
        // If it's a timeout error and we haven't exceeded max retries, try again
        if (error.name === 'TimeoutError' && retryCount < maxRetries) {
          logger.info("Retrying scraping task", {
            retryAttempt: retryCount + 1,
            maxRetries,
            delaySeconds: 5,
            type: 'retry_attempt'
          });
          await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds before retry
          
          await context.close(); // Close current context
          
          // Get a fresh cluster instance and retry
          const cluster = await getCluster();
          return await cluster.execute(url, retryCount + 1);
        }
        
        // If we've exhausted retries or it's not a timeout error, throw the error
        throw error;
      } finally {
        // Only close context if it hasn't been closed already
        try {
          await context.close();
        } catch (closeError) {
          // Context might already be closed, ignore error
        }
      }
    }
  };
}

// Graceful shutdown function
export async function closeCluster() {
  if (browser && !isShuttingDown) {
    isShuttingDown = true;
    try {
      logger.info('Closing browser cluster...', { type: 'shutdown' });
      await browser.close();
      browser = null;
      logger.info('Browser cluster closed successfully', { type: 'shutdown' });
    } catch (error) {
      logger.error('Error closing browser cluster:', { error: error.message, type: 'shutdown' });
    }
  }
}

// Graceful shutdown handling
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, closing cluster', { type: 'shutdown' });
  await closeCluster();
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, closing cluster', { type: 'shutdown' });
  await closeCluster();
});

process.on('exit', async () => {
  await closeCluster();
});