#!/usr/bin/env node

import CircuitBreaker from '../utils/circuitBreaker.js';
import logger from '../utils/logger.js';

const circuitBreaker = new CircuitBreaker();

async function main() {
  const command = process.argv[2];
  const domain = process.argv[3];

  try {
    switch (command) {
      case 'status':
        if (domain) {
          const status = await circuitBreaker.getStatus(domain);
          console.log(`Circuit breaker status for ${domain}:`, JSON.stringify(status, null, 2));
        } else {
          const allStatuses = await circuitBreaker.getAllStatuses();
          console.log('All circuit breaker statuses:', JSON.stringify(allStatuses, null, 2));
        }
        break;

      case 'reset':
        if (!domain) {
          console.error('Domain is required for reset command');
          process.exit(1);
        }
        const success = await circuitBreaker.reset(domain);
        if (success) {
          console.log(`Circuit breaker reset successfully for ${domain}`);
        } else {
          console.error(`Failed to reset circuit breaker for ${domain}`);
        }
        break;

      case 'check':
        if (!domain) {
          console.error('Domain is required for check command');
          process.exit(1);
        }
        const isOpen = await circuitBreaker.isOpen(domain);
        console.log(`Circuit breaker for ${domain} is ${isOpen ? 'OPEN' : 'CLOSED'}`);
        break;

      default:
        console.log('Usage:');
        console.log('  node circuit-breaker-admin.js status [domain]     - Check status');
        console.log('  node circuit-breaker-admin.js reset <domain>      - Reset circuit breaker');
        console.log('  node circuit-breaker-admin.js check <domain>      - Check if circuit is open');
        process.exit(1);
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }

  process.exit(0);
}

main();