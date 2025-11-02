import logger from './logger.js';

// Required environment variables with their descriptions
const REQUIRED_ENV_VARS = {
  NODE_ENV: 'Application environment (development, production, test)',
  PORT: 'Server port number',
  DATABASE_URL: 'PostgreSQL database connection string',
  REDIS_URL: 'Redis connection string for caching and queues',
  JWT_SECRET: 'Secret key for JWT token signing',
  CORS_ORIGIN: 'Allowed CORS origins (comma-separated for multiple)'
};

// Optional environment variables with defaults
const OPTIONAL_ENV_VARS = {
  LOG_LEVEL: 'info',
  REDIS_MAX_RETRIES: '3',
  REDIS_RETRY_DELAY: '1000',
  SCRAPER_TIMEOUT: '30000',
  SCRAPER_MAX_RETRIES: '3',
  RATE_LIMIT_WINDOW: '900000', // 15 minutes
  RATE_LIMIT_MAX: '100',
  HELMET_CSP_ENABLED: 'true'
};

/**
 * Validates all required environment variables are present
 * @returns {Object} Validation result with success status and missing variables
 */
export function validateEnvironment() {
  const missing = [];
  const warnings = [];

  // Check required variables
  for (const [key, description] of Object.entries(REQUIRED_ENV_VARS)) {
    if (!process.env[key]) {
      missing.push({ key, description });
    }
  }

  // AI key validation: require at least one of OPENAI_API_KEY or HUGGINGFACE_API_KEY
  if (!process.env.OPENAI_API_KEY && !process.env.HUGGINGFACE_API_KEY) {
    missing.push({
      key: 'OPENAI_API_KEY | HUGGINGFACE_API_KEY',
      description: 'At least one AI API key is required (OpenAI or HuggingFace)'
    });
  }

  // Check optional variables and set defaults
  for (const [key, defaultValue] of Object.entries(OPTIONAL_ENV_VARS)) {
    if (!process.env[key]) {
      process.env[key] = defaultValue;
      warnings.push(`${key} not set, using default: ${defaultValue}`);
    }
  }

  // Validate specific formats
  const formatValidations = validateFormats();
  
  return {
    success: missing.length === 0 && formatValidations.length === 0,
    missing,
    warnings,
    formatErrors: formatValidations
  };
}

/**
 * Validates the format of environment variables
 * @returns {Array} Array of format validation errors
 */
function validateFormats() {
  const errors = [];

  // Validate PORT is a number
  if (process.env.PORT && isNaN(parseInt(process.env.PORT))) {
    errors.push('PORT must be a valid number');
  }

  // Validate DATABASE_URL format
  if (process.env.DATABASE_URL && !process.env.DATABASE_URL.startsWith('postgresql://')) {
    errors.push('DATABASE_URL must be a valid PostgreSQL connection string');
  }

  // Validate REDIS_URL format
  if (process.env.REDIS_URL && !process.env.REDIS_URL.startsWith('redis://')) {
    errors.push('REDIS_URL must be a valid Redis connection string');
  }

  // Validate numeric environment variables
  const numericVars = ['REDIS_MAX_RETRIES', 'REDIS_RETRY_DELAY', 'SCRAPER_TIMEOUT', 'SCRAPER_MAX_RETRIES', 'RATE_LIMIT_WINDOW', 'RATE_LIMIT_MAX'];
  
  for (const varName of numericVars) {
    if (process.env[varName] && isNaN(parseInt(process.env[varName]))) {
      errors.push(`${varName} must be a valid number`);
    }
  }

  // Validate NODE_ENV
  const validEnvs = ['development', 'production', 'test'];
  if (process.env.NODE_ENV && !validEnvs.includes(process.env.NODE_ENV)) {
    errors.push(`NODE_ENV must be one of: ${validEnvs.join(', ')}`);
  }

  return errors;
}

/**
 * Gets configuration values with proper type conversion
 * @returns {Object} Configuration object with typed values
 */
export function getConfig() {
  return {
    // Server configuration
    nodeEnv: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT) || 3000,
    logLevel: process.env.LOG_LEVEL || 'info',
    
    // Database configuration
    databaseUrl: process.env.DATABASE_URL,
    
    // Redis configuration
    redisUrl: process.env.REDIS_URL,
    redisMaxRetries: parseInt(process.env.REDIS_MAX_RETRIES) || 3,
    redisRetryDelay: parseInt(process.env.REDIS_RETRY_DELAY) || 1000,
    
    // External services
    openaiApiKey: process.env.OPENAI_API_KEY || process.env.HUGGINGFACE_API_KEY,
    huggingfaceApiKey: process.env.HUGGINGFACE_API_KEY,
    jwtSecret: process.env.JWT_SECRET,
    
    // Security configuration
    corsOrigin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',').map(origin => origin.trim()) : ['http://localhost:3000'],
    rateLimitWindow: parseInt(process.env.RATE_LIMIT_WINDOW) || 900000,
    rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX) || 100,
    helmetCspEnabled: process.env.HELMET_CSP_ENABLED === 'true',
    
    // Scraper configuration
    scraperTimeout: parseInt(process.env.SCRAPER_TIMEOUT) || 30000,
    scraperMaxRetries: parseInt(process.env.SCRAPER_MAX_RETRIES) || 3,
    
    // Feature flags
    isDevelopment: process.env.NODE_ENV === 'development',
    isProduction: process.env.NODE_ENV === 'production',
    isTest: process.env.NODE_ENV === 'test'
  };
}

/**
 * Logs configuration status and warnings
 */
export function logConfigurationStatus() {
  const validation = validateEnvironment();
  const config = getConfig();

  if (validation.success) {
    logger.info('Environment configuration validated successfully', {
      nodeEnv: config.nodeEnv,
      port: config.port,
      redisConfigured: !!config.redisUrl,
      databaseConfigured: !!config.databaseUrl,
      openaiConfigured: !!process.env.OPENAI_API_KEY,
      huggingfaceConfigured: !!process.env.HUGGINGFACE_API_KEY
    });
  } else {
    logger.error('Environment configuration validation failed', {
      missingVariables: validation.missing,
      formatErrors: validation.formatErrors
    });
  }

  if (validation.warnings.length > 0) {
    logger.warn('Environment configuration warnings', {
      warnings: validation.warnings
    });
  }

  return validation;
}

export default {
  validateEnvironment,
  getConfig,
  logConfigurationStatus
};