/**
 * Tests for core-memory tool
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { coreMemory, type CoreMemoryInput } from './core-memory.js';
import type { NatsKvBackend } from '../storage/nats-kv.js';
import type { Memory } from '../types.js';
import { PatternError, PatternErrorCode } from '../types.js';

describe('core-memory tool', () => {
  let mockStorage: NatsKvBackend;
  const projectId = 'test-project';
  const agentId = 'test-agent-123';

  beforeEach(() => {
    // Create mock storage
    mockStorage = {
      keysFromProject: vi.fn(),
      set: vi.fn(),
    } as unknown as NatsKvBackend;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Happy Path Scenarios', () => {
    it('should create a core memory with valid content', async () => {
      // Mock no existing core memories
      vi.mocked(mockStorage.keysFromProject).mockResolvedValue([]);
      vi.mocked(mockStorage.set).mockResolvedValue();

      const input: CoreMemoryInput = {
        content: 'I am Claude, an AI assistant created by Anthropic.',
      };

      const result = await coreMemory(input, mockStorage, projectId, agentId);

      expect(result.memoryId).toBeDefined();
      expect(result.memoryId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );

      // Verify keysFromProject was called to check limit
      expect(mockStorage.keysFromProject).toHaveBeenCalledWith(
        `agents/${agentId}/core/`,
        projectId
      );

      // Verify memory was stored
      expect(mockStorage.set).toHaveBeenCalledWith(
        `agents/${agentId}/core/${result.memoryId}`,
        expect.objectContaining({
          id: result.memoryId,
          agentId,
          projectId,
          scope: 'private',
          category: 'core',
          content: 'I am Claude, an AI assistant created by Anthropic.',
          version: 1,
        })
      );

      // Verify no TTL was set (no third parameter)
      const setCall = vi.mocked(mockStorage.set).mock.calls[0];
      expect(setCall[2]).toBeUndefined();

      // Verify no expiresAt in memory
      const storedMemory = setCall[1] as Memory;
      expect(storedMemory.expiresAt).toBeUndefined();
    });

    it('should create a core memory with metadata', async () => {
      vi.mocked(mockStorage.keysFromProject).mockResolvedValue([]);
      vi.mocked(mockStorage.set).mockResolvedValue();

      const input: CoreMemoryInput = {
        content: 'My primary goal is to be helpful, harmless, and honest.',
        metadata: {
          tags: ['identity', 'values'],
          priority: 1,
          source: 'user-conversation',
        },
      };

      const result = await coreMemory(input, mockStorage, projectId, agentId);

      expect(result.memoryId).toBeDefined();

      // Verify metadata was included
      expect(mockStorage.set).toHaveBeenCalledWith(
        `agents/${agentId}/core/${result.memoryId}`,
        expect.objectContaining({
          content: 'My primary goal is to be helpful, harmless, and honest.',
          metadata: {
            tags: ['identity', 'values'],
            priority: 1,
            source: 'user-conversation',
          },
        })
      );
    });

    it('should set createdAt and updatedAt timestamps', async () => {
      vi.mocked(mockStorage.keysFromProject).mockResolvedValue([]);
      vi.mocked(mockStorage.set).mockResolvedValue();

      const beforeTime = Date.now();

      const input: CoreMemoryInput = {
        content: 'Core memory content',
      };

      await coreMemory(input, mockStorage, projectId, agentId);

      const afterTime = Date.now();

      const setCall = vi.mocked(mockStorage.set).mock.calls[0];
      const storedMemory = setCall[1] as Memory;

      expect(storedMemory.createdAt).toBeDefined();
      expect(storedMemory.updatedAt).toBeDefined();
      expect(storedMemory.createdAt).toBe(storedMemory.updatedAt);

      // Verify timestamps are in valid range
      const createdTimestamp = new Date(storedMemory.createdAt).getTime();
      expect(createdTimestamp).toBeGreaterThanOrEqual(beforeTime);
      expect(createdTimestamp).toBeLessThanOrEqual(afterTime);
    });

    it('should allow creating core memory when under limit', async () => {
      // Mock 99 existing core memories (under the 100 limit)
      const existingKeys = Array.from({ length: 99 }, (_, i) =>
        `agents/${agentId}/core/memory-${i}`
      );
      vi.mocked(mockStorage.keysFromProject).mockResolvedValue(existingKeys);
      vi.mocked(mockStorage.set).mockResolvedValue();

      const input: CoreMemoryInput = {
        content: 'The 100th core memory',
      };

      const result = await coreMemory(input, mockStorage, projectId, agentId);

      expect(result.memoryId).toBeDefined();
      expect(mockStorage.set).toHaveBeenCalled();
    });

    it('should handle long content (up to 32KB)', async () => {
      vi.mocked(mockStorage.keysFromProject).mockResolvedValue([]);
      vi.mocked(mockStorage.set).mockResolvedValue();

      // Create content that is close to but under 32KB
      const longContent = 'A'.repeat(32 * 1024 - 100); // Leave some room for safety

      const input: CoreMemoryInput = {
        content: longContent,
      };

      const result = await coreMemory(input, mockStorage, projectId, agentId);

      expect(result.memoryId).toBeDefined();
      expect(mockStorage.set).toHaveBeenCalled();
    });
  });

  describe('Validation Errors', () => {
    it('should throw error when content is empty', async () => {
      const input: CoreMemoryInput = {
        content: '',
      };

      await expect(
        coreMemory(input, mockStorage, projectId, agentId)
      ).rejects.toThrow(PatternError);

      await expect(
        coreMemory(input, mockStorage, projectId, agentId)
      ).rejects.toMatchObject({
        code: PatternErrorCode.VALIDATION_ERROR,
        message: 'Content cannot be empty',
      });
    });

    it('should throw error when content is only whitespace', async () => {
      const input: CoreMemoryInput = {
        content: '   \n\t  ',
      };

      await expect(
        coreMemory(input, mockStorage, projectId, agentId)
      ).rejects.toThrow(PatternError);

      await expect(
        coreMemory(input, mockStorage, projectId, agentId)
      ).rejects.toMatchObject({
        code: PatternErrorCode.VALIDATION_ERROR,
        message: 'Content cannot be empty',
      });
    });

    it('should throw error when content exceeds 32KB', async () => {
      // Create content larger than 32KB
      const oversizedContent = 'A'.repeat(33 * 1024);

      const input: CoreMemoryInput = {
        content: oversizedContent,
      };

      await expect(
        coreMemory(input, mockStorage, projectId, agentId)
      ).rejects.toThrow(PatternError);

      await expect(
        coreMemory(input, mockStorage, projectId, agentId)
      ).rejects.toMatchObject({
        code: PatternErrorCode.VALIDATION_ERROR,
        message: expect.stringContaining('exceeds maximum'),
        details: expect.objectContaining({
          maxSize: 32 * 1024,
        }),
      });
    });

    it('should calculate byte size correctly for multi-byte characters', async () => {
      // Create content with unicode characters that uses multiple bytes per character
      // Each emoji is typically 4 bytes
      const emojiContent = '😀'.repeat(8 * 1024 + 1); // Over 32KB in bytes

      const input: CoreMemoryInput = {
        content: emojiContent,
      };

      await expect(
        coreMemory(input, mockStorage, projectId, agentId)
      ).rejects.toThrow(PatternError);

      await expect(
        coreMemory(input, mockStorage, projectId, agentId)
      ).rejects.toMatchObject({
        code: PatternErrorCode.VALIDATION_ERROR,
        message: expect.stringContaining('exceeds maximum'),
      });
    });
  });

  describe('Storage Full Errors', () => {
    it('should throw error when max core memories (100) is reached', async () => {
      // Mock 100 existing core memories (at the limit)
      const existingKeys = Array.from({ length: 100 }, (_, i) =>
        `agents/${agentId}/core/memory-${i}`
      );
      vi.mocked(mockStorage.keysFromProject).mockResolvedValue(existingKeys);

      const input: CoreMemoryInput = {
        content: 'One too many',
      };

      await expect(
        coreMemory(input, mockStorage, projectId, agentId)
      ).rejects.toThrow(PatternError);

      await expect(
        coreMemory(input, mockStorage, projectId, agentId)
      ).rejects.toMatchObject({
        code: PatternErrorCode.STORAGE_FULL,
        message: expect.stringContaining('Maximum number of core memories'),
        details: {
          currentCount: 100,
          maxCount: 100,
          agentId,
        },
      });

      // Verify set was never called
      expect(mockStorage.set).not.toHaveBeenCalled();
    });

    it('should throw error when core memories exceed limit', async () => {
      // Mock more than 100 existing core memories (shouldn't happen, but test defensive code)
      const existingKeys = Array.from({ length: 150 }, (_, i) =>
        `agents/${agentId}/core/memory-${i}`
      );
      vi.mocked(mockStorage.keysFromProject).mockResolvedValue(existingKeys);

      const input: CoreMemoryInput = {
        content: 'Cannot add',
      };

      await expect(
        coreMemory(input, mockStorage, projectId, agentId)
      ).rejects.toThrow(PatternError);

      await expect(
        coreMemory(input, mockStorage, projectId, agentId)
      ).rejects.toMatchObject({
        code: PatternErrorCode.STORAGE_FULL,
        details: {
          currentCount: 150,
          maxCount: 100,
        },
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle content exactly at 32KB limit', async () => {
      vi.mocked(mockStorage.keysFromProject).mockResolvedValue([]);
      vi.mocked(mockStorage.set).mockResolvedValue();

      // Create content that is exactly 32KB
      const exactContent = 'A'.repeat(32 * 1024);

      const input: CoreMemoryInput = {
        content: exactContent,
      };

      const result = await coreMemory(input, mockStorage, projectId, agentId);

      expect(result.memoryId).toBeDefined();
      expect(mockStorage.set).toHaveBeenCalled();
    });

    it('should handle content one byte over 32KB limit', async () => {
      // Create content that is exactly 32KB + 1 byte
      const overContent = 'A'.repeat(32 * 1024 + 1);

      const input: CoreMemoryInput = {
        content: overContent,
      };

      await expect(
        coreMemory(input, mockStorage, projectId, agentId)
      ).rejects.toThrow(PatternError);

      await expect(
        coreMemory(input, mockStorage, projectId, agentId)
      ).rejects.toMatchObject({
        code: PatternErrorCode.VALIDATION_ERROR,
      });
    });

    it('should handle metadata with empty arrays', async () => {
      vi.mocked(mockStorage.keysFromProject).mockResolvedValue([]);
      vi.mocked(mockStorage.set).mockResolvedValue();

      const input: CoreMemoryInput = {
        content: 'Core memory with empty metadata',
        metadata: {
          tags: [],
          relatedTo: [],
        },
      };

      const result = await coreMemory(input, mockStorage, projectId, agentId);

      expect(result.memoryId).toBeDefined();
      expect(mockStorage.set).toHaveBeenCalledWith(
        `agents/${agentId}/core/${result.memoryId}`,
        expect.objectContaining({
          metadata: {
            tags: [],
            relatedTo: [],
          },
        })
      );
    });

    it('should not include metadata property when metadata is undefined', async () => {
      vi.mocked(mockStorage.keysFromProject).mockResolvedValue([]);
      vi.mocked(mockStorage.set).mockResolvedValue();

      const input: CoreMemoryInput = {
        content: 'Core memory without metadata',
        // metadata is undefined
      };

      await coreMemory(input, mockStorage, projectId, agentId);

      const setCall = vi.mocked(mockStorage.set).mock.calls[0];
      const storedMemory = setCall[1] as Memory;
      expect(storedMemory.metadata).toBeUndefined();
    });

    it('should handle metadata with all priority levels', async () => {
      vi.mocked(mockStorage.keysFromProject).mockResolvedValue([]);
      vi.mocked(mockStorage.set).mockResolvedValue();

      for (const priority of [1, 2, 3] as const) {
        vi.clearAllMocks();
        vi.mocked(mockStorage.keysFromProject).mockResolvedValue([]);
        vi.mocked(mockStorage.set).mockResolvedValue();

        const input: CoreMemoryInput = {
          content: `Core memory with priority ${priority}`,
          metadata: {
            priority,
          },
        };

        const result = await coreMemory(input, mockStorage, projectId, agentId);

        expect(result.memoryId).toBeDefined();
        expect(mockStorage.set).toHaveBeenCalledWith(
          `agents/${agentId}/core/${result.memoryId}`,
          expect.objectContaining({
            metadata: {
              priority,
            },
          })
        );
      }
    });

    it('should generate unique UUIDs for each memory', async () => {
      vi.mocked(mockStorage.keysFromProject).mockResolvedValue([]);
      vi.mocked(mockStorage.set).mockResolvedValue();

      const ids = new Set<string>();

      // Create 10 memories and verify they all have unique IDs
      for (let i = 0; i < 10; i++) {
        const input: CoreMemoryInput = {
          content: `Core memory ${i}`,
        };

        const result = await coreMemory(input, mockStorage, projectId, agentId);
        expect(ids.has(result.memoryId)).toBe(false);
        ids.add(result.memoryId);
      }

      expect(ids.size).toBe(10);
    });

    it('should always set version to 1', async () => {
      vi.mocked(mockStorage.keysFromProject).mockResolvedValue([]);
      vi.mocked(mockStorage.set).mockResolvedValue();

      const input: CoreMemoryInput = {
        content: 'Core memory content',
      };

      await coreMemory(input, mockStorage, projectId, agentId);

      const setCall = vi.mocked(mockStorage.set).mock.calls[0];
      const storedMemory = setCall[1] as Memory;
      expect(storedMemory.version).toBe(1);
    });

    it('should always set scope to private', async () => {
      vi.mocked(mockStorage.keysFromProject).mockResolvedValue([]);
      vi.mocked(mockStorage.set).mockResolvedValue();

      const input: CoreMemoryInput = {
        content: 'Core memory content',
      };

      await coreMemory(input, mockStorage, projectId, agentId);

      const setCall = vi.mocked(mockStorage.set).mock.calls[0];
      const storedMemory = setCall[1] as Memory;
      expect(storedMemory.scope).toBe('private');
    });

    it('should always set category to core', async () => {
      vi.mocked(mockStorage.keysFromProject).mockResolvedValue([]);
      vi.mocked(mockStorage.set).mockResolvedValue();

      const input: CoreMemoryInput = {
        content: 'Core memory content',
      };

      await coreMemory(input, mockStorage, projectId, agentId);

      const setCall = vi.mocked(mockStorage.set).mock.calls[0];
      const storedMemory = setCall[1] as Memory;
      expect(storedMemory.category).toBe('core');
    });
  });
});
