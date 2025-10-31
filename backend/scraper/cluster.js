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
    execute: async (url) => {
      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      });
      
      const page = await context.newPage();
      
      try {
        console.log("🌐 Inside browser task, navigating to:", url);
        
        await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
        
        // Log the final URL after navigation (handles redirects)
        console.log("📍 Final URL after navigation:", page.url());
        
        // Wait for product title elements to ensure page is loaded
        try {
          await page.waitForSelector(".product-title, h1, [data-testid*='title'], .product-name, .pdp-product-name, #productTitle", { timeout: 10000 });
          console.log("✅ Product title element found");
        } catch (error) {
          console.log("⚠️ No product title element found, proceeding anyway:", error.message);
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
        
      } finally {
        await context.close();
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