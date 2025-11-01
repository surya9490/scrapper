import { PrismaClient } from '@prisma/client';
import logger from './logger.js';

// Global Prisma client instance
let prisma = null;

/**
 * Get or create a singleton Prisma client instance
 * @returns {PrismaClient} The Prisma client instance
 */
export function getPrismaClient() {
  if (!prisma) {
    prisma = new PrismaClient({
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'event', level: 'error' },
        { emit: 'event', level: 'info' },
        { emit: 'event', level: 'warn' },
      ],
    });

    // Log database queries in development
    if (process.env.NODE_ENV === 'development') {
      prisma.$on('query', (e) => {
        logger.debug('Database query executed', {
          query: e.query,
          params: e.params,
          duration: `${e.duration}ms`,
          type: 'db_query'
        });
      });
    }

    // Log database errors
    prisma.$on('error', (e) => {
      logger.error('Database error occurred', {
        message: e.message,
        target: e.target,
        type: 'db_error'
      });
    });

    // Log database info and warnings
    prisma.$on('info', (e) => {
      logger.info('Database info', {
        message: e.message,
        target: e.target,
        type: 'db_info'
      });
    });

    prisma.$on('warn', (e) => {
      logger.warn('Database warning', {
        message: e.message,
        target: e.target,
        type: 'db_warn'
      });
    });

    logger.info('Prisma client initialized successfully', { type: 'prisma_init' });
  }

  return prisma;
}

/**
 * Gracefully disconnect the Prisma client
 */
export async function disconnectPrisma() {
  if (prisma) {
    try {
      await prisma.$disconnect();
      logger.info('Prisma client disconnected successfully', { type: 'prisma_disconnect' });
      prisma = null;
    } catch (error) {
      logger.error('Error disconnecting Prisma client', {
        error: error.message,
        type: 'prisma_disconnect_error'
      });
    }
  }
}

/**
 * Handle graceful shutdown
 */
function handleShutdown() {
  logger.info('Shutting down Prisma client...', { type: 'prisma_shutdown' });
  disconnectPrisma().then(() => {
    process.exit(0);
  }).catch((error) => {
    logger.error('Error during Prisma shutdown', {
      error: error.message,
      type: 'prisma_shutdown_error'
    });
    process.exit(1);
  });
}

// Handle graceful shutdown
process.on('SIGTERM', handleShutdown);
process.on('SIGINT', handleShutdown);

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception, shutting down Prisma', {
    error: error.message,
    stack: error.stack,
    type: 'uncaught_exception'
  });
  handleShutdown();
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection, shutting down Prisma', {
    reason: reason?.toString(),
    promise: promise?.toString(),
    type: 'unhandled_rejection'
  });
  handleShutdown();
});

// Export the singleton instance as default
export default getPrismaClient();