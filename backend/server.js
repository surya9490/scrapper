import express from "express";
import cors from "cors";
import helmet from 'helmet';
import dotenv from "dotenv";
import { createRequire } from 'module';
import scrapeRouter from "./routes/scrape.js";
import queueRouter from "./routes/queue.js";
import { schedulePriceJob } from "./jobs/priceChecker.js";
import logger from "./utils/logger.js";
import { disconnectPrisma } from './utils/prisma.js';
import { initializeRedis, disconnectRedis, getRedisClient } from './utils/redis.js';
import { closeCluster } from './scraper/cluster.js';
import { getConfig, logConfigurationStatus } from './utils/config.js';

// Import new routes
import uploadRouter from './routes/upload.js';
import dashboardRouter from './routes/dashboard.js';
import priceMonitoringRouter from './routes/priceMonitoring.js';
import shopifyRouter from './routes/shopify.js';
import cronJobsRouter from './routes/cronJobs.js';
import authRouter from './routes/auth.js';

// Import auth middleware
import { devAutoAuth, authenticateToken } from './middleware/auth.js';
import { 
  globalUserLimiter, 
  dashboardUserLimiter, 
  scrapingUserLimiter, 
  uploadUserLimiter,
  loadUserRateLimits 
} from './middleware/rateLimiter.js';

// Create require function for CommonJS modules
const require = createRequire(import.meta.url);

dotenv.config();

// Validate environment configuration before starting
const configValidation = logConfigurationStatus();
if (!configValidation.success) {
  logger.error('Server startup failed due to configuration errors', {
    missingVariables: configValidation.missing,
    formatErrors: configValidation.formatErrors
  });
  process.exit(1);
}

const config = getConfig();
const app = express();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: config.helmetCspEnabled ? {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  } : false,
}));

// --- Helper: Internal bypass ---
function isInternalRequest(req) {
  const bypassKey = process.env.RATE_LIMIT_BYPASS_KEY;
  if (!bypassKey) return false;
  return req.headers["x-internal-api-key"] === bypassKey;
}

logger.info('Rate limit config', {
  windowMs: config.rateLimitWindow,
  max: config.rateLimitMax,
  dashboardMax: Number(process.env.DASHBOARD_RATE_LIMIT_MAX || 600),
  userSpecific: true
});

// Apply user-specific rate limiting globally
app.use(globalUserLimiter);

// CORS configuration
app.use(cors({
  origin: config.corsOrigin,
  credentials: true,
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Development auto-authentication (bypasses login, uses admin user)
if (config.nodeEnv === 'development') {
  app.use('/api', devAutoAuth);
  logger.info('Development mode: Auto-authentication enabled for admin user');
}

// Load user rate limits for authenticated requests
app.use('/api', loadUserRateLimits);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'production',
    redis: getRedisClient().status,
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

// API Routes with user-specific rate limiting
app.use("/api/auth", authRouter);
app.use("/api/scrape", authenticateToken, scrapingUserLimiter, scrapeRouter);
app.use("/api/queue", queueRouter);
app.use("/api/upload", authenticateToken, uploadUserLimiter, uploadRouter);
app.use("/api/dashboard", authenticateToken, dashboardUserLimiter, dashboardRouter);
app.use("/api/price-monitoring", authenticateToken, dashboardUserLimiter, priceMonitoringRouter);
app.use("/api/shopify", shopifyRouter);
app.use("/api/cron-jobs", cronJobsRouter);

// Start server
async function startServer() {
  try {
    // Initialize Redis connection
    await initializeRedis();
    logger.info('Redis initialized successfully');

    // Start scheduled jobs
    schedulePriceJob();

    // Start the server
    const server = app.listen(config.port, () => {
      logger.info('Backend server started successfully', { 
        port: config.port,
        healthCheck: `http://localhost:${config.port}/health`,
        environment: config.nodeEnv,
        corsOrigins: config.corsOrigin,
        type: 'server_start'
      });
    });

    // Graceful shutdown handling
    const gracefulShutdown = async (signal) => {
      logger.info(`Received ${signal}. Starting graceful shutdown...`);
      
      server.close(async () => {
        logger.info('HTTP server closed');
        
        try {
          // Close browser cluster
          await closeCluster();
          logger.info('Browser cluster closed');
          
          // Close database connection
          await disconnectPrisma();
          logger.info('Prisma disconnected');
          
          // Close Redis connection
          await disconnectRedis();
          logger.info('Redis disconnected');

          logger.info('Graceful shutdown completed');
          process.exit(0);
        } catch (error) {
          logger.error('Error during graceful shutdown', { error: error.message });
          process.exit(1);
        }
      });
    };

    // Handle shutdown signals
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  } catch (error) {
    logger.error('Failed to start server', { error: error.message, stack: error.stack });
    process.exit(1);
  }
}

startServer();