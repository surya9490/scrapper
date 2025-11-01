import express from "express";
import prisma from "../utils/prisma.js";
import { scrapeQueue } from "./queue.js";
import { z } from "zod";

const router = express.Router();

// Validation schema for scrape request
const scrapeRequestSchema = z.object({
  url: z.string().url("Invalid URL format"),
  priority: z.enum(["low", "normal", "high"]).optional().default("normal"),
  delay: z.number().min(0).optional().default(0)
});

router.post("/", async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Validate request payload
    const validation = scrapeRequestSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ 
        error: "Invalid request payload",
        details: validation.error.errors
      });
    }

    const { url, priority, delay } = validation.data;

    // Check if URL is already being processed or recently scraped by this user
    const existingProduct = await prisma.competitorProduct.findFirst({
      where: { url, userId }
    });

    // If product exists and was scraped recently (within last hour), return existing data
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    if (existingProduct && existingProduct.lastScrapedAt > oneHourAgo) {
      return res.json({
        message: "Product data retrieved from cache",
        data: existingProduct,
        cached: true
      });
    }

    // Add job to queue with userId
    const job = await scrapeQueue.add(
      "scrape-product",
      { url, userId },
      {
        priority: priority === "high" ? 10 : priority === "normal" ? 5 : 1,
        delay: delay * 1000, // Convert to milliseconds
        removeOnComplete: 100,
        removeOnFail: 50,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      }
    );

    res.json({
      message: "Scraping job queued successfully",
      jobId: job.id,
      url: url,
      estimatedWaitTime: await getEstimatedWaitTime()
    });

  } catch (error) {
    console.error("Queue error:", error);
    res.status(500).json({
      error: "Failed to queue scraping job",
      details: error.message
    });
  }
});

// Helper function to estimate wait time based on queue length
async function getEstimatedWaitTime() {
  try {
    const waiting = await scrapeQueue.getWaiting();
    const active = await scrapeQueue.getActive();
    
    // Estimate 30 seconds per job on average
    const estimatedSeconds = (waiting.length + active.length) * 30;
    return `${Math.ceil(estimatedSeconds / 60)} minutes`;
  } catch (error) {
    return "Unknown";
  }
}

// Get all scraped products
router.get("/", async (req, res) => {
  try {
    const userId = req.user.id;
    
    const products = await prisma.competitorProduct.findMany({
      where: { userId },
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
    const userId = req.user.id;
    const { id } = req.params;
    
    const product = await prisma.competitorProduct.findUnique({
      where: { id: parseInt(id), userId }
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