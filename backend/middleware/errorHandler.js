import logger from '../utils/logger.js';

// 404 handler for unknown routes
export function notFound(req, res, next) {
  res.status(404).json({
    success: false,
    error: 'Route not found',
    path: req.originalUrl,
  });
}

// Centralized error handler
export function errorHandler(err, req, res, next) {
  // If response already started, delegate to default Express handler
  if (res.headersSent) return next(err);

  const status = err.status || err.statusCode || 500;
  const message = err.message || 'Internal server error';

  // Structured error logging
  logger.error('API error', {
    status,
    method: req.method,
    path: req.originalUrl,
    error: message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    type: 'api_error'
  });

  res.status(status).json({
    success: false,
    error: message,
    details: err.errors || undefined,
  });
}