import express from "express";
import { getCluster } from "../scraper/cluster.js";
import { PrismaClient } from "@prisma/client";
import { extractProductData } from "../utils/extractProductData.js";

const prisma = new PrismaClient();
const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: "Missing URL" });

    // Add debugger statement for testing
    debugger;
    console.log("🔍 DEBUG: Starting scrape for URL:", url);

    const cluster = await getCluster();
    let productData = null;

    console.log("🚀 Starting cluster task for URL:", url);
    let html = null;
    
    try {
      // Use cluster.execute with URL as parameter
      html = await cluster.execute(url);
      
      console.log("🎯 Cluster task finished, HTML length:", html ? html.length : 'null');
    } catch (error) {
      console.error("❌ Cluster task error:", error.message);
      throw error;
    }

    productData = extractProductData(html, url);

    console.log("Extracted product data:", productData);
    
    // Check if product data was found
    if (!productData || (productData.title === null && productData.price === null && productData.image === null)) {
      return res.json({
        message: "Product data not found",
        data: null
      });
    }

    // Extract domain from URL for competitorDomain field
    const urlObj = new URL(url);
    const competitorDomain = urlObj.hostname;

    // Save to database
    const savedProduct = await prisma.competitorProduct.upsert({
      where: { url },
      update: {
        ...productData,
        lastScrapedAt: new Date()
      },
      create: {
        url,
        ...productData,
        competitorDomain,
        competitorName: competitorDomain,
        lastScrapedAt: new Date()
      },
    });

    console.log(`✅ Successfully scraped: ${productData.title}`);

    res.json({
      message: "Product scraped successfully",
      data: savedProduct
    });

  } catch (error) {
    console.error("Scraping error:", error);
    res.status(500).json({
      error: "Failed to scrape product",
      details: error.message
    });
  }
});

// Get all scraped products
router.get("/", async (req, res) => {
  try {
    const products = await prisma.competitorProduct.findMany({
      orderBy: { updatedAt: 'desc' }
    });

    res.json({
      message: "Products retrieved successfully",
      data: products,
      count: products.length
    });
  } catch (error) {
    console.error("Database error:", error);
    res.status(500).json({
      error: "Failed to retrieve products",
      details: error.message
    });
  }
});

// Get product by ID
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const product = await prisma.competitorProduct.findUnique({
      where: { id: parseInt(id) }
    });

    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    res.json({
      message: "Product retrieved successfully",
      data: product
    });
  } catch (error) {
    console.error("Database error:", error);
    res.status(500).json({
      error: "Failed to retrieve product",
      details: error.message
    });
  }
});

export default router;