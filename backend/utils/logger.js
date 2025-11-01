import { createWriteStream } from 'fs';
import { join } from 'path';

class Logger {
  constructor() {
    this.isDevelopment = process.env.NODE_ENV !== 'production';
    this.logLevel = process.env.LOG_LEVEL || (this.isDevelopment ? 'debug' : 'info');
    
    // Log levels in order of severity
    this.levels = {
      error: 0,
      warn: 1,
      info: 2,
      debug: 3
    };
    
    // Initialize log streams for production
    if (!this.isDevelopment) {
      this.errorStream = createWriteStream(join(process.cwd(), 'logs', 'error.log'), { flags: 'a' });
      this.infoStream = createWriteStream(join(process.cwd(), 'logs', 'app.log'), { flags: 'a' });
    }
  }

  shouldLog(level) {
    return this.levels[level] <= this.levels[this.logLevel];
  }

  formatMessage(level, message, meta = {}) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level: level.toUpperCase(),
      message,
      ...meta
    };

    if (this.isDevelopment) {
      // Pretty print for development
      const emoji = {
        error: '❌',
        warn: '⚠️',
        info: '✅',
        debug: '🔍'
      };
      
      return `${emoji[level]} [${timestamp}] ${message}${Object.keys(meta).length ? ' ' + JSON.stringify(meta, null, 2) : ''}`;
    } else {
      // JSON format for production
      return JSON.stringify(logEntry);
    }
  }

  log(level, message, meta = {}) {
    if (!this.shouldLog(level)) return;

    const formattedMessage = this.formatMessage(level, message, meta);

    if (this.isDevelopment) {
      console.log(formattedMessage);
    } else {
      // Write to appropriate log file in production
      if (level === 'error') {
        this.errorStream?.write(formattedMessage + '\n');
      } else {
        this.infoStream?.write(formattedMessage + '\n');
      }
    }
  }

  error(message, meta = {}) {
    this.log('error', message, meta);
  }

  warn(message, meta = {}) {
    this.log('warn', message, meta);
  }

  info(message, meta = {}) {
    this.log('info', message, meta);
  }

  debug(message, meta = {}) {
    this.log('debug', message, meta);
  }

  // Specific methods for common use cases
  jobStart(jobId, url) {
    this.info('Job started', { jobId, url, type: 'job_start' });
  }

  jobComplete(jobId, duration, success = true) {
    this.info('Job completed', { jobId, duration, success, type: 'job_complete' });
  }

  jobError(jobId, error, url) {
    this.error('Job failed', { jobId, error: error.message, url, type: 'job_error' });
  }

  scrapeStart(url) {
    this.info('Scraping started', { url, type: 'scrape_start' });
  }

  scrapeComplete(url, title, duration) {
    this.info('Scraping completed', { url, title, duration, type: 'scrape_complete' });
  }

  scrapeError(url, error) {
    this.error('Scraping failed', { url, error: error.message, type: 'scrape_error' });
  }

  // Graceful shutdown
  close() {
    if (this.errorStream) {
      this.errorStream.end();
    }
    if (this.infoStream) {
      this.infoStream.end();
    }
  }
}

// Create singleton instance
const logger = new Logger();

export default logger;