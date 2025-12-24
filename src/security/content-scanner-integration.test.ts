/**
 * Integration tests for content scanner with remember tools
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { remember } from '../tools/remember.js';
import { rememberTask } from '../tools/remember-task.js';
import { rememberLearning } from '../tools/remember-learning.js';
import { coreMemory } from '../tools/core-memory.js';
import type { NatsKvBackend } from '../storage/nats-kv.js';
import type { PatternConfig } from '../types.js';
import { logger } from '../logger.js';

// Mock NatsKvBackend
const createMockStorage = () => {
  const mockStorage = {
    set: vi.fn(),
    get: vi.fn(),
    delete: vi.fn(),
    list: vi.fn(),
    keys: vi.fn(),
    getFromProject: vi.fn(),
    deleteFromProject: vi.fn(),
    listFromProject: vi.fn(),
    keysFromProject: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    isConnected: vi.fn(),
    ensureBucket: vi.fn(),
    ensureUserBucket: vi.fn(),
    ensureGlobalBucket: vi.fn(),
    ensureBucketForScope: vi.fn(),
    getFromUserBucket: vi.fn().mockResolvedValue(null),
    listFromUserBucket: vi.fn().mockResolvedValue([]),
    keysFromUserBucket: vi.fn().mockResolvedValue([]),
    deleteFromUserBucket: vi.fn().mockResolvedValue(false),
    getFromGlobalBucket: vi.fn().mockResolvedValue(null),
    listFromGlobalBucket: vi.fn().mockResolvedValue([]),
    keysFromGlobalBucket: vi.fn().mockResolvedValue([]),
    deleteFromGlobalBucket: vi.fn().mockResolvedValue(false),
  } as unknown as NatsKvBackend;
  return mockStorage;
};

describe('Content Scanner Integration', () => {
  let storage: NatsKvBackend;
  const projectId = 'test-project-123';
  const agentId = 'test-agent-456';
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    storage = createMockStorage();
    vi.clearAllMocks();
    warnSpy = vi.spyOn(logger, 'warn');
  });

  describe('remember() with scanning enabled', () => {
    it('should warn when API key is detected', async () => {
      const config: PatternConfig = {
        natsUrl: 'nats://localhost:4222',
        projectId,
        contentScanning: { enabled: true },
      };

      const content = 'My API key is api_key=sk_live_abcdefghijklmnopqrstuvwxyz123456';
      await remember({ content }, storage, projectId, agentId, config);

      // Should emit warning but still store
      expect(warnSpy).toHaveBeenCalled();
      expect(warnSpy.mock.calls[0][0]).toContain('potential sensitive information');
      expect(storage.set).toHaveBeenCalledTimes(1);
    });

    it('should warn when password is detected', async () => {
      const config: PatternConfig = {
        natsUrl: 'nats://localhost:4222',
        projectId,
        contentScanning: { enabled: true },
      };

      const content = 'Database connection: password=MyP@ssw0rd123';
      await remember({ content }, storage, projectId, agentId, config);

      expect(warnSpy).toHaveBeenCalled();
      expect(warnSpy.mock.calls[0][0]).toContain('potential sensitive information');
      expect(storage.set).toHaveBeenCalledTimes(1);
    });

    it('should warn when email (PII) is detected', async () => {
      const config: PatternConfig = {
        natsUrl: 'nats://localhost:4222',
        projectId,
        contentScanning: { enabled: true },
      };

      const content = 'Contact user@example.com for details';
      await remember({ content }, storage, projectId, agentId, config);

      expect(warnSpy).toHaveBeenCalled();
      expect(warnSpy.mock.calls[1][0]).toContain('email');
      expect(storage.set).toHaveBeenCalledTimes(1);
    });

    it('should not warn on clean content', async () => {
      const config: PatternConfig = {
        natsUrl: 'nats://localhost:4222',
        projectId,
        contentScanning: { enabled: true },
      };

      const content = 'Just a normal note about my day';
      await remember({ content }, storage, projectId, agentId, config);

      expect(warnSpy).not.toHaveBeenCalled();
      expect(storage.set).toHaveBeenCalledTimes(1);
    });
  });

  describe('remember() with scanning disabled', () => {
    it('should not warn even when API key is present', async () => {
      const config: PatternConfig = {
        natsUrl: 'nats://localhost:4222',
        projectId,
        contentScanning: { enabled: false },
      };

      const content = 'My API key is api_key=sk_live_abcdefghijklmnopqrstuvwxyz123456';
      await remember({ content }, storage, projectId, agentId, config);

      expect(warnSpy).not.toHaveBeenCalled();
      expect(storage.set).toHaveBeenCalledTimes(1);
    });
  });

  describe('remember() with default config (scanning enabled)', () => {
    it('should enable scanning by default when no config provided', async () => {
      const content = 'password=MyP@ssw0rd123';
      await remember({ content }, storage, projectId, agentId);

      expect(warnSpy).toHaveBeenCalled();
      expect(storage.set).toHaveBeenCalledTimes(1);
    });

    it('should enable scanning when config provided without contentScanning', async () => {
      const config: PatternConfig = {
        natsUrl: 'nats://localhost:4222',
        projectId,
      };

      const content = 'api_key=sk_test_abcdefghijklmnopqrstuvwxyz';
      await remember({ content }, storage, projectId, agentId, config);

      expect(warnSpy).toHaveBeenCalled();
      expect(storage.set).toHaveBeenCalledTimes(1);
    });
  });

  describe('rememberTask() integration', () => {
    it('should scan task content', async () => {
      const config: PatternConfig = {
        natsUrl: 'nats://localhost:4222',
        projectId,
        contentScanning: { enabled: true },
      };

      const content = 'Deploy app with API_KEY=AKIAIOSFODNN7EXAMPLE';
      await rememberTask({ content }, storage, projectId, agentId, config);

      expect(warnSpy).toHaveBeenCalled();
      expect(storage.set).toHaveBeenCalledTimes(1);
    });
  });

  describe('rememberLearning() integration', () => {
    it('should scan learning content', async () => {
      const config: PatternConfig = {
        natsUrl: 'nats://localhost:4222',
        projectId,
        contentScanning: { enabled: true },
      };

      const content = 'Learned to use email admin@company.com for alerts';
      await rememberLearning({ content }, storage, projectId, agentId, config);

      expect(warnSpy).toHaveBeenCalled();
      expect(storage.set).toHaveBeenCalledTimes(1);
    });
  });

  describe('coreMemory() integration', () => {
    it('should scan core memory content', async () => {
      const config: PatternConfig = {
        natsUrl: 'nats://localhost:4222',
        projectId,
        contentScanning: { enabled: true },
      };

      const content = 'My identity includes password=MyP@ssword123';
      await coreMemory({ content }, storage, projectId, agentId, config);

      expect(warnSpy).toHaveBeenCalled();
      expect(warnSpy.mock.calls[0][0]).toContain('potential sensitive information');
      expect(storage.set).toHaveBeenCalledTimes(1);
    });

    it('should not block storage even with warnings', async () => {
      const config: PatternConfig = {
        natsUrl: 'nats://localhost:4222',
        projectId,
        contentScanning: { enabled: true },
      };

      const content = 'JWT: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abc';
      const result = await coreMemory({ content }, storage, projectId, agentId, config);

      expect(result.memoryId).toBeDefined();
      expect(warnSpy).toHaveBeenCalled();
      expect(storage.set).toHaveBeenCalledTimes(1);
    });
  });

  describe('Multiple detections', () => {
    it('should report all detected sensitive patterns', async () => {
      const config: PatternConfig = {
        natsUrl: 'nats://localhost:4222',
        projectId,
        contentScanning: { enabled: true },
      };

      const content = `
        api_key=sk_live_abcdefghijklmnopqrstuvwxyz
        password=MyP@ssw0rd123
        Contact: user@example.com
        SSN: 123-45-6789
      `;

      await remember({ content }, storage, projectId, agentId, config);

      expect(warnSpy).toHaveBeenCalled();
      // Should see warnings for multiple types
      const allWarnings = warnSpy.mock.calls.map((call) => call[0]).join(' ');
      expect(allWarnings).toContain('api-key');
      expect(allWarnings).toContain('password');
      expect(allWarnings).toContain('email');
      expect(allWarnings).toContain('ssn');
      expect(storage.set).toHaveBeenCalledTimes(1);
    });
  });

  describe('Non-blocking behavior', () => {
    it('should never throw even with many warnings', async () => {
      const config: PatternConfig = {
        natsUrl: 'nats://localhost:4222',
        projectId,
        contentScanning: { enabled: true },
      };

      const content = `
        api_key=sk_live_1234567890abcdefghijklmnopqrstuvwxyz
        api_token=token_abcdefghijklmnopqrstuvwxyz1234567890
        secret=secret_value_1234567890abcdefghijklmnopqrst
        password=P@ssw0rd123456
        email1@example.com
        email2@test.org
        -----BEGIN PRIVATE KEY-----
      `;

      // Should not throw
      const result = await remember({ content }, storage, projectId, agentId, config);

      expect(result.memoryId).toBeDefined();
      expect(warnSpy).toHaveBeenCalled();
      expect(storage.set).toHaveBeenCalledTimes(1);
    });

    it('should complete successfully even if scanner has issues', async () => {
      const config: PatternConfig = {
        natsUrl: 'nats://localhost:4222',
        projectId,
        contentScanning: { enabled: true },
      };

      // Edge case: very long line that might stress the scanner
      const content = 'x'.repeat(30000) + ' password=test12345678';

      const result = await remember({ content }, storage, projectId, agentId, config);

      expect(result.memoryId).toBeDefined();
      expect(storage.set).toHaveBeenCalledTimes(1);
    });
  });

  describe('Warning message format', () => {
    it('should provide clear warning messages', async () => {
      const config: PatternConfig = {
        natsUrl: 'nats://localhost:4222',
        projectId,
        contentScanning: { enabled: true },
      };

      const content = 'api_key=sk_test_abcdefghijklmnopqrstuvwxyz123';
      await remember({ content }, storage, projectId, agentId, config);

      expect(warnSpy).toHaveBeenCalledTimes(3);
      // First call: warning count
      expect(warnSpy.mock.calls[0][0]).toMatch(/detected \d+ potential sensitive information/);
      // Second call: formatted warnings
      expect(warnSpy.mock.calls[1][0]).toContain('occurrence');
      // Third call: guidance
      expect(warnSpy.mock.calls[2][0]).toContain('non-blocking warning');
      expect(warnSpy.mock.calls[2][0]).toContain('memory has been stored');
    });
  });
});
