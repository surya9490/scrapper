import express from "express";
import { Queue } from "bullmq";
import { getRedisClient } from '../utils/redis.js';

const router = express.Router();

// Redis connection
const connection = getRedisClient();

// Create scrape queue
const scrapeQueue = new Queue("scrape-jobs", { 
  connection,
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 50,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
  }
});

// Add URLs to queue
router.post("/", async (req, res) => {
  try {
    const { urls } = req.body;
    
    if (!urls || !Array.isArray(urls)) {
      return res.status(400).json({ 
        error: "Missing or invalid URLs array" 
      });
    }

    if (urls.length === 0) {
      return res.status(400).json({ 
        error: "URLs array cannot be empty" 
      });
    }

    // Validate URLs
    const validUrls = [];
    const invalidUrls = [];

    for (const url of urls) {
      try {
        new URL(url);
        validUrls.push(url);
      } catch (error) {
        invalidUrls.push(url);
      }
    }

    if (invalidUrls.length > 0) {
      console.warn(`Invalid URLs found: ${invalidUrls.join(", ")}`);
    }

    if (validUrls.length === 0) {
      return res.status(400).json({ 
        error: "No valid URLs provided",
        invalidUrls 
      });
    }

    // Add jobs to queue
    const jobs = [];
    await Promise.all(validUrls.map(url => scrapeQueue.add('scrape-job', { url }, { jobId: `scrape-${Date.now()}-${Math.random().toString(36).slice(2,11)}` })));

    
    res.json({ 
      message: `${validUrls.length} jobs added to queue successfully`,
      jobs,
      validUrls: validUrls.length,
      invalidUrls: invalidUrls.length,
      ...(invalidUrls.length > 0 && { invalidUrls })
    });

  } catch (error) {
    console.error("Queue error:", error);
    res.status(500).json({ 
      error: "Failed to add jobs to queue", 
      details: error.message 
    });
  }
});

// Get queue status
router.get("/status", async (req, res) => {
  try {
   const counts = await scrapeQueue.getJobCounts('waiting', 'active', 'completed', 'failed');
    res.json({ status: counts });
  } catch (error) {
    console.error("Queue status error:", error);
    res.status(500).json({ 
      error: "Failed to get queue status", 
      details: error.message 
    });
  }
});

// Get job details
router.get("/job/:jobId", async (req, res) => {
  try {
    const { jobId } = req.params;
    const job = await scrapeQueue.getJob(jobId);
    
    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }

    res.json({
      message: "Job details retrieved successfully",
      job: {
        id: job.id,
        data: job.data,
        progress: job.progress,
        returnvalue: job.returnvalue,
        failedReason: job.failedReason,
        processedOn: job.processedOn,
        finishedOn: job.finishedOn,
        opts: job.opts
      }
    });
  } catch (error) {
    console.error("Job details error:", error);
    res.status(500).json({ 
      error: "Failed to get job details", 
      details: error.message 
    });
  }
});

// Clear completed jobs
router.delete("/completed", async (req, res) => {
  try {
    await scrapeQueue.clean(0, 'completed');
    res.json({ message: "Completed jobs cleared successfully" });
  } catch (error) {
    console.error("Clear completed jobs error:", error);
    res.status(500).json({ 
      error: "Failed to clear completed jobs", 
      details: error.message 
    });
  }
});

// Clear failed jobs
router.delete("/failed", async (req, res) => {
  try {
    await scrapeQueue.clean(0, 'failed');
    res.json({ message: "Failed jobs cleared successfully" });
  } catch (error) {
    console.error("Clear failed jobs error:", error);
    res.status(500).json({ 
      error: "Failed to clear failed jobs", 
      details: error.message 
    });
  }
});

export default router;
export { scrapeQueue };