#!/usr/bin/env node

/**
 * Pattern MCP Server Entry Point
 * Hierarchical agent memory system for Loom
 */

import { loadConfig, validateConfig } from './config.js';
import { logger } from './logger.js';

async function main() {
  try {
    const config = loadConfig();
    validateConfig(config);

    logger.setDebug(config.debug || false);
    logger.info('Pattern MCP server starting...');
    logger.info(`NATS URL: ${config.natsUrl}`);
    logger.info(`Project ID: ${config.projectId}`);

    // MCP server initialization will be implemented in Phase 11.3
    logger.warn('MCP server initialization not yet implemented');
    logger.info('Pattern server scaffold is ready for implementation');
  } catch (error) {
    logger.error('Failed to start Pattern server:', error);
    process.exit(1);
  }
}

main();
