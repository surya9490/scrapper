import * as cheerio from "cheerio";

/**
 * Extracts product info (title, price, image) from any e-commerce page HTML.
 * Works across Shopify, WooCommerce, Magento, BigCommerce, custom sites, etc.
 */
export function extractProductData(html, url) {
    console.log("HTML content:", html);
    
    // Handle null/undefined HTML
    if (!html || typeof html !== 'string') {
        console.log("⚠️ Invalid HTML provided, returning null product data");
        return { title: null, price: null, image: null };
    }
    
  const $ = cheerio.load(html);
  let product = { title: null, price: null, image: null };

  console.log("Extracting product data from:", url);

  // ---------- 1️⃣ Parse JSON-LD structured data ----------
  $('script[type="application/json"]').each((_, el) => {
    try {
      const jsonText = $(el).html().trim();
      if (!jsonText) return;

      const data = JSON.parse(jsonText);

      // handle single product object or array
      const productNode = Array.isArray(data)
        ? data.find((n) => n["@type"]?.toLowerCase().includes("product"))
        : data["@type"]?.toLowerCase().includes("product")
        ? data
        : null;

      if (productNode) {
        if (productNode.name && !product.title) product.title = productNode.name;
        if (productNode.image && !product.image) {
          product.image = Array.isArray(productNode.image)
            ? productNode.image[0]
            : productNode.image;
        }
        if (productNode.offers?.price && !product.price)
          product.price = parseFloat(productNode.offers.price);
      }
    } catch (_) {
      /* ignore invalid JSON */
    }
  });

  // ---------- 2️⃣ Try Open Graph meta tags ----------
  if (!product.title)
    product.title = $('meta[property="og:title"]').attr("content");
  if (!product.image)
    product.image = $('meta[property="og:image"]').attr("content");
  if (!product.price)
    product.price = parseFloat(
      $('meta[property="product:price:amount"]').attr("content")
    );

  // ---------- 3️⃣ Fallback selectors ----------
  const textFallback = (selectors) => {
    for (const sel of selectors) {
      const txt = $(sel).first().text().trim();
      if (txt) return txt;
    }
    return null;
  };

  const attrFallback = (selectors, attr) => {
    for (const sel of selectors) {
      const val = $(sel).first().attr(attr);
      if (val) return val;
    }
    return null;
  };

  if (!product.title)
    product.title =
      textFallback([
        "h1",
        '[data-testid*="title"]',
        ".product-title",
        "[class*='product__title']",
      ]) || $("title").text().trim();

  if (!product.price) {
    const priceText = textFallback([
      "[class*='price']",
      "[data-testid*='price']",
      "[itemprop='price']",
      ".price",
      ".product-price",
      ".amount",
      ".sale-price",
    ]);
    if (priceText) {
      const clean = priceText.replace(/[₹$€£,\sA-Za-z]/g, "");
      product.price = parseFloat(clean) || null;
    }
  }

  if (!product.image)
    product.image = attrFallback(
      [
        "img[src*='product']",
        ".product-image img",
        "img[data-src]",
        "img",
      ],
      "src"
    );

  // ---------- 4️⃣ Normalize ----------
  if (product.image && !product.image.startsWith("http")) {
    try {
      const u = new URL(product.image, url);
      product.image = u.href;
    } catch {
      product.image = null;
    }
  }

  product.title = product.title || "Unknown Product";
  product.price = product.price || null;
  product.image = product.image || null;

  return product;
}
