/**
 * Tests for remember tool
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { remember, type RememberInput, type RememberOutput } from './remember.js';
import type { NatsKvBackend } from '../storage/nats-kv.js';
import type { Memory } from '../types.js';
import { PatternError, PatternErrorCode } from '../types.js';

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
    // New multi-bucket methods
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

describe('remember tool', () => {
  let storage: NatsKvBackend;
  const projectId = 'test-project-123';
  const agentId = 'test-agent-456';

  beforeEach(() => {
    storage = createMockStorage();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Happy Path Scenarios', () => {
    it('should store a basic memory with default values', async () => {
      const input: RememberInput = {
        content: 'This is a test memory',
      };

      const result = await remember(input, storage, projectId, agentId);

      expect(result.memoryId).toBeDefined();
      expect(result.memoryId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      ); // UUID v4 format
      expect(result.expiresAt).toBeDefined(); // 'recent' category has 24h TTL

      expect(storage.set).toHaveBeenCalledTimes(1);
      const [key, memory, ttl] = (storage.set as any).mock.calls[0];

      expect(key).toBe(`agents/${agentId}/recent/${result.memoryId}`);
      expect(memory).toMatchObject({
        id: result.memoryId,
        agentId,
        projectId,
        scope: 'private',
        category: 'recent',
        content: 'This is a test memory',
        version: 1,
      });
      expect(memory.createdAt).toBeDefined();
      expect(memory.updatedAt).toBeDefined();
      expect(memory.expiresAt).toBeDefined();
      expect(ttl).toBe(86400); // 24 hours in seconds
    });

    it('should store a private recent memory', async () => {
      const input: RememberInput = {
        content: 'Recent thought',
        scope: 'private',
        category: 'recent',
      };

      const result = await remember(input, storage, projectId, agentId);

      expect(result.memoryId).toBeDefined();
      expect(result.expiresAt).toBeDefined(); // recent has TTL

      const [key, memory, ttl] = (storage.set as any).mock.calls[0];
      expect(key).toBe(`agents/${agentId}/recent/${result.memoryId}`);
      expect(memory.scope).toBe('private');
      expect(memory.category).toBe('recent');
      expect(ttl).toBe(86400);
    });

    it('should store a private task memory', async () => {
      const input: RememberInput = {
        content: 'Task: Implement feature X',
        scope: 'private',
        category: 'tasks',
      };

      const result = await remember(input, storage, projectId, agentId);

      expect(result.expiresAt).toBeDefined(); // tasks has TTL

      const [key, memory, ttl] = (storage.set as any).mock.calls[0];
      expect(key).toBe(`agents/${agentId}/tasks/${result.memoryId}`);
      expect(memory.category).toBe('tasks');
      expect(ttl).toBe(86400);
    });

    it('should store a private longterm memory', async () => {
      const input: RememberInput = {
        content: 'Important insight to remember',
        scope: 'private',
        category: 'longterm',
      };

      const result = await remember(input, storage, projectId, agentId);

      expect(result.expiresAt).toBeUndefined(); // longterm has no TTL

      const [key, memory, ttl] = (storage.set as any).mock.calls[0];
      expect(key).toBe(`agents/${agentId}/longterm/${result.memoryId}`);
      expect(memory.category).toBe('longterm');
      expect(memory.expiresAt).toBeUndefined();
      expect(ttl).toBeUndefined();
    });

    it('should store a private core memory', async () => {
      const input: RememberInput = {
        content: 'Core identity trait',
        scope: 'private',
        category: 'core',
      };

      const result = await remember(input, storage, projectId, agentId);

      expect(result.expiresAt).toBeUndefined(); // core has no TTL

      const [key, memory, ttl] = (storage.set as any).mock.calls[0];
      expect(key).toBe(`agents/${agentId}/core/${result.memoryId}`);
      expect(memory.category).toBe('core');
      expect(ttl).toBeUndefined();
    });

    it('should store a shared decisions memory', async () => {
      const input: RememberInput = {
        content: 'We decided to use React for the frontend',
        scope: 'team',
        category: 'decisions',
      };

      const result = await remember(input, storage, projectId, agentId);

      expect(result.expiresAt).toBeUndefined(); // decisions has no TTL

      const [key, memory, ttl] = (storage.set as any).mock.calls[0];
      expect(key).toBe(`shared/decisions/${result.memoryId}`);
      expect(memory.scope).toBe('team');
      expect(memory.category).toBe('decisions');
      expect(ttl).toBeUndefined();
    });

    it('should store a shared architecture memory', async () => {
      const input: RememberInput = {
        content: 'System uses microservices architecture',
        scope: 'team',
        category: 'architecture',
      };

      const result = await remember(input, storage, projectId, agentId);

      const [key, memory] = (storage.set as any).mock.calls[0];
      expect(key).toBe(`shared/architecture/${result.memoryId}`);
      expect(memory.category).toBe('architecture');
    });

    it('should store a shared learnings memory', async () => {
      const input: RememberInput = {
        content: 'Learned that caching improves performance',
        scope: 'team',
        category: 'learnings',
      };

      const result = await remember(input, storage, projectId, agentId);

      const [key, memory] = (storage.set as any).mock.calls[0];
      expect(key).toBe(`shared/learnings/${result.memoryId}`);
      expect(memory.category).toBe('learnings');
    });

    it('should store memory with metadata', async () => {
      const input: RememberInput = {
        content: 'Memory with metadata',
        metadata: {
          tags: ['important', 'urgent'],
          priority: 1,
          source: 'user-input',
        },
      };

      await remember(input, storage, projectId, agentId);

      const [, memory] = (storage.set as any).mock.calls[0];
      expect(memory.metadata).toEqual({
        tags: ['important', 'urgent'],
        priority: 1,
        source: 'user-input',
      });
    });

    it('should store memory with relatedTo metadata', async () => {
      const input: RememberInput = {
        content: 'Related memory',
        metadata: {
          relatedTo: ['mem-123', 'mem-456'],
        },
      };

      await remember(input, storage, projectId, agentId);

      const [, memory] = (storage.set as any).mock.calls[0];
      expect(memory.metadata?.relatedTo).toEqual(['mem-123', 'mem-456']);
    });
  });

  describe('Validation Errors', () => {
    it('should reject empty content', async () => {
      const input: RememberInput = {
        content: '',
      };

      await expect(remember(input, storage, projectId, agentId)).rejects.toThrow(PatternError);
      await expect(remember(input, storage, projectId, agentId)).rejects.toThrow(
        'Content cannot be empty'
      );

      try {
        await remember(input, storage, projectId, agentId);
      } catch (error) {
        expect(error).toBeInstanceOf(PatternError);
        expect((error as PatternError).code).toBe(PatternErrorCode.VALIDATION_ERROR);
      }
    });

    it('should reject whitespace-only content', async () => {
      const input: RememberInput = {
        content: '   \n\t  ',
      };

      await expect(remember(input, storage, projectId, agentId)).rejects.toThrow(
        'Content cannot be empty'
      );
    });

    it('should reject content exceeding max size (32KB)', async () => {
      const largeContent = 'a'.repeat(32 * 1024 + 1); // 32KB + 1 byte
      const input: RememberInput = {
        content: largeContent,
      };

      await expect(remember(input, storage, projectId, agentId)).rejects.toThrow(PatternError);

      try {
        await remember(input, storage, projectId, agentId);
      } catch (error) {
        expect(error).toBeInstanceOf(PatternError);
        expect((error as PatternError).code).toBe(PatternErrorCode.VALIDATION_ERROR);
        expect((error as PatternError).message).toContain('exceeds maximum');
        expect((error as PatternError).details).toMatchObject({
          maxSize: 32 * 1024,
        });
      }
    });

    it('should reject invalid scope/category: team with recent', async () => {
      const input: RememberInput = {
        content: 'Invalid combination',
        scope: 'team',
        category: 'recent',
      };

      await expect(remember(input, storage, projectId, agentId)).rejects.toThrow(PatternError);

      try {
        await remember(input, storage, projectId, agentId);
      } catch (error) {
        expect(error).toBeInstanceOf(PatternError);
        expect((error as PatternError).code).toBe(PatternErrorCode.INVALID_CATEGORY);
        expect((error as PatternError).message).toContain('not valid for team scope');
      }
    });

    it('should reject invalid scope/category: team with tasks', async () => {
      const input: RememberInput = {
        content: 'Invalid combination',
        scope: 'team',
        category: 'tasks',
      };

      await expect(remember(input, storage, projectId, agentId)).rejects.toThrow(PatternError);

      try {
        await remember(input, storage, projectId, agentId);
      } catch (error) {
        expect((error as PatternError).code).toBe(PatternErrorCode.INVALID_CATEGORY);
      }
    });

    it('should reject invalid scope/category: team with longterm', async () => {
      const input: RememberInput = {
        content: 'Invalid combination',
        scope: 'team',
        category: 'longterm',
      };

      await expect(remember(input, storage, projectId, agentId)).rejects.toThrow(PatternError);
    });

    it('should reject invalid scope/category: team with core', async () => {
      const input: RememberInput = {
        content: 'Invalid combination',
        scope: 'team',
        category: 'core',
      };

      await expect(remember(input, storage, projectId, agentId)).rejects.toThrow(PatternError);
    });

    it('should reject invalid scope/category: private with decisions', async () => {
      const input: RememberInput = {
        content: 'Invalid combination',
        scope: 'private',
        category: 'decisions',
      };

      await expect(remember(input, storage, projectId, agentId)).rejects.toThrow(PatternError);

      try {
        await remember(input, storage, projectId, agentId);
      } catch (error) {
        expect((error as PatternError).code).toBe(PatternErrorCode.INVALID_CATEGORY);
        expect((error as PatternError).message).toContain('not valid for private scope');
      }
    });

    it('should reject invalid scope/category: private with architecture', async () => {
      const input: RememberInput = {
        content: 'Invalid combination',
        scope: 'private',
        category: 'architecture',
      };

      await expect(remember(input, storage, projectId, agentId)).rejects.toThrow(PatternError);
    });

    it('should reject invalid scope/category: private with learnings', async () => {
      const input: RememberInput = {
        content: 'Invalid combination',
        scope: 'private',
        category: 'learnings',
      };

      await expect(remember(input, storage, projectId, agentId)).rejects.toThrow(PatternError);
    });
  });

  describe('Edge Cases', () => {
    it('should handle content at exactly max size (32KB)', async () => {
      const maxContent = 'a'.repeat(32 * 1024); // Exactly 32KB
      const input: RememberInput = {
        content: maxContent,
      };

      const result = await remember(input, storage, projectId, agentId);

      expect(result.memoryId).toBeDefined();
      expect(storage.set).toHaveBeenCalledTimes(1);

      const [, memory] = (storage.set as any).mock.calls[0];
      expect(memory.content).toBe(maxContent);
    });

    it('should handle special characters in content', async () => {
      const specialContent = 'Special chars: \n\t\r"\'\\中文🎉@#$%^&*()';
      const input: RememberInput = {
        content: specialContent,
      };

      const result = await remember(input, storage, projectId, agentId);

      expect(result.memoryId).toBeDefined();

      const [, memory] = (storage.set as any).mock.calls[0];
      expect(memory.content).toBe(specialContent);
    });

    it('should handle Unicode content correctly for size calculation', async () => {
      // Some Unicode characters take multiple bytes
      const unicodeContent = '你好世界'.repeat(10000); // Chinese characters
      const input: RememberInput = {
        content: unicodeContent,
      };

      const byteLength = Buffer.byteLength(unicodeContent, 'utf8');

      if (byteLength > 32 * 1024) {
        await expect(remember(input, storage, projectId, agentId)).rejects.toThrow(PatternError);
      } else {
        const result = await remember(input, storage, projectId, agentId);
        expect(result.memoryId).toBeDefined();
      }
    });

    it('should handle content with only newlines', async () => {
      const input: RememberInput = {
        content: '\n\n\n',
      };

      // This should be rejected as empty (whitespace-only)
      await expect(remember(input, storage, projectId, agentId)).rejects.toThrow(
        'Content cannot be empty'
      );
    });

    it('should handle very long single-line content', async () => {
      const longLine = 'x'.repeat(10000); // 10KB single line
      const input: RememberInput = {
        content: longLine,
      };

      const result = await remember(input, storage, projectId, agentId);
      expect(result.memoryId).toBeDefined();
    });

    it('should handle metadata with empty arrays', async () => {
      const input: RememberInput = {
        content: 'Memory with empty metadata',
        metadata: {
          tags: [],
          relatedTo: [],
        },
      };

      const result = await remember(input, storage, projectId, agentId);

      const [, memory] = (storage.set as any).mock.calls[0];
      expect(memory.metadata).toEqual({
        tags: [],
        relatedTo: [],
      });
    });

    it('should not include metadata field if not provided', async () => {
      const input: RememberInput = {
        content: 'Memory without metadata',
      };

      await remember(input, storage, projectId, agentId);

      const [, memory] = (storage.set as any).mock.calls[0];
      expect(memory.metadata).toBeUndefined();
    });

    it('should generate unique IDs for concurrent calls', async () => {
      const input: RememberInput = {
        content: 'Concurrent memory',
      };

      const promises = Array(10)
        .fill(null)
        .map(() => remember(input, storage, projectId, agentId));

      const results = await Promise.all(promises);
      const ids = results.map((r) => r.memoryId);

      // All IDs should be unique
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(10);
    });

    it('should handle single character content', async () => {
      const input: RememberInput = {
        content: 'x',
      };

      const result = await remember(input, storage, projectId, agentId);
      expect(result.memoryId).toBeDefined();

      const [, memory] = (storage.set as any).mock.calls[0];
      expect(memory.content).toBe('x');
    });

    it('should preserve exact timestamp order for createdAt and updatedAt', async () => {
      const input: RememberInput = {
        content: 'Test timestamp',
      };

      await remember(input, storage, projectId, agentId);

      const [, memory] = (storage.set as any).mock.calls[0];
      expect(memory.createdAt).toBe(memory.updatedAt);
      expect(new Date(memory.createdAt).getTime()).toBeLessThanOrEqual(Date.now());
    });

    it('should handle metadata with all fields', async () => {
      const input: RememberInput = {
        content: 'Comprehensive metadata',
        metadata: {
          tags: ['tag1', 'tag2', 'tag3'],
          priority: 2,
          relatedTo: ['mem-1', 'mem-2'],
          source: 'test-source',
        },
      };

      await remember(input, storage, projectId, agentId);

      const [, memory] = (storage.set as any).mock.calls[0];
      expect(memory.metadata).toEqual({
        tags: ['tag1', 'tag2', 'tag3'],
        priority: 2,
        relatedTo: ['mem-1', 'mem-2'],
        source: 'test-source',
      });
    });
  });

  describe('TTL Behavior', () => {
    it('should calculate correct expiresAt for recent category', async () => {
      const beforeCall = Date.now();
      const input: RememberInput = {
        content: 'Recent memory',
        category: 'recent',
      };

      const result = await remember(input, storage, projectId, agentId);

      expect(result.expiresAt).toBeDefined();
      const expiresAt = new Date(result.expiresAt!).getTime();
      const expectedExpiry = beforeCall + 86400 * 1000; // 24 hours

      // Should be within 1 second of expected
      expect(Math.abs(expiresAt - expectedExpiry)).toBeLessThan(1000);
    });

    it('should calculate correct expiresAt for tasks category', async () => {
      const beforeCall = Date.now();
      const input: RememberInput = {
        content: 'Task memory',
        category: 'tasks',
      };

      const result = await remember(input, storage, projectId, agentId);

      expect(result.expiresAt).toBeDefined();
      const expiresAt = new Date(result.expiresAt!).getTime();
      const expectedExpiry = beforeCall + 86400 * 1000; // 24 hours

      expect(Math.abs(expiresAt - expectedExpiry)).toBeLessThan(1000);
    });

    it('should not set expiresAt for longterm category', async () => {
      const input: RememberInput = {
        content: 'Longterm memory',
        category: 'longterm',
      };

      const result = await remember(input, storage, projectId, agentId);

      expect(result.expiresAt).toBeUndefined();

      const [, memory] = (storage.set as any).mock.calls[0];
      expect(memory.expiresAt).toBeUndefined();
    });

    it('should not set expiresAt for core category', async () => {
      const input: RememberInput = {
        content: 'Core memory',
        category: 'core',
      };

      const result = await remember(input, storage, projectId, agentId);

      expect(result.expiresAt).toBeUndefined();
    });

    it('should not set expiresAt for shared categories', async () => {
      const categories = ['decisions', 'architecture', 'learnings'] as const;

      for (const category of categories) {
        const input: RememberInput = {
          content: `Shared ${category}`,
          scope: 'team',
          category,
        };

        const result = await remember(input, storage, projectId, agentId);
        expect(result.expiresAt).toBeUndefined();
      }
    });
  });

  describe('Storage Key Generation', () => {
    it('should generate correct key for private memories', async () => {
      const input: RememberInput = {
        content: 'Private memory',
        scope: 'private',
        category: 'recent',
      };

      const result = await remember(input, storage, projectId, agentId);

      const [key] = (storage.set as any).mock.calls[0];
      expect(key).toBe(`agents/${agentId}/recent/${result.memoryId}`);
    });

    it('should generate correct key for shared memories', async () => {
      const input: RememberInput = {
        content: 'Shared memory',
        scope: 'team',
        category: 'decisions',
      };

      const result = await remember(input, storage, projectId, agentId);

      const [key] = (storage.set as any).mock.calls[0];
      expect(key).toBe(`shared/decisions/${result.memoryId}`);
    });
  });
});
