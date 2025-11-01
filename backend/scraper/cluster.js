import { chromium } from "playwright";

let browser;

export async function getCluster() {
  if (!browser) {
    try {
      // Allow headless mode to be controlled via environment variable for debugging
      const headlessMode = process.env.HEADLESS !== 'false';
      
      browser = await chromium.launch({
        headless: headlessMode,
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
          '--disable-features=VizDisplayCompositor'
        ]
      });

      console.log("🧭 Playwright Browser started successfully");
      console.log(`👁️ Headless mode: ${headlessMode}`);
      
    } catch (error) {
      console.error("❌ Failed to start Playwright browser:", error);
      throw error;
    }
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
        console.log(`🌐 Inside browser task, navigating to: ${url} (attempt ${retryCount + 1}/${maxRetries + 1})`);
        
        // Determine timeout based on domain and retry count
        const isAmazon = url.includes('amazon');
        let timeout = isAmazon ? 60000 : 30000; // 60s for Amazon, 30s for others
        
        // Increase timeout on retries
        if (retryCount > 0) {
          timeout = timeout + (retryCount * 30000); // Add 30s per retry
        }
        
        const waitStrategy = isAmazon ? "domcontentloaded" : "networkidle";
        
        console.log(`⏱️ Using ${timeout/1000}s timeout and '${waitStrategy}' strategy for ${isAmazon ? 'Amazon' : 'general'} site`);
        
        await page.goto(url, { waitUntil: waitStrategy, timeout });
        
        // Log the final URL after navigation (handles redirects)
        console.log("📍 Final URL after navigation:", page.url());
        
        // Amazon-specific handling
        if (isAmazon) {
          console.log("🛒 Detected Amazon page, applying specific handling...");
          
          // Wait for Amazon's main content to load
          try {
            await page.waitForSelector("#productTitle, .product-title, [data-testid*='title']", { timeout: 15000 });
            console.log("✅ Amazon product title found");
          } catch (error) {
            console.log("⚠️ Amazon product title not found, trying alternative selectors...");
            
            // Try waiting for any content indicator
            try {
              await page.waitForSelector("#dp, .s-result-item, .product", { timeout: 10000 });
              console.log("✅ Amazon content area found");
            } catch (fallbackError) {
              console.log("⚠️ No Amazon content indicators found, proceeding anyway");
            }
          }
          
          // Handle Amazon's cookie consent and popups
          try {
            const cookieButton = await page.$('#sp-cc-accept, [data-testid="accept-cookies"], .a-button-primary');
            if (cookieButton) {
              await cookieButton.click();
              console.log("🍪 Clicked Amazon cookie consent");
              await page.waitForTimeout(2000); // Wait for any animations
            }
          } catch (error) {
            console.log("⚠️ No Amazon cookie consent found or error clicking:", error.message);
          }
        } else {
          // Wait for product title elements to ensure page is loaded (non-Amazon)
          try {
            await page.waitForSelector(".product-title, h1, [data-testid*='title'], .product-name, .pdp-product-name", { timeout: 10000 });
            console.log("✅ Product title element found");
          } catch (error) {
            console.log("⚠️ No product title element found, proceeding anyway:", error.message);
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
          console.log("🍪 Cookie modals removed");
        } catch (error) {
          console.log("⚠️ Error removing cookie modals:", error.message);
        }
        
        const pageContent = await page.content();
        
        // Check HTML length before processing
        console.log("📏 HTML content length:", pageContent ? pageContent.length : 0);
        if (!pageContent || pageContent.length < 1000) {
          console.log("⚠️ HTML content seems too short, might indicate loading issues");
        }
        
        console.log("✅ Browser task completed successfully");
        return pageContent;
        
      } catch (error) {
        console.error(`❌ Error during scraping attempt ${retryCount + 1}:`, error.message);
        
        // If it's a timeout error and we haven't exceeded max retries, try again
        if (error.name === 'TimeoutError' && retryCount < maxRetries) {
          console.log(`🔄 Retrying in 5 seconds... (${retryCount + 1}/${maxRetries})`);
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

export async function closeCluster() {
  if (browser) {
    try {
      await browser.close();
      browser = null;
      console.log("🔒 Playwright browser closed successfully");
    } catch (error) {
      console.error("❌ Error closing Playwright browser:", error);
    }
  }
}

// Graceful shutdown handling
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing cluster...');
  await closeCluster();
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, closing cluster...');
  await closeCluster();
});

process.on('exit', async () => {
  await closeCluster();
});