#!/usr/bin/env node

/**
 * Pattern MCP Server Entry Point
 * Hierarchical agent memory system for Loom
 */

import { loadConfig, validateConfig } from './config.js';
import { logger } from './logger.js';
import { AgentSession } from './session.js';
import { PatternServer } from './server.js';

/**
 * Parse command line arguments
 */
function parseArgs(): { showVersion: boolean; showHelp: boolean } {
  const args = process.argv.slice(2);
  return {
    showVersion: args.includes('--version') || args.includes('-v'),
    showHelp: args.includes('--help') || args.includes('-h'),
  };
}

/**
 * Show version information
 */
function showVersion(): void {
  // eslint-disable-next-line no-console
  console.log('Pattern MCP Server v0.1.0');
  process.exit(0);
}

/**
 * Show help information
 */
function showHelp(): void {
  // eslint-disable-next-line no-console
  console.log(`
Pattern MCP Server - Hierarchical agent memory for Loom

USAGE:
  pattern [OPTIONS]

OPTIONS:
  --version, -v    Show version information
  --help, -h       Show this help message

ENVIRONMENT VARIABLES:
  NATS_URL            NATS server URL (default: nats://localhost:4222)
  NATS_USER           NATS username (optional)
  NATS_PASS           NATS password (optional)
  LOOM_PROJECT_ID     Project ID for memory isolation (default: "default")
  LOOM_AGENT_ID       Agent ID for identity tracking (generated if not set)
  DEBUG               Enable debug logging (default: false)

EXAMPLES:
  # Start with default settings
  pattern

  # Start with custom NATS server
  NATS_URL=nats://my-nats:4222 pattern

  # Start with specific project and agent
  LOOM_PROJECT_ID=my-project LOOM_AGENT_ID=agent-123 pattern

For more information, visit: https://github.com/mdlopresti/loom-pattern
`);
  process.exit(0);
}

/**
 * Main entry point
 */
async function main() {
  // Parse command line arguments
  const args = parseArgs();

  if (args.showVersion) {
    showVersion();
  }

  if (args.showHelp) {
    showHelp();
  }

  // Load and validate configuration
  let config;
  try {
    config = loadConfig();
    validateConfig(config);
  } catch (error) {
    logger.error('Configuration error:', error);
    process.exit(1);
  }

  // Enable debug logging if configured
  logger.setDebug(config.debug || false);

  logger.info('Pattern MCP server starting...');
  logger.info(`NATS URL: ${config.natsUrl}`);
  logger.info(`Project ID: ${config.projectId}`);

  // Initialize session
  const session = new AgentSession(config.agentId, config.projectId);

  // Create and initialize server
  const server = new PatternServer(config, session);

  // Set up graceful shutdown handlers
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down gracefully...`);
    await server.shutdown();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  try {
    // Initialize server (connect to NATS, set up handlers)
    await server.initialize();

    // Start server (connect stdio transport)
    await server.start();

    // Server is now running and will handle requests via stdio
    // The process will stay alive until a shutdown signal is received
  } catch (error) {
    logger.error('Failed to start Pattern server:', error);
    await server.shutdown();
    process.exit(1);
  }
}

main();
