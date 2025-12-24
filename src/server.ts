/**
 * Pattern MCP Server
 * Exposes hierarchical memory tools to Claude Code via MCP protocol
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import type { PatternConfig } from './types.js';
import { NatsKvBackend } from './storage/nats-kv.js';
import type { AgentSession } from './session.js';
import { createLogger } from './logger.js';
import { TOOL_DEFINITIONS, handleToolCall } from './tools/index.js';

const logger = createLogger('server');

/**
 * Pattern MCP Server
 * Manages the MCP protocol server, storage backend, and tool handlers
 */
export class PatternServer {
  private server: Server;
  private storage: NatsKvBackend;
  private session: AgentSession;
  private config: PatternConfig;
  private isRunning: boolean = false;

  constructor(config: PatternConfig, session: AgentSession) {
    this.config = config;
    this.session = session;
    this.storage = new NatsKvBackend(config.natsUrl);

    // Initialize MCP server
    this.server = new Server(
      {
        name: 'pattern',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    logger.info('Pattern MCP server initialized', {
      agentId: session.agentId,
      projectId: session.projectId,
    });
  }

  /**
   * Initialize the server - connect to storage and set up handlers
   */
  async initialize(): Promise<void> {
    logger.info('Initializing Pattern server...');

    // Connect to NATS
    try {
      await this.storage.connect();
      logger.info('Connected to NATS storage backend');
    } catch (error) {
      logger.error('Failed to connect to NATS', error);
      throw error;
    }

    // Ensure bucket exists for this project
    try {
      await this.storage.ensureBucket(this.session.projectId);
      logger.info('Storage bucket ready', { projectId: this.session.projectId });
    } catch (error) {
      logger.error('Failed to initialize storage bucket', error);
      throw error;
    }

    // Register MCP tool handlers
    this.registerHandlers();

    logger.info('Pattern server initialized successfully');
  }

  /**
   * Register MCP protocol handlers
   */
  private registerHandlers(): void {
    // List available tools - returns all memory tools plus health check
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      logger.debug('ListTools request received');

      // Add health check to the standard tool definitions
      const allTools = [
        {
          name: 'pattern_health',
          description: 'Check Pattern server health and connection status',
          inputSchema: {
            type: 'object',
            properties: {},
            required: [],
          },
        },
        ...TOOL_DEFINITIONS,
      ];

      return { tools: allTools };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      logger.debug('CallTool request received', { tool: name, args });

      try {
        // Handle health check specially
        if (name === 'pattern_health') {
          return await this.handleHealthCheck();
        }

        // Dispatch to tool handlers
        const toolContext: {
          agentId: string;
          projectId: string;
          storage: NatsKvBackend;
          isSubagent?: boolean;
          parentId?: string;
          config?: PatternConfig;
        } = {
          agentId: this.session.agentId,
          projectId: this.session.projectId,
          storage: this.storage,
          config: this.config,
        };

        // Add sub-agent info if applicable
        if (this.session.isSubagent) {
          toolContext.isSubagent = true;
          if (this.session.parentId) {
            toolContext.parentId = this.session.parentId;
          }
        }

        const result = await handleToolCall(name, args ?? {}, toolContext);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        const err = error as Error;
        logger.error('Tool execution failed', { tool: name, error: err.message });

        return {
          content: [
            {
              type: 'text',
              text: `Error: ${err.message}`,
            },
          ],
          isError: true,
        };
      }
    });

    logger.debug('MCP handlers registered');
  }

  /**
   * Health check tool handler
   */
  private async handleHealthCheck(): Promise<{
    content: Array<{ type: string; text: string }>;
  }> {
    const isConnected = this.storage.isConnected();
    const sessionInfo = this.session.getSessionInfo();
    const durationSec = (sessionInfo.sessionDuration / 1000).toFixed(2);

    const status = {
      status: 'healthy',
      storage: {
        connected: isConnected,
        backend: 'nats-kv',
        url: this.config.natsUrl,
      },
      session: {
        agentId: sessionInfo.agentId,
        projectId: sessionInfo.projectId,
        sessionStart: sessionInfo.sessionStart,
        sessionDuration: `${durationSec}s`,
      },
    };

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(status, null, 2),
        },
      ],
    };
  }

  /**
   * Start the MCP server with stdio transport
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Server is already running');
      return;
    }

    logger.info('Starting Pattern MCP server...');

    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    this.isRunning = true;
    logger.info('Pattern MCP server is running and ready to accept requests');
  }

  /**
   * Gracefully shutdown the server
   */
  async shutdown(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    logger.info('Shutting down Pattern server...');

    // Log session summary
    this.session.logSummary();

    // Disconnect from storage
    try {
      await this.storage.disconnect();
      logger.info('Disconnected from storage backend');
    } catch (error) {
      logger.error('Error disconnecting from storage', error);
    }

    // Close MCP server
    try {
      await this.server.close();
      logger.info('MCP server closed');
    } catch (error) {
      logger.error('Error closing MCP server', error);
    }

    this.isRunning = false;
    logger.info('Pattern server shutdown complete');
  }

  /**
   * Get the storage backend (for testing/debugging)
   */
  getStorage(): NatsKvBackend {
    return this.storage;
  }

  /**
   * Get the session (for testing/debugging)
   */
  getSession(): AgentSession {
    return this.session;
  }
}
