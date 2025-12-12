/**
 * Tests for PatternServer class
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PatternServer } from './server.js';
import { AgentSession } from './session.js';
import type { PatternConfig } from './types.js';
import { TOOL_DEFINITIONS } from './tools/index.js';

// Create mock instances
const mockServerMethods = {
  setRequestHandler: vi.fn(),
  connect: vi.fn().mockResolvedValue(undefined),
  close: vi.fn().mockResolvedValue(undefined),
};

const mockBackendMethods = {
  connect: vi.fn().mockResolvedValue(undefined),
  disconnect: vi.fn().mockResolvedValue(undefined),
  ensureBucket: vi.fn().mockResolvedValue(undefined),
  isConnected: vi.fn().mockReturnValue(true),
  set: vi.fn().mockResolvedValue(undefined),
  getFromProject: vi.fn().mockResolvedValue(null),
  deleteFromProject: vi.fn().mockResolvedValue(true),
  listFromProject: vi.fn().mockResolvedValue([]),
  keysFromProject: vi.fn().mockResolvedValue([]),
};

// Mock the MCP SDK
vi.mock('@modelcontextprotocol/sdk/server/index.js', () => ({
  Server: vi.fn(() => mockServerMethods),
}));

// Mock the NATS KV backend
vi.mock('./storage/nats-kv.js', () => ({
  NatsKvBackend: vi.fn(() => mockBackendMethods),
}));

// Mock the stdio transport
vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: vi.fn(() => ({})),
}));

// Mock the logger to avoid console output during tests
vi.mock('./logger.js', () => ({
  createLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

describe('PatternServer', () => {
  let config: PatternConfig;
  let session: AgentSession;
  let server: PatternServer;

  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();

    // Create test config and session
    config = {
      natsUrl: 'nats://localhost:4222',
      projectId: 'test-project',
      agentId: 'test-agent',
      debug: false,
    };

    session = new AgentSession('test-agent-123', 'test-project-456');
  });

  afterEach(async () => {
    // Clean up server if it exists
    if (server) {
      try {
        await server.shutdown();
      } catch (error) {
        // Ignore errors during cleanup
      }
    }
  });

  describe('Constructor', () => {
    it('should initialize with provided config and session', () => {
      server = new PatternServer(config, session);

      expect(server).toBeInstanceOf(PatternServer);
    });

    it('should create MCP server with correct metadata', async () => {
      const { Server } = await import('@modelcontextprotocol/sdk/server/index.js');

      server = new PatternServer(config, session);

      expect(Server).toHaveBeenCalledWith(
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
    });

    it('should create NATS backend with correct URL', async () => {
      const { NatsKvBackend } = await import('./storage/nats-kv.js');

      server = new PatternServer(config, session);

      expect(NatsKvBackend).toHaveBeenCalledWith(config.natsUrl);
    });

    it('should store session reference', () => {
      server = new PatternServer(config, session);

      expect(server.getSession()).toBe(session);
    });

    it('should store storage backend reference', () => {
      server = new PatternServer(config, session);

      expect(server.getStorage()).toBeDefined();
    });
  });

  describe('initialize', () => {
    it('should connect to NATS storage backend', async () => {
      server = new PatternServer(config, session);

      await server.initialize();

      expect(mockBackendMethods.connect).toHaveBeenCalledTimes(1);
    });

    it('should ensure bucket exists for project', async () => {
      server = new PatternServer(config, session);

      await server.initialize();

      expect(mockBackendMethods.ensureBucket).toHaveBeenCalledWith(session.projectId);
    });

    it('should throw error if NATS connection fails', async () => {
      const connectionError = new Error('Connection failed');
      mockBackendMethods.connect.mockRejectedValueOnce(connectionError);

      server = new PatternServer(config, session);

      await expect(server.initialize()).rejects.toThrow('Connection failed');
    });

    it('should throw error if bucket creation fails', async () => {
      const bucketError = new Error('Bucket creation failed');
      mockBackendMethods.ensureBucket.mockRejectedValueOnce(bucketError);

      server = new PatternServer(config, session);

      await expect(server.initialize()).rejects.toThrow('Bucket creation failed');
    });

    it('should register MCP request handlers', async () => {
      server = new PatternServer(config, session);

      await server.initialize();

      expect(mockServerMethods.setRequestHandler).toHaveBeenCalled();
    });
  });

  describe('ListTools Handler', () => {
    it('should return all tool definitions including health check', async () => {
      server = new PatternServer(config, session);
      await server.initialize();

      const setRequestHandlerCalls = mockServerMethods.setRequestHandler.mock.calls;

      // setRequestHandler is called twice: once for ListTools, once for CallTool
      // The first call should be for ListTools
      expect(setRequestHandlerCalls.length).toBeGreaterThanOrEqual(2);

      // Execute the first handler (ListTools)
      const handler = setRequestHandlerCalls[0][1];
      const result = await handler();

      expect(result.tools).toBeDefined();
      expect(Array.isArray(result.tools)).toBe(true);
      expect(result.tools.length).toBe(TOOL_DEFINITIONS.length + 1); // +1 for health check

      // Check that health check tool is included
      const healthTool = result.tools.find((t: any) => t.name === 'pattern_health');
      expect(healthTool).toBeDefined();
      expect(healthTool.description).toContain('health');
    });

    it('should return standard tool definitions', async () => {
      server = new PatternServer(config, session);
      await server.initialize();

      const setRequestHandlerCalls = mockServerMethods.setRequestHandler.mock.calls;
      const handler = setRequestHandlerCalls[0][1];
      const result = await handler();

      // Check for specific tool names
      const toolNames = result.tools.map((t: any) => t.name);
      expect(toolNames).toContain('remember');
      expect(toolNames).toContain('remember-task');
      expect(toolNames).toContain('recall-context');
      expect(toolNames).toContain('forget');
      expect(toolNames).toContain('cleanup');
    });
  });

  describe('CallTool Handler - Health Check', () => {
    it('should handle pattern_health tool call', async () => {
      server = new PatternServer(config, session);
      await server.initialize();

      const setRequestHandlerCalls = mockServerMethods.setRequestHandler.mock.calls;

      // The second call should be for CallTool
      const handler = setRequestHandlerCalls[1][1];
      const result = await handler({
        params: {
          name: 'pattern_health',
          arguments: {},
        },
      });

      expect(result.content).toBeDefined();
      expect(result.content[0].type).toBe('text');

      const health = JSON.parse(result.content[0].text);
      expect(health.status).toBe('healthy');
      expect(health.storage).toBeDefined();
      expect(health.storage.connected).toBe(true);
      expect(health.storage.backend).toBe('nats-kv');
      expect(health.session).toBeDefined();
      expect(health.session.agentId).toBe(session.agentId);
      expect(health.session.projectId).toBe(session.projectId);
    });

    it('should include session duration in health check', async () => {
      server = new PatternServer(config, session);
      await server.initialize();

      const setRequestHandlerCalls = mockServerMethods.setRequestHandler.mock.calls;
      const handler = setRequestHandlerCalls[1][1];

      const result = await handler({
        params: {
          name: 'pattern_health',
          arguments: {},
        },
      });

      const health = JSON.parse(result.content[0].text);
      expect(health.session.sessionDuration).toBeDefined();
      expect(health.session.sessionDuration).toMatch(/^\d+\.\d{2}s$/);
    });
  });

  describe('CallTool Handler - Tool Dispatch', () => {
    it('should handle tool execution errors gracefully', async () => {
      server = new PatternServer(config, session);
      await server.initialize();

      const setRequestHandlerCalls = mockServerMethods.setRequestHandler.mock.calls;
      const handler = setRequestHandlerCalls[1][1];

      // Call with unknown tool name to trigger error
      const result = await handler({
        params: {
          name: 'unknown_tool',
          arguments: {},
        },
      });

      expect(result.content).toBeDefined();
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('Error:');
      expect(result.isError).toBe(true);
    });

    it('should handle missing arguments gracefully', async () => {
      server = new PatternServer(config, session);
      await server.initialize();

      const setRequestHandlerCalls = mockServerMethods.setRequestHandler.mock.calls;
      const handler = setRequestHandlerCalls[1][1];

      // Call without arguments
      const result = await handler({
        params: {
          name: 'remember',
          // arguments is undefined
        },
      });

      // Should not crash, should handle gracefully
      expect(result.content).toBeDefined();
    });
  });

  describe('start', () => {
    it('should connect to stdio transport', async () => {
      const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js');

      server = new PatternServer(config, session);
      await server.initialize();
      await server.start();

      expect(StdioServerTransport).toHaveBeenCalled();
      expect(mockServerMethods.connect).toHaveBeenCalledTimes(1);
    });

    it('should not start if already running', async () => {
      server = new PatternServer(config, session);
      await server.initialize();
      await server.start();

      const firstCallCount = mockServerMethods.connect.mock.calls.length;

      // Try to start again
      await server.start();

      // Should not call connect again
      expect(mockServerMethods.connect.mock.calls.length).toBe(firstCallCount);
    });
  });

  describe('shutdown', () => {
    it('should disconnect from storage', async () => {
      server = new PatternServer(config, session);
      await server.initialize();
      await server.start();
      await server.shutdown();

      expect(mockBackendMethods.disconnect).toHaveBeenCalledTimes(1);
    });

    it('should close MCP server', async () => {
      server = new PatternServer(config, session);
      await server.initialize();
      await server.start();
      await server.shutdown();

      expect(mockServerMethods.close).toHaveBeenCalledTimes(1);
    });

    it('should handle storage disconnect errors gracefully', async () => {
      mockBackendMethods.disconnect.mockRejectedValueOnce(new Error('Disconnect failed'));

      server = new PatternServer(config, session);
      await server.initialize();
      await server.start();

      // Should not throw
      await expect(server.shutdown()).resolves.not.toThrow();
    });

    it('should handle MCP server close errors gracefully', async () => {
      mockServerMethods.close.mockRejectedValueOnce(new Error('Close failed'));

      server = new PatternServer(config, session);
      await server.initialize();
      await server.start();

      // Should not throw
      await expect(server.shutdown()).resolves.not.toThrow();
    });

    it('should not error if shutdown called when not running', async () => {
      server = new PatternServer(config, session);

      // Should not throw
      await expect(server.shutdown()).resolves.not.toThrow();
    });

    it('should call session.logSummary during shutdown', async () => {
      const logSummarySpy = vi.spyOn(session, 'logSummary');

      server = new PatternServer(config, session);
      await server.initialize();
      await server.start();
      await server.shutdown();

      expect(logSummarySpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('getStorage', () => {
    it('should return storage backend instance', () => {
      server = new PatternServer(config, session);
      const storage = server.getStorage();

      expect(storage).toBeDefined();
      expect(storage.connect).toBeDefined();
      expect(storage.disconnect).toBeDefined();
    });

    it('should return same instance on multiple calls', () => {
      server = new PatternServer(config, session);
      const storage1 = server.getStorage();
      const storage2 = server.getStorage();

      expect(storage1).toBe(storage2);
    });
  });

  describe('getSession', () => {
    it('should return session instance', () => {
      server = new PatternServer(config, session);
      const returnedSession = server.getSession();

      expect(returnedSession).toBe(session);
    });

    it('should return same instance on multiple calls', () => {
      server = new PatternServer(config, session);
      const session1 = server.getSession();
      const session2 = server.getSession();

      expect(session1).toBe(session2);
    });
  });

  describe('Integration Flow', () => {
    it('should complete full lifecycle: initialize -> start -> shutdown', async () => {
      server = new PatternServer(config, session);

      await server.initialize();
      await server.start();
      await server.shutdown();

      // All steps should complete without errors
    });

    it('should maintain session state throughout lifecycle', async () => {
      server = new PatternServer(config, session);
      const initialSession = server.getSession();

      await server.initialize();
      const sessionAfterInit = server.getSession();

      await server.start();
      const sessionAfterStart = server.getSession();

      await server.shutdown();
      const sessionAfterShutdown = server.getSession();

      // Session should be the same object throughout
      expect(sessionAfterInit).toBe(initialSession);
      expect(sessionAfterStart).toBe(initialSession);
      expect(sessionAfterShutdown).toBe(initialSession);
    });
  });

  describe('Error Recovery', () => {
    it('should handle initialization failure and allow retry', async () => {
      // First attempt fails
      mockBackendMethods.connect.mockRejectedValueOnce(new Error('Network error'));

      server = new PatternServer(config, session);
      await expect(server.initialize()).rejects.toThrow('Network error');

      // Second attempt succeeds
      mockBackendMethods.connect.mockResolvedValueOnce(undefined);
      await expect(server.initialize()).resolves.not.toThrow();
    });
  });

  describe('Configuration Validation', () => {
    it('should accept valid NATS URL', () => {
      const validConfig = { ...config, natsUrl: 'nats://example.com:4222' };

      expect(() => new PatternServer(validConfig, session)).not.toThrow();
    });

    it('should accept localhost NATS URL', () => {
      const localConfig = { ...config, natsUrl: 'nats://localhost:4222' };

      expect(() => new PatternServer(localConfig, session)).not.toThrow();
    });

    it('should accept custom port NATS URL', () => {
      const customPortConfig = { ...config, natsUrl: 'nats://localhost:5555' };

      expect(() => new PatternServer(customPortConfig, session)).not.toThrow();
    });
  });
});
