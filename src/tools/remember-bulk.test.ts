/**
 * Tests for remember-bulk tool
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { rememberBulk, type RememberBulkInput, type BulkMemoryInput } from './remember-bulk.js';
import type { NatsKvBackend } from '../storage/nats-kv.js';
import { PatternError, PatternErrorCode } from '../types.js';

// Mock logger
vi.mock('../logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock content scanner
vi.mock('../security/content-scanner.js', () => ({
  getDefaultScanner: () => ({
    scan: vi.fn().mockReturnValue({ hasWarnings: false, warnings: [] }),
    formatWarnings: vi.fn().mockReturnValue(''),
  }),
}));

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

describe('remember-bulk tool', () => {
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
    it('should store multiple valid memories', async () => {
      const memories: BulkMemoryInput[] = [
        { content: 'Memory 1' },
        { content: 'Memory 2', category: 'longterm' },
        { content: 'Memory 3', scope: 'team', category: 'decisions' },
      ];

      const input: RememberBulkInput = { memories };

      const result = await rememberBulk(input, storage, projectId, agentId);

      expect(result.stored).toBe(3);
      expect(result.failed).toBe(0);
      expect(result.errors).toHaveLength(0);
      expect(result.memoryIds).toHaveLength(3);
      expect(storage.set).toHaveBeenCalledTimes(3);

      // Verify all memory IDs are UUIDs
      result.memoryIds.forEach((id) => {
        expect(id).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
        );
      });
    });

    it('should store memories with different scopes', async () => {
      const memories: BulkMemoryInput[] = [
        { content: 'Private memory', scope: 'private', category: 'recent' },
        { content: 'Personal memory', scope: 'personal', category: 'core' },
        { content: 'Team memory', scope: 'team', category: 'decisions' },
        { content: 'Public memory', scope: 'public', category: 'learnings' },
      ];

      const input: RememberBulkInput = { memories };

      const result = await rememberBulk(input, storage, projectId, agentId);

      expect(result.stored).toBe(4);
      expect(result.failed).toBe(0);
      expect(result.memoryIds).toHaveLength(4);
      expect(storage.set).toHaveBeenCalledTimes(4);
    });

    it('should store memories with different categories', async () => {
      const memories: BulkMemoryInput[] = [
        { content: 'Recent note', category: 'recent' },
        { content: 'Task item', category: 'tasks' },
        { content: 'Long term insight', category: 'longterm' },
      ];

      const input: RememberBulkInput = { memories };

      const result = await rememberBulk(input, storage, projectId, agentId);

      expect(result.stored).toBe(3);
      expect(result.failed).toBe(0);
      expect(result.memoryIds).toHaveLength(3);
    });

    it('should store memories with metadata', async () => {
      const memories: BulkMemoryInput[] = [
        {
          content: 'Tagged memory',
          metadata: { tags: ['important', 'review'] },
        },
        {
          content: 'High priority task',
          metadata: { priority: 1 },
        },
        {
          content: 'Related memory',
          metadata: { relatedTo: ['uuid-1', 'uuid-2'], source: 'user-input' },
        },
      ];

      const input: RememberBulkInput = { memories };

      const result = await rememberBulk(input, storage, projectId, agentId);

      expect(result.stored).toBe(3);
      expect(result.failed).toBe(0);
      expect(result.memoryIds).toHaveLength(3);
    });

    it('should handle empty array gracefully', async () => {
      const input: RememberBulkInput = { memories: [] };

      const result = await rememberBulk(input, storage, projectId, agentId);

      expect(result.stored).toBe(0);
      expect(result.failed).toBe(0);
      expect(result.errors).toHaveLength(0);
      expect(result.memoryIds).toHaveLength(0);
      expect(storage.set).not.toHaveBeenCalled();
    });

    it('should store with validation disabled', async () => {
      const memories: BulkMemoryInput[] = [
        { content: 'Memory 1' },
        { content: 'Memory 2' },
      ];

      const input: RememberBulkInput = {
        memories,
        validate: false,
      };

      const result = await rememberBulk(input, storage, projectId, agentId);

      expect(result.stored).toBe(2);
      expect(result.failed).toBe(0);
      expect(storage.set).toHaveBeenCalledTimes(2);
    });
  });

  describe('Validation Scenarios', () => {
    it('should fail validation for empty content', async () => {
      const memories: BulkMemoryInput[] = [
        { content: 'Valid memory' },
        { content: '' },
        { content: '   ' },
      ];

      const input: RememberBulkInput = { memories, validate: true };

      await expect(rememberBulk(input, storage, projectId, agentId)).rejects.toThrow(
        PatternError
      );
      await expect(rememberBulk(input, storage, projectId, agentId)).rejects.toThrow(
        /Validation failed for 2 memories/
      );

      expect(storage.set).not.toHaveBeenCalled();
    });

    it('should fail validation for oversized content', async () => {
      const largeContent = 'x'.repeat(33 * 1024); // 33KB

      const memories: BulkMemoryInput[] = [{ content: largeContent }];

      const input: RememberBulkInput = { memories, validate: true };

      await expect(rememberBulk(input, storage, projectId, agentId)).rejects.toThrow(
        PatternError
      );
      await expect(rememberBulk(input, storage, projectId, agentId)).rejects.toThrow(
        /Validation failed/
      );

      expect(storage.set).not.toHaveBeenCalled();
    });

    it('should fail validation for invalid scope/category combinations', async () => {
      const memories: BulkMemoryInput[] = [
        { content: 'Invalid combo', scope: 'team', category: 'recent' },
      ];

      const input: RememberBulkInput = { memories, validate: true };

      await expect(rememberBulk(input, storage, projectId, agentId)).rejects.toThrow(
        PatternError
      );
      expect(storage.set).not.toHaveBeenCalled();
    });

    it('should fail validation for too many tags', async () => {
      const memories: BulkMemoryInput[] = [
        {
          content: 'Too many tags',
          metadata: {
            tags: Array(11).fill('tag'), // 11 tags (max is 10)
          },
        },
      ];

      const input: RememberBulkInput = { memories, validate: true };

      await expect(rememberBulk(input, storage, projectId, agentId)).rejects.toThrow(
        PatternError
      );
      expect(storage.set).not.toHaveBeenCalled();
    });

    it('should fail validation for oversized tags', async () => {
      const memories: BulkMemoryInput[] = [
        {
          content: 'Long tag',
          metadata: {
            tags: ['x'.repeat(51)], // 51 chars (max is 50)
          },
        },
      ];

      const input: RememberBulkInput = { memories, validate: true };

      await expect(rememberBulk(input, storage, projectId, agentId)).rejects.toThrow(
        PatternError
      );
      expect(storage.set).not.toHaveBeenCalled();
    });

    it('should fail validation for invalid priority', async () => {
      const memories: BulkMemoryInput[] = [
        {
          content: 'Invalid priority',
          metadata: {
            priority: 5 as any, // Invalid priority (must be 1, 2, or 3)
          },
        },
      ];

      const input: RememberBulkInput = { memories, validate: true };

      await expect(rememberBulk(input, storage, projectId, agentId)).rejects.toThrow(
        PatternError
      );
      expect(storage.set).not.toHaveBeenCalled();
    });

    it('should fail validation for non-array tags', async () => {
      const memories: BulkMemoryInput[] = [
        {
          content: 'Invalid tags',
          metadata: {
            tags: 'not-an-array' as any,
          },
        },
      ];

      const input: RememberBulkInput = { memories, validate: true };

      await expect(rememberBulk(input, storage, projectId, agentId)).rejects.toThrow(
        PatternError
      );
      expect(storage.set).not.toHaveBeenCalled();
    });

    it('should fail validation for non-string tags', async () => {
      const memories: BulkMemoryInput[] = [
        {
          content: 'Invalid tag types',
          metadata: {
            tags: [123, 456] as any,
          },
        },
      ];

      const input: RememberBulkInput = { memories, validate: true };

      await expect(rememberBulk(input, storage, projectId, agentId)).rejects.toThrow(
        PatternError
      );
      expect(storage.set).not.toHaveBeenCalled();
    });

    it('should fail validation for non-array relatedTo', async () => {
      const memories: BulkMemoryInput[] = [
        {
          content: 'Invalid relatedTo',
          metadata: {
            relatedTo: 'not-an-array' as any,
          },
        },
      ];

      const input: RememberBulkInput = { memories, validate: true };

      await expect(rememberBulk(input, storage, projectId, agentId)).rejects.toThrow(
        PatternError
      );
      expect(storage.set).not.toHaveBeenCalled();
    });

    it('should fail validation for non-string relatedTo IDs', async () => {
      const memories: BulkMemoryInput[] = [
        {
          content: 'Invalid relatedTo IDs',
          metadata: {
            relatedTo: [123, 456] as any,
          },
        },
      ];

      const input: RememberBulkInput = { memories, validate: true };

      await expect(rememberBulk(input, storage, projectId, agentId)).rejects.toThrow(
        PatternError
      );
      expect(storage.set).not.toHaveBeenCalled();
    });
  });

  describe('Error Handling Scenarios', () => {
    it('should continue on storage errors when stopOnError is false', async () => {
      const memories: BulkMemoryInput[] = [
        { content: 'Memory 1' },
        { content: 'Memory 2' },
        { content: 'Memory 3' },
      ];

      // Make the second storage call fail
      vi.mocked(storage.set)
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('Storage error'))
        .mockResolvedValueOnce(undefined);

      const input: RememberBulkInput = {
        memories,
        stopOnError: false,
      };

      const result = await rememberBulk(input, storage, projectId, agentId);

      expect(result.stored).toBe(2);
      expect(result.failed).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toMatchObject({
        index: 1,
        error: 'Storage error',
      });
      expect(result.memoryIds).toHaveLength(2);
      expect(storage.set).toHaveBeenCalledTimes(3);
    });

    it('should stop on first storage error when stopOnError is true', async () => {
      const memories: BulkMemoryInput[] = [
        { content: 'Memory 1' },
        { content: 'Memory 2' },
        { content: 'Memory 3' },
      ];

      // Make the second storage call fail
      vi.mocked(storage.set)
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('Storage error'));

      const input: RememberBulkInput = {
        memories,
        stopOnError: true,
      };

      const result = await rememberBulk(input, storage, projectId, agentId);

      expect(result.stored).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toMatchObject({
        index: 1,
        error: 'Storage error',
      });
      expect(result.memoryIds).toHaveLength(1);
      expect(storage.set).toHaveBeenCalledTimes(2); // Stopped after second
    });

    it('should handle all failures gracefully', async () => {
      const memories: BulkMemoryInput[] = [
        { content: 'Memory 1' },
        { content: 'Memory 2' },
      ];

      // Make all storage calls fail
      vi.mocked(storage.set).mockRejectedValue(new Error('All storage failed'));

      const input: RememberBulkInput = {
        memories,
        stopOnError: false,
      };

      const result = await rememberBulk(input, storage, projectId, agentId);

      expect(result.stored).toBe(0);
      expect(result.failed).toBe(2);
      expect(result.errors).toHaveLength(2);
      expect(result.memoryIds).toHaveLength(0);
    });

    it('should collect all errors with correct indices', async () => {
      const memories: BulkMemoryInput[] = [
        { content: 'Memory 1' },
        { content: 'Memory 2' },
        { content: 'Memory 3' },
        { content: 'Memory 4' },
      ];

      // Make specific storage calls fail
      vi.mocked(storage.set)
        .mockResolvedValueOnce(undefined) // 0: success
        .mockRejectedValueOnce(new Error('Error 1')) // 1: fail
        .mockResolvedValueOnce(undefined) // 2: success
        .mockRejectedValueOnce(new Error('Error 2')); // 3: fail

      const input: RememberBulkInput = {
        memories,
        stopOnError: false,
      };

      const result = await rememberBulk(input, storage, projectId, agentId);

      expect(result.stored).toBe(2);
      expect(result.failed).toBe(2);
      expect(result.errors).toHaveLength(2);
      expect(result.errors[0]).toMatchObject({
        index: 1,
        error: 'Error 1',
      });
      expect(result.errors[1]).toMatchObject({
        index: 3,
        error: 'Error 2',
      });
    });
  });

  describe('Partial Success Scenarios', () => {
    it('should return partial results when some succeed and some fail', async () => {
      const memories: BulkMemoryInput[] = [
        { content: 'Valid memory 1' },
        { content: 'Valid memory 2' },
        { content: 'Valid memory 3' },
      ];

      // Make middle one fail
      vi.mocked(storage.set)
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('Storage failed'))
        .mockResolvedValueOnce(undefined);

      const input: RememberBulkInput = {
        memories,
        stopOnError: false,
      };

      const result = await rememberBulk(input, storage, projectId, agentId);

      expect(result.stored).toBe(2);
      expect(result.failed).toBe(1);
      expect(result.memoryIds).toHaveLength(2);
      expect(result.errors).toHaveLength(1);
    });
  });

  describe('Content Scanning Integration', () => {
    it('should work with content scanning enabled', async () => {
      const memories: BulkMemoryInput[] = [
        { content: 'Memory 1' },
        { content: 'Memory 2' },
      ];

      const input: RememberBulkInput = { memories };

      const config = {
        natsUrl: 'nats://localhost:4222',
        projectId,
        contentScanning: { enabled: true },
      };

      const result = await rememberBulk(input, storage, projectId, agentId, config);

      expect(result.stored).toBe(2);
      expect(result.failed).toBe(0);
    });

    it('should work with content scanning disabled', async () => {
      const memories: BulkMemoryInput[] = [
        { content: 'Memory 1' },
        { content: 'Memory 2' },
      ];

      const input: RememberBulkInput = { memories };

      const config = {
        natsUrl: 'nats://localhost:4222',
        projectId,
        contentScanning: { enabled: false },
      };

      const result = await rememberBulk(input, storage, projectId, agentId, config);

      expect(result.stored).toBe(2);
      expect(result.failed).toBe(0);
    });
  });

  describe('Retrievability Verification', () => {
    it('should store memories that are retrievable', async () => {
      const memories: BulkMemoryInput[] = [
        { content: 'Memory 1', category: 'longterm' },
        { content: 'Memory 2', category: 'longterm' },
      ];

      const input: RememberBulkInput = { memories };

      const result = await rememberBulk(input, storage, projectId, agentId);

      expect(result.stored).toBe(2);
      expect(result.memoryIds).toHaveLength(2);

      // Verify storage.set was called with correct keys
      const calls = vi.mocked(storage.set).mock.calls;
      expect(calls).toHaveLength(2);

      calls.forEach((call, index) => {
        const [key, memory] = call;
        expect(key).toContain(`agents/${agentId}/longterm/`);
        expect(memory).toMatchObject({
          id: result.memoryIds[index],
          content: memories[index].content,
          category: 'longterm',
        });
      });
    });
  });
});
