import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { createRequire } from 'module';
import scrapeRouter from "./routes/scrape.js";
import queueRouter from "./routes/queue.js";
import { schedulePriceJob } from "./jobs/priceChecker.js";

// Import new routes
import uploadRouter from './routes/upload.js';
import dashboardRouter from './routes/dashboard.js';
import priceMonitoringRouter from './routes/priceMonitoring.js';
import shopifyRouter from './routes/shopify.js';

// Create require function for CommonJS modules
const require = createRequire(import.meta.url);

dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'production',
    features: {
      scraping: true,
      upload: true,
      dashboard: true,
      priceMonitoring: true,
      shopifyIntegration: true,
      aiMatching: true
    }
  });
});

// API Routes
app.use("/api/scrape", scrapeRouter);
app.use("/api/queue", queueRouter);
app.use("/api/upload", uploadRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/price-monitoring", priceMonitoringRouter);
app.use("/api/shopify", shopifyRouter);

// Start scheduled jobs
schedulePriceJob();

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`✅ Backend server running on port ${PORT}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  process.exit(0);
});