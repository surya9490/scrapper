#!/usr/bin/env node

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from './utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const processes = [
  {
    name: 'Main Server',
    script: 'server.js',
    color: '\x1b[36m', // Cyan
    prefix: '[MAIN]'
  },
  {
    name: 'Worker Server',
    script: 'worker-server.js',
    color: '\x1b[33m', // Yellow
    prefix: '[WORKER]'
  }
];

const runningProcesses = [];

// Color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function logWithPrefix(prefix, color, message) {
  const timestamp = new Date().toISOString();
  console.log(`${color}${prefix}${colors.reset} ${colors.bright}[${timestamp}]${colors.reset} ${message}`);
}

function startProcess(processConfig) {
  const { name, script, color, prefix } = processConfig;
  
  logWithPrefix(prefix, color, `Starting ${name}...`);
  
  const child = spawn('node', [script], {
    cwd: __dirname,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env }
  });

  // Handle stdout
  child.stdout.on('data', (data) => {
    const lines = data.toString().split('\n').filter(line => line.trim());
    lines.forEach(line => {
      logWithPrefix(prefix, color, line);
    });
  });

  // Handle stderr
  child.stderr.on('data', (data) => {
    const lines = data.toString().split('\n').filter(line => line.trim());
    lines.forEach(line => {
      logWithPrefix(prefix, colors.red, `ERROR: ${line}`);
    });
  });

  // Handle process exit
  child.on('exit', (code, signal) => {
    if (code !== null) {
      logWithPrefix(prefix, colors.red, `${name} exited with code ${code}`);
    } else if (signal !== null) {
      logWithPrefix(prefix, colors.red, `${name} killed with signal ${signal}`);
    }
    
    // Remove from running processes
    const index = runningProcesses.findIndex(p => p.child.pid === child.pid);
    if (index !== -1) {
      runningProcesses.splice(index, 1);
    }
    
    // If this was an unexpected exit and we still have other processes, restart
    if (code !== 0 && runningProcesses.length > 0) {
      logWithPrefix(prefix, colors.yellow, `Restarting ${name} in 5 seconds...`);
      setTimeout(() => {
        if (runningProcesses.length > 0) { // Only restart if other processes are still running
          const newProcess = startProcess(processConfig);
          runningProcesses.push({ ...processConfig, child: newProcess });
        }
      }, 5000);
    }
  });

  // Handle process errors
  child.on('error', (error) => {
    logWithPrefix(prefix, colors.red, `Failed to start ${name}: ${error.message}`);
  });

  logWithPrefix(prefix, colors.green, `${name} started with PID ${child.pid}`);
  
  return child;
}

// Start all processes
function startAll() {
  console.log(`${colors.bright}${colors.blue}🚀 Starting Scrappy App Services${colors.reset}\n`);
  
  processes.forEach(processConfig => {
    const child = startProcess(processConfig);
    runningProcesses.push({ ...processConfig, child });
  });
  
  console.log(`\n${colors.green}✅ All services started successfully!${colors.reset}`);
  console.log(`${colors.cyan}📊 Main Server: API endpoints and web interface${colors.reset}`);
  console.log(`${colors.yellow}⚙️  Worker Server: Background scraping jobs${colors.reset}\n`);
}

// Graceful shutdown
function shutdown() {
  console.log(`\n${colors.yellow}🛑 Shutting down all services...${colors.reset}`);
  
  runningProcesses.forEach(({ name, child, prefix, color }) => {
    if (child && !child.killed) {
      logWithPrefix(prefix, color, `Stopping ${name}...`);
      child.kill('SIGTERM');
      
      // Force kill after 10 seconds
      setTimeout(() => {
        if (!child.killed) {
          logWithPrefix(prefix, colors.red, `Force killing ${name}...`);
          child.kill('SIGKILL');
        }
      }, 10000);
    }
  });
  
  // Exit after all processes are cleaned up
  setTimeout(() => {
    console.log(`${colors.green}✅ All services stopped${colors.reset}`);
    process.exit(0);
  }, 2000);
}

// Handle shutdown signals
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error(`${colors.red}💥 Uncaught Exception:${colors.reset}`, error);
  shutdown();
});

process.on('unhandledRejection', (reason, promise) => {
  console.error(`${colors.red}💥 Unhandled Rejection at:${colors.reset}`, promise, 'reason:', reason);
  shutdown();
});

// Start the application
startAll();

// Keep the process alive
process.stdin.resume();