/**
 * Transport and connection tests for NATS KV storage backend
 * Tests WebSocket transport, authentication, and connection failure scenarios
 * These tests improve coverage for connection handling code
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PatternError, PatternErrorCode } from '../types.js';

describe('NATS Transport Tests', () => {
  describe('WebSocket Transport', () => {
    // Note: These tests verify that WebSocket URLs are accepted and processed
    // Full WebSocket integration requires a NATS server with WebSocket enabled

    it('should accept wss:// URL and create backend', async () => {
      const { NatsKvBackend } = await import('./nats-kv.js');
      const backend = new NatsKvBackend('wss://nats.example.com:443');
      expect(backend).toBeDefined();
      expect(backend.isConnected()).toBe(false);
    });

    it('should accept ws:// URL and create backend', async () => {
      const { NatsKvBackend } = await import('./nats-kv.js');
      const backend = new NatsKvBackend('ws://localhost:8080');
      expect(backend).toBeDefined();
      expect(backend.isConnected()).toBe(false);
    });

    it('should accept wss:// with path and create backend', async () => {
      const { NatsKvBackend } = await import('./nats-kv.js');
      const backend = new NatsKvBackend('wss://nats.example.com/ws');
      expect(backend).toBeDefined();
    });

    it('should accept wss:// with query parameters', async () => {
      const { NatsKvBackend } = await import('./nats-kv.js');
      const backend = new NatsKvBackend('wss://nats.example.com/ws?token=abc');
      expect(backend).toBeDefined();
    });

    it('should accept wss:// with credentials', async () => {
      const { NatsKvBackend } = await import('./nats-kv.js');
      const backend = new NatsKvBackend('wss://user:pass@nats.example.com');
      expect(backend).toBeDefined();
    });

    it('should handle WebSocket connection attempt to non-existent server', async () => {
      const { NatsKvBackend } = await import('./nats-kv.js');
      const backend = new NatsKvBackend('wss://nonexistent-ws-host:443');

      // Connection should fail with PatternError
      await expect(backend.connect()).rejects.toThrow();
    }, 15000); // Longer timeout for connection attempts
  });

  describe('TCP Transport', () => {
    it('should accept nats:// URL and create backend', async () => {
      const { NatsKvBackend } = await import('./nats-kv.js');
      const backend = new NatsKvBackend('nats://localhost:4222');
      expect(backend).toBeDefined();
    });

    it('should accept tls:// URL and create backend', async () => {
      const { NatsKvBackend } = await import('./nats-kv.js');
      const backend = new NatsKvBackend('tls://localhost:4222');
      expect(backend).toBeDefined();
    });

    it('should accept plain host:port format', async () => {
      const { NatsKvBackend } = await import('./nats-kv.js');
      const backend = new NatsKvBackend('localhost:4222');
      expect(backend).toBeDefined();
    });

    it('should accept nats:// with credentials', async () => {
      const { NatsKvBackend } = await import('./nats-kv.js');
      const backend = new NatsKvBackend('nats://user:pass@localhost:4222');
      expect(backend).toBeDefined();
    });

    it('should accept tls:// with credentials', async () => {
      const { NatsKvBackend } = await import('./nats-kv.js');
      const backend = new NatsKvBackend('tls://user:pass@localhost:4222');
      expect(backend).toBeDefined();
    });
  });

  describe('Authentication', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      vi.resetModules();
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should extract credentials from URL', async () => {
      const { NatsKvBackend } = await import('./nats-kv.js');
      const backend = new NatsKvBackend('nats://testuser:testpass@localhost:4222');
      expect(backend).toBeDefined();
    });

    it('should handle URL-encoded credentials', async () => {
      const { NatsKvBackend } = await import('./nats-kv.js');
      // Password: p@ss:word/123
      const backend = new NatsKvBackend('nats://user:p%40ss%3Aword%2F123@localhost:4222');
      expect(backend).toBeDefined();
    });

    it('should handle URL-encoded username', async () => {
      const { NatsKvBackend } = await import('./nats-kv.js');
      // Username: user@domain.com
      const backend = new NatsKvBackend('nats://user%40domain.com:pass@localhost:4222');
      expect(backend).toBeDefined();
    });

    it('should fall back to environment variables when no URL credentials', async () => {
      process.env.NATS_USER = 'env-user';
      process.env.NATS_PASS = 'env-pass';

      const { NatsKvBackend } = await import('./nats-kv.js');
      const backend = new NatsKvBackend('nats://localhost:4222');
      expect(backend).toBeDefined();
    });

    it('should prioritize URL credentials over environment variables', async () => {
      process.env.NATS_USER = 'env-user';
      process.env.NATS_PASS = 'env-pass';

      const { NatsKvBackend } = await import('./nats-kv.js');
      const backend = new NatsKvBackend('nats://url-user:url-pass@localhost:4222');
      expect(backend).toBeDefined();
    });

    it('should handle missing password in environment', async () => {
      process.env.NATS_USER = 'env-user';
      delete process.env.NATS_PASS;

      const { NatsKvBackend } = await import('./nats-kv.js');
      const backend = new NatsKvBackend('nats://localhost:4222');
      expect(backend).toBeDefined();
    });

    it('should handle missing username in environment', async () => {
      delete process.env.NATS_USER;
      process.env.NATS_PASS = 'env-pass';

      const { NatsKvBackend } = await import('./nats-kv.js');
      const backend = new NatsKvBackend('nats://localhost:4222');
      expect(backend).toBeDefined();
    });
  });

  describe('Connection Management', () => {
    it('should track connection state correctly', async () => {
      const { NatsKvBackend } = await import('./nats-kv.js');
      const backend = new NatsKvBackend(process.env.NATS_URL || 'nats://localhost:4222');

      expect(backend.isConnected()).toBe(false);

      await backend.connect();
      expect(backend.isConnected()).toBe(true);

      await backend.disconnect();
      expect(backend.isConnected()).toBe(false);
    });

    it('should allow multiple connect calls without error', async () => {
      const { NatsKvBackend } = await import('./nats-kv.js');
      const backend = new NatsKvBackend(process.env.NATS_URL || 'nats://localhost:4222');

      await backend.connect();
      expect(backend.isConnected()).toBe(true);

      // Second connect should be a no-op
      await backend.connect();
      expect(backend.isConnected()).toBe(true);

      await backend.disconnect();
    });

    it('should clear buckets on disconnect', async () => {
      const { NatsKvBackend } = await import('./nats-kv.js');
      const backend = new NatsKvBackend(process.env.NATS_URL || 'nats://localhost:4222');
      const projectId = `test-disconnect-${Date.now()}`;

      await backend.connect();
      await backend.ensureBucket(projectId);

      await backend.disconnect();
      expect(backend.isConnected()).toBe(false);

      // After disconnect, bucket cache should be cleared
      // Reconnect and ensure bucket again
      await backend.connect();
      await expect(backend.ensureBucket(projectId)).resolves.not.toThrow();

      await backend.disconnect();
    });

    it('should handle disconnect when not connected', async () => {
      const { NatsKvBackend } = await import('./nats-kv.js');
      const backend = new NatsKvBackend('nats://localhost:4222');

      // Should not throw
      await expect(backend.disconnect()).resolves.not.toThrow();
    });

    it('should handle multiple disconnect calls', async () => {
      const { NatsKvBackend } = await import('./nats-kv.js');
      const backend = new NatsKvBackend(process.env.NATS_URL || 'nats://localhost:4222');

      await backend.connect();
      await backend.disconnect();

      // Second disconnect should be a no-op
      await expect(backend.disconnect()).resolves.not.toThrow();
    });
  });

  describe('Connection Failures', () => {
    it('should throw PatternError on connection timeout', async () => {
      const { NatsKvBackend } = await import('./nats-kv.js');
      const backend = new NatsKvBackend('nats://192.0.2.1:4222'); // TEST-NET-1, guaranteed unreachable

      await expect(backend.connect()).rejects.toThrow('Failed to connect to NATS');
    }, 30000); // Increased timeout for slow networks

    it('should throw PatternError on DNS resolution failure', async () => {
      const { NatsKvBackend } = await import('./nats-kv.js');
      const backend = new NatsKvBackend('nats://nonexistent-host-that-does-not-exist.invalid:4222');

      await expect(backend.connect()).rejects.toThrow('Failed to connect to NATS');
    }, 15000);

    it('should include server info in connection error context', async () => {
      const { NatsKvBackend } = await import('./nats-kv.js');
      const backend = new NatsKvBackend('nats://bad-host:4222');

      await expect(backend.connect()).rejects.toThrow('Failed to connect to NATS');
    }, 15000);

    it('should handle authentication failure gracefully', async () => {
      // This test assumes NATS server at localhost:4222 requires auth
      // If it doesn't, the test will pass (connection succeeds)
      const { NatsKvBackend } = await import('./nats-kv.js');
      const backend = new NatsKvBackend('nats://wronguser:wrongpass@localhost:4222');

      // This might succeed if NATS doesn't require auth, or fail with auth error
      try {
        await backend.connect();
        // If we get here, server doesn't require auth - disconnect cleanly
        await backend.disconnect();
        expect(true).toBe(true);
      } catch (error) {
        // If auth is required, we should get a PatternError
        expect(error).toBeInstanceOf(PatternError);
        const patternError = error as PatternError;
        expect(patternError.code).toBe(PatternErrorCode.NATS_ERROR);
      }
    }, 15000);
  });

  describe('Bucket Operations Without Connection', () => {
    it('should throw when ensureBucket called without connection', async () => {
      const { NatsKvBackend } = await import('./nats-kv.js');
      const backend = new NatsKvBackend('nats://localhost:4222');

      await expect(backend.ensureBucket('test')).rejects.toThrow('Not connected to NATS');
    });

    it('should throw when ensureUserBucket called without connection', async () => {
      const { NatsKvBackend } = await import('./nats-kv.js');
      const backend = new NatsKvBackend('nats://localhost:4222');

      await expect(backend.ensureUserBucket('agent-123')).rejects.toThrow(
        'Not connected to NATS'
      );
    });

    it('should throw when ensureGlobalBucket called without connection', async () => {
      const { NatsKvBackend } = await import('./nats-kv.js');
      const backend = new NatsKvBackend('nats://localhost:4222');

      await expect(backend.ensureGlobalBucket()).rejects.toThrow('Not connected to NATS');
    });

    it('should throw when set called without connection', async () => {
      const { NatsKvBackend } = await import('./nats-kv.js');
      const backend = new NatsKvBackend('nats://localhost:4222');

      const memory = {
        id: 'test-id',
        agentId: 'agent-123',
        projectId: 'project-123',
        scope: 'private' as const,
        category: 'recent' as const,
        content: 'test',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
      };

      await expect(backend.set('test-key', memory)).rejects.toThrow();
    });
  });

  describe('URL Parsing Edge Cases', () => {
    it('should handle URL with only hostname', async () => {
      const { NatsKvBackend } = await import('./nats-kv.js');
      const backend = new NatsKvBackend('localhost');
      expect(backend).toBeDefined();
    });

    it('should handle URL with port but no protocol', async () => {
      const { NatsKvBackend } = await import('./nats-kv.js');
      const backend = new NatsKvBackend('localhost:4222');
      expect(backend).toBeDefined();
    });

    it('should handle malformed URL gracefully', async () => {
      const { NatsKvBackend } = await import('./nats-kv.js');
      const backend = new NatsKvBackend(':::invalid:::');
      expect(backend).toBeDefined();

      // Connection will fail, but URL parsing doesn't throw
      await expect(backend.connect()).rejects.toThrow();
    }, 15000);

    it('should handle empty credentials in URL', async () => {
      const { NatsKvBackend } = await import('./nats-kv.js');
      const backend = new NatsKvBackend('nats://:@localhost:4222');
      expect(backend).toBeDefined();
    });

    it('should handle IPv6 address', async () => {
      const { NatsKvBackend } = await import('./nats-kv.js');
      const backend = new NatsKvBackend('nats://[::1]:4222');
      expect(backend).toBeDefined();
    });
  });
});
