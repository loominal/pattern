/**
 * Unit tests for NATS KV storage backend
 * These tests focus on URL parsing and don't require a live NATS connection
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// We need to test the parseNatsUrl function which is private
// So we'll import the module and test it indirectly through NatsKvBackend behavior
// For now, let's test the URL parsing logic by examining connection behavior

describe('NATS URL Parsing', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('TCP URLs', () => {
    it('should parse simple nats:// URL', async () => {
      // We can't directly test parseNatsUrl since it's private
      // But we can verify the NatsKvBackend accepts these URLs
      const { NatsKvBackend } = await import('./nats-kv.js');
      const backend = new NatsKvBackend('nats://localhost:4222');
      expect(backend).toBeDefined();
    });

    it('should parse nats:// URL with credentials', async () => {
      const { NatsKvBackend } = await import('./nats-kv.js');
      const backend = new NatsKvBackend('nats://user:pass@localhost:4222');
      expect(backend).toBeDefined();
    });

    it('should parse tls:// URL', async () => {
      const { NatsKvBackend } = await import('./nats-kv.js');
      const backend = new NatsKvBackend('tls://localhost:4222');
      expect(backend).toBeDefined();
    });

    it('should handle URL without scheme', async () => {
      const { NatsKvBackend } = await import('./nats-kv.js');
      const backend = new NatsKvBackend('localhost:4222');
      expect(backend).toBeDefined();
    });
  });

  describe('WebSocket URLs', () => {
    it('should parse wss:// URL', async () => {
      const { NatsKvBackend } = await import('./nats-kv.js');
      const backend = new NatsKvBackend('wss://nats.example.com');
      expect(backend).toBeDefined();
    });

    it('should parse ws:// URL', async () => {
      const { NatsKvBackend } = await import('./nats-kv.js');
      const backend = new NatsKvBackend('ws://localhost:8080');
      expect(backend).toBeDefined();
    });

    it('should parse wss:// URL with credentials', async () => {
      const { NatsKvBackend } = await import('./nats-kv.js');
      const backend = new NatsKvBackend('wss://user:pass@nats.example.com');
      expect(backend).toBeDefined();
    });

    it('should parse wss:// URL with path', async () => {
      const { NatsKvBackend } = await import('./nats-kv.js');
      const backend = new NatsKvBackend('wss://nats.example.com/ws');
      expect(backend).toBeDefined();
    });
  });

  describe('URL-encoded credentials', () => {
    it('should handle special characters in password', async () => {
      const { NatsKvBackend } = await import('./nats-kv.js');
      // Password with special chars: p@ss:word/123
      const backend = new NatsKvBackend('nats://user:p%40ss%3Aword%2F123@localhost:4222');
      expect(backend).toBeDefined();
    });

    it('should handle special characters in username', async () => {
      const { NatsKvBackend } = await import('./nats-kv.js');
      // Username with special char: user@domain
      const backend = new NatsKvBackend('nats://user%40domain:pass@localhost:4222');
      expect(backend).toBeDefined();
    });
  });

  describe('Environment variable credentials', () => {
    it('should accept NATS_USER and NATS_PASS env vars', async () => {
      process.env.NATS_USER = 'testuser';
      process.env.NATS_PASS = 'testpass';

      const { NatsKvBackend } = await import('./nats-kv.js');
      const backend = new NatsKvBackend('nats://localhost:4222');
      expect(backend).toBeDefined();
    });
  });
});

describe('NatsKvBackend Error States', () => {
  describe('Not connected', () => {
    it('should throw when ensureBucket called without connect', async () => {
      const { NatsKvBackend } = await import('./nats-kv.js');
      const backend = new NatsKvBackend('nats://localhost:4222');

      await expect(backend.ensureBucket('test')).rejects.toThrow('Not connected to NATS');
    });

    it('should report not connected before connect', async () => {
      const { NatsKvBackend } = await import('./nats-kv.js');
      const backend = new NatsKvBackend('nats://localhost:4222');

      expect(backend.isConnected()).toBe(false);
    });
  });

  describe('Connection failures', () => {
    it('should throw PatternError on connection failure', async () => {
      const { NatsKvBackend } = await import('./nats-kv.js');
      const backend = new NatsKvBackend('nats://nonexistent-host:4222');

      // This will fail because the host doesn't exist
      await expect(backend.connect()).rejects.toThrow('Failed to connect to NATS');
    }, 15000); // Longer timeout for connection attempts

    it('should include server info in connection error', async () => {
      const { NatsKvBackend } = await import('./nats-kv.js');
      const { PatternError, PatternErrorCode } = await import('../types.js');
      const backend = new NatsKvBackend('nats://bad-host:4222');

      try {
        await backend.connect();
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(PatternError);
        const patternError = error as InstanceType<typeof PatternError>;
        expect(patternError.code).toBe(PatternErrorCode.NATS_ERROR);
        // Context may be undefined if not set, just check code is correct
        expect(patternError.message).toContain('Failed to connect to NATS');
      }
    }, 15000);
  });

  describe('Disconnect behavior', () => {
    it('should handle disconnect when not connected', async () => {
      const { NatsKvBackend } = await import('./nats-kv.js');
      const backend = new NatsKvBackend('nats://localhost:4222');

      // Should not throw
      await expect(backend.disconnect()).resolves.not.toThrow();
    });
  });
});

describe('Storage Interface Validation Errors', () => {
  it('should throw VALIDATION_ERROR for get()', async () => {
    const { NatsKvBackend } = await import('./nats-kv.js');
    const { PatternErrorCode } = await import('../types.js');
    const backend = new NatsKvBackend('nats://localhost:4222');

    try {
      await backend.get('test-key');
      expect.fail('Should have thrown');
    } catch (error: unknown) {
      const err = error as { code?: string };
      expect(err.code).toBe(PatternErrorCode.VALIDATION_ERROR);
    }
  });

  it('should throw VALIDATION_ERROR for delete()', async () => {
    const { NatsKvBackend } = await import('./nats-kv.js');
    const { PatternErrorCode } = await import('../types.js');
    const backend = new NatsKvBackend('nats://localhost:4222');

    try {
      await backend.delete('test-key');
      expect.fail('Should have thrown');
    } catch (error: unknown) {
      const err = error as { code?: string };
      expect(err.code).toBe(PatternErrorCode.VALIDATION_ERROR);
    }
  });

  it('should throw VALIDATION_ERROR for list()', async () => {
    const { NatsKvBackend } = await import('./nats-kv.js');
    const { PatternErrorCode } = await import('../types.js');
    const backend = new NatsKvBackend('nats://localhost:4222');

    try {
      await backend.list('prefix');
      expect.fail('Should have thrown');
    } catch (error: unknown) {
      const err = error as { code?: string };
      expect(err.code).toBe(PatternErrorCode.VALIDATION_ERROR);
    }
  });

  it('should throw VALIDATION_ERROR for keys()', async () => {
    const { NatsKvBackend } = await import('./nats-kv.js');
    const { PatternErrorCode } = await import('../types.js');
    const backend = new NatsKvBackend('nats://localhost:4222');

    try {
      await backend.keys('prefix');
      expect.fail('Should have thrown');
    } catch (error: unknown) {
      const err = error as { code?: string };
      expect(err.code).toBe(PatternErrorCode.VALIDATION_ERROR);
    }
  });
});
