#!/usr/bin/env node

/**
 * Pattern MCP Server Entry Point
 * Hierarchical agent memory system for Loom
 */

import { realpathSync } from 'fs';
import { fileURLToPath } from 'url';
import { connect as connectTcp, NatsConnection, ConnectionOptions } from 'nats';
import { loadConfig, validateConfig } from './config.js';
import { logger } from './logger.js';
import { AgentSession } from './session.js';
import { PatternServer } from './server.js';
import { loadIdentity } from './identity.js';

/**
 * Parsed NATS URL components
 */
interface ParsedNatsUrl {
  server: string;
  user?: string;
  pass?: string;
  transport: 'tcp' | 'websocket';
}

/**
 * Parse a NATS URL that may contain credentials
 * Based on warp/src/nats.ts parseNatsUrl()
 */
function parseNatsUrl(url: string): ParsedNatsUrl {
  const transport =
    url.toLowerCase().startsWith('wss://') || url.toLowerCase().startsWith('ws://')
      ? 'websocket'
      : 'tcp';

  try {
    let normalizedUrl: string;
    if (url.startsWith('nats://')) {
      normalizedUrl = url.replace(/^nats:\/\//, 'http://');
    } else if (url.startsWith('tls://')) {
      normalizedUrl = url.replace(/^tls:\/\//, 'https://');
    } else if (url.startsWith('wss://')) {
      normalizedUrl = url.replace(/^wss:\/\//, 'https://');
    } else if (url.startsWith('ws://')) {
      normalizedUrl = url.replace(/^ws:\/\//, 'http://');
    } else {
      normalizedUrl = `http://${url}`;
    }

    const parsed = new URL(normalizedUrl);

    let server: string;
    if (transport === 'websocket') {
      const protocol = url.toLowerCase().startsWith('ws://') ? 'ws' : 'wss';
      server = `${protocol}://${parsed.host}${parsed.pathname}${parsed.search}`;
    } else {
      server = `nats://${parsed.host}`;
    }

    const result: ParsedNatsUrl = { server, transport };

    if (parsed.username) {
      result.user = decodeURIComponent(parsed.username);
    }
    if (parsed.password) {
      result.pass = decodeURIComponent(parsed.password);
    }

    return result;
  } catch {
    return { server: url, transport };
  }
}

/**
 * Initialize WebSocket shim for Node.js
 */
async function initWebSocketShim(): Promise<void> {
  const ws = await import('ws');
  (globalThis as unknown as { WebSocket: typeof ws.default }).WebSocket = ws.default;
}

/**
 * Connect to NATS using appropriate transport
 */
async function connectToNats(natsUrl: string): Promise<NatsConnection> {
  const parsed = parseNatsUrl(natsUrl);

  const opts: ConnectionOptions = {
    servers: parsed.server,
    name: 'pattern-identity-loader',
  };

  if (parsed.user && parsed.pass) {
    opts.user = parsed.user;
    opts.pass = parsed.pass;
  }

  if (parsed.transport === 'websocket') {
    await initWebSocketShim();
    const { connect: connectWs } = await import('nats.ws');
    return connectWs(opts);
  } else {
    return connectTcp(opts);
  }
}

/**
 * Parse command line arguments
 */
export function parseArgs(argv: string[] = process.argv.slice(2)): {
  showVersion: boolean;
  showHelp: boolean;
} {
  return {
    showVersion: argv.includes('--version') || argv.includes('-v'),
    showHelp: argv.includes('--help') || argv.includes('-h'),
  };
}

/**
 * Get version string
 */
export function getVersionString(): string {
  return 'Pattern MCP Server v0.2.0';
}

/**
 * Get help string
 */
export function getHelpString(): string {
  return `
Pattern MCP Server - Hierarchical agent memory for Loominal

USAGE:
  pattern [OPTIONS]

OPTIONS:
  --version, -v    Show version information
  --help, -h       Show this help message

ENVIRONMENT VARIABLES:
  NATS_URL              NATS server URL (default: nats://localhost:4222)
  NATS_USER             NATS username (optional)
  NATS_PASS             NATS password (optional)
  LOOMINAL_PROJECT_ID   Project ID for memory isolation (default: "default")
  LOOMINAL_AGENT_ID     Agent ID for identity tracking (generated if not set)
  DEBUG                 Enable debug logging (default: false)

EXAMPLES:
  # Start with default settings
  pattern

  # Start with custom NATS server
  NATS_URL=nats://my-nats:4222 pattern

  # Start with specific project and agent
  LOOMINAL_PROJECT_ID=my-project LOOMINAL_AGENT_ID=agent-123 pattern

For more information, visit: https://github.com/loominal/pattern
`;
}

/**
 * Show version information
 */
function showVersion(): void {
  // eslint-disable-next-line no-console
  console.log(getVersionString());
  process.exit(0);
}

/**
 * Show help information
 */
function showHelp(): void {
  // eslint-disable-next-line no-console
  console.log(getHelpString());
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

  // Connect to NATS to load identity
  let nc: NatsConnection;
  try {
    logger.info('Connecting to NATS to load identity...');
    nc = await connectToNats(config.natsUrl);
    logger.info('Connected to NATS');
  } catch (error) {
    logger.error('Failed to connect to NATS:', error);
    process.exit(1);
  }

  // Load identity from Warp's NATS KV store
  let identity;
  try {
    logger.info('Loading identity from NATS KV store...');
    identity = await loadIdentity(nc, config.projectId);
    logger.info('Identity loaded', {
      agentId: identity.agentId,
      isSubagent: identity.isSubagent,
    });
  } catch (error) {
    logger.error('Failed to load identity from NATS:', error);
    await nc.close();
    process.exit(1);
  }

  // Close the temporary NATS connection (server will create its own)
  await nc.close();

  // Create session with loaded identity
  const session = new AgentSession(
    identity.agentId,
    config.projectId,
    identity.isSubagent,
    identity.isSubagent ? identity.parentId : undefined
  );

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

// Only run main() when executed directly, not when imported
// Check if this file is the main module (resolving symlinks for bin scripts)
function checkIsMainModule(): boolean {
  const entryScript = process.argv[1];
  if (!entryScript) return false;

  try {
    const thisFile = fileURLToPath(import.meta.url);
    const entryFile = realpathSync(entryScript);
    return thisFile === entryFile;
  } catch {
    // Fallback to direct comparison if realpath fails
    return import.meta.url === `file://${entryScript}`;
  }
}

if (checkIsMainModule()) {
  main();
}
