/**
 * Tests for share_learning tool
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { shareLearning } from './share-learning.js';
import type { Memory } from '../types.js';
import { PatternError, PatternErrorCode } from '../types.js';
import type { NatsKvBackend } from '../storage/nats-kv.js';

// Mock logger
vi.mock('../logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Mock uuid
vi.mock('uuid', () => ({
  v4: () => 'new-shared-memory-id',
}));

describe('share_learning', () => {
  let mockStorage: NatsKvBackend;
  const projectId = 'test-project';
  const agentId = 'test-agent';

  beforeEach(() => {
    // Create a fresh mock storage for each test
    mockStorage = {
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(false),
      list: vi.fn().mockResolvedValue([]),
      keys: vi.fn().mockResolvedValue([]),
      ensureBucket: vi.fn().mockResolvedValue(undefined),
      isConnected: vi.fn().mockReturnValue(true),
      getFromProject: vi.fn().mockResolvedValue(null),
      deleteFromProject: vi.fn().mockResolvedValue(false),
      listFromProject: vi.fn().mockResolvedValue([]),
      keysFromProject: vi.fn().mockResolvedValue([]),
    } as unknown as NatsKvBackend;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Happy Path', () => {
    it('should share longterm memory with default category (learnings)', async () => {
      const privateMemory: Memory = {
        id: 'mem-1',
        agentId,
        projectId,
        scope: 'private',
        category: 'longterm',
        content: 'Important learning to share',
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z',
        version: 1,
      };

      vi.mocked(mockStorage.getFromProject).mockImplementation(async (key: string) => {
        if (key.includes('longterm') && key.includes('mem-1')) {
          return privateMemory;
        }
        return null;
      });

      vi.mocked(mockStorage.deleteFromProject).mockResolvedValue(true);

      const result = await shareLearning({ memoryId: 'mem-1' }, mockStorage, projectId, agentId);

      expect(result.sharedMemoryId).toBe('new-shared-memory-id');
      expect(result.originalDeleted).toBe(true);

      // Verify set was called with correct shared memory
      expect(mockStorage.set).toHaveBeenCalledWith(
        'shared/learnings/new-shared-memory-id',
        expect.objectContaining({
          id: 'new-shared-memory-id',
          scope: 'shared',
          category: 'learnings',
          content: 'Important learning to share',
          agentId, // Original agent preserved
        })
      );
    });

    it('should share core memory to decisions category', async () => {
      const privateMemory: Memory = {
        id: 'mem-2',
        agentId,
        projectId,
        scope: 'private',
        category: 'core',
        content: 'Core decision principle',
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z',
        version: 1,
      };

      vi.mocked(mockStorage.getFromProject).mockImplementation(async (key: string) => {
        if (key.includes('core') && key.includes('mem-2')) {
          return privateMemory;
        }
        return null;
      });

      vi.mocked(mockStorage.deleteFromProject).mockResolvedValue(true);

      const result = await shareLearning(
        { memoryId: 'mem-2', category: 'decisions' },
        mockStorage,
        projectId,
        agentId
      );

      expect(result.sharedMemoryId).toBe('new-shared-memory-id');
      expect(mockStorage.set).toHaveBeenCalledWith(
        'shared/decisions/new-shared-memory-id',
        expect.objectContaining({
          category: 'decisions',
        })
      );
    });

    it('should share to architecture category', async () => {
      const privateMemory: Memory = {
        id: 'mem-3',
        agentId,
        projectId,
        scope: 'private',
        category: 'longterm',
        content: 'Architecture pattern',
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z',
        version: 1,
      };

      vi.mocked(mockStorage.getFromProject).mockImplementation(async (key: string) => {
        if (key.includes('longterm') && key.includes('mem-3')) {
          return privateMemory;
        }
        return null;
      });

      vi.mocked(mockStorage.deleteFromProject).mockResolvedValue(true);

      const result = await shareLearning(
        { memoryId: 'mem-3', category: 'architecture' },
        mockStorage,
        projectId,
        agentId
      );

      expect(mockStorage.set).toHaveBeenCalledWith(
        'shared/architecture/new-shared-memory-id',
        expect.objectContaining({
          category: 'architecture',
        })
      );
    });

    it('should keep private copy when keepPrivate is true', async () => {
      const privateMemory: Memory = {
        id: 'mem-4',
        agentId,
        projectId,
        scope: 'private',
        category: 'longterm',
        content: 'Keep this private too',
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z',
        version: 1,
      };

      vi.mocked(mockStorage.getFromProject).mockImplementation(async (key: string) => {
        if (key.includes('longterm') && key.includes('mem-4')) {
          return privateMemory;
        }
        return null;
      });

      const result = await shareLearning(
        { memoryId: 'mem-4', keepPrivate: true },
        mockStorage,
        projectId,
        agentId
      );

      expect(result.sharedMemoryId).toBe('new-shared-memory-id');
      expect(result.originalDeleted).toBe(false);
      expect(mockStorage.deleteFromProject).not.toHaveBeenCalled();
    });

    it('should preserve metadata when sharing', async () => {
      const privateMemory: Memory = {
        id: 'mem-5',
        agentId,
        projectId,
        scope: 'private',
        category: 'longterm',
        content: 'Memory with metadata',
        metadata: {
          tags: ['important', 'shared'],
          priority: 1,
          source: 'user-input',
        },
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z',
        version: 1,
      };

      vi.mocked(mockStorage.getFromProject).mockImplementation(async (key: string) => {
        if (key.includes('longterm') && key.includes('mem-5')) {
          return privateMemory;
        }
        return null;
      });

      vi.mocked(mockStorage.deleteFromProject).mockResolvedValue(true);

      await shareLearning({ memoryId: 'mem-5' }, mockStorage, projectId, agentId);

      expect(mockStorage.set).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          metadata: {
            tags: ['important', 'shared'],
            priority: 1,
            source: 'user-input',
          },
        })
      );
    });
  });

  describe('Memory Search', () => {
    it('should search through all private categories to find memory', async () => {
      const privateMemory: Memory = {
        id: 'mem-search',
        agentId,
        projectId,
        scope: 'private',
        category: 'core',
        content: 'Found in core',
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z',
        version: 1,
      };

      // Mock to return null for recent, tasks, longterm, but found in core
      vi.mocked(mockStorage.getFromProject).mockImplementation(async (key: string) => {
        if (key.includes('core') && key.includes('mem-search')) {
          return privateMemory;
        }
        return null;
      });

      vi.mocked(mockStorage.deleteFromProject).mockResolvedValue(true);

      const result = await shareLearning(
        { memoryId: 'mem-search' },
        mockStorage,
        projectId,
        agentId
      );

      expect(result.sharedMemoryId).toBe('new-shared-memory-id');

      // Should have checked multiple categories
      expect(mockStorage.getFromProject).toHaveBeenCalledWith(
        expect.stringContaining('recent'),
        projectId
      );
      expect(mockStorage.getFromProject).toHaveBeenCalledWith(
        expect.stringContaining('tasks'),
        projectId
      );
      expect(mockStorage.getFromProject).toHaveBeenCalledWith(
        expect.stringContaining('longterm'),
        projectId
      );
      expect(mockStorage.getFromProject).toHaveBeenCalledWith(
        expect.stringContaining('core'),
        projectId
      );
    });
  });

  describe('Error Cases', () => {
    it('should throw error when memory not found', async () => {
      vi.mocked(mockStorage.getFromProject).mockResolvedValue(null);

      await expect(
        shareLearning({ memoryId: 'non-existent' }, mockStorage, projectId, agentId)
      ).rejects.toThrow(PatternError);

      await expect(
        shareLearning({ memoryId: 'non-existent' }, mockStorage, projectId, agentId)
      ).rejects.toThrow("Private memory with ID 'non-existent' not found");
    });

    it('should throw error for invalid shared category', async () => {
      await expect(
        shareLearning(
          { memoryId: 'mem-1', category: 'recent' as any },
          mockStorage,
          projectId,
          agentId
        )
      ).rejects.toThrow(PatternError);

      try {
        await shareLearning(
          { memoryId: 'mem-1', category: 'recent' as any },
          mockStorage,
          projectId,
          agentId
        );
      } catch (error) {
        expect((error as PatternError).code).toBe(PatternErrorCode.INVALID_CATEGORY);
      }
    });

    it('should throw error when trying to share recent memory', async () => {
      const recentMemory: Memory = {
        id: 'mem-recent',
        agentId,
        projectId,
        scope: 'private',
        category: 'recent',
        content: 'Recent memory',
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z',
        version: 1,
      };

      vi.mocked(mockStorage.getFromProject).mockImplementation(async (key: string) => {
        if (key.includes('recent') && key.includes('mem-recent')) {
          return recentMemory;
        }
        return null;
      });

      await expect(
        shareLearning({ memoryId: 'mem-recent' }, mockStorage, projectId, agentId)
      ).rejects.toThrow("Only 'longterm' and 'core' memories can be shared");
    });

    it('should throw error when trying to share tasks memory', async () => {
      const tasksMemory: Memory = {
        id: 'mem-task',
        agentId,
        projectId,
        scope: 'private',
        category: 'tasks',
        content: 'Task memory',
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z',
        version: 1,
      };

      vi.mocked(mockStorage.getFromProject).mockImplementation(async (key: string) => {
        if (key.includes('tasks') && key.includes('mem-task')) {
          return tasksMemory;
        }
        return null;
      });

      await expect(
        shareLearning({ memoryId: 'mem-task' }, mockStorage, projectId, agentId)
      ).rejects.toThrow(PatternError);

      try {
        await shareLearning({ memoryId: 'mem-task' }, mockStorage, projectId, agentId);
      } catch (error) {
        expect((error as PatternError).code).toBe(PatternErrorCode.INVALID_CATEGORY);
        expect((error as PatternError).details?.category).toBe('tasks');
      }
    });

    it('should warn when deletion fails but continue', async () => {
      const privateMemory: Memory = {
        id: 'mem-del-fail',
        agentId,
        projectId,
        scope: 'private',
        category: 'longterm',
        content: 'Deletion will fail',
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z',
        version: 1,
      };

      vi.mocked(mockStorage.getFromProject).mockImplementation(async (key: string) => {
        if (key.includes('longterm') && key.includes('mem-del-fail')) {
          return privateMemory;
        }
        return null;
      });

      // Simulate deletion failure
      vi.mocked(mockStorage.deleteFromProject).mockResolvedValue(false);

      const result = await shareLearning(
        { memoryId: 'mem-del-fail', keepPrivate: false },
        mockStorage,
        projectId,
        agentId
      );

      expect(result.sharedMemoryId).toBe('new-shared-memory-id');
      expect(result.originalDeleted).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should handle memory without metadata', async () => {
      const privateMemory: Memory = {
        id: 'mem-no-meta',
        agentId,
        projectId,
        scope: 'private',
        category: 'longterm',
        content: 'No metadata',
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z',
        version: 1,
      };

      vi.mocked(mockStorage.getFromProject).mockImplementation(async (key: string) => {
        if (key.includes('longterm') && key.includes('mem-no-meta')) {
          return privateMemory;
        }
        return null;
      });

      vi.mocked(mockStorage.deleteFromProject).mockResolvedValue(true);

      const result = await shareLearning(
        { memoryId: 'mem-no-meta' },
        mockStorage,
        projectId,
        agentId
      );

      expect(result.sharedMemoryId).toBe('new-shared-memory-id');

      // Verify metadata was not added to shared memory
      expect(mockStorage.set).toHaveBeenCalledWith(
        expect.any(String),
        expect.not.objectContaining({
          metadata: expect.anything(),
        })
      );
    });

    it('should preserve original agent ID in shared memory', async () => {
      const differentAgentId = 'different-agent';
      const privateMemory: Memory = {
        id: 'mem-agent',
        agentId: differentAgentId,
        projectId,
        scope: 'private',
        category: 'longterm',
        content: 'From different agent',
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z',
        version: 1,
      };

      vi.mocked(mockStorage.getFromProject).mockImplementation(async (key: string) => {
        if (key.includes('longterm') && key.includes('mem-agent') && key.includes(agentId)) {
          return privateMemory;
        }
        return null;
      });

      vi.mocked(mockStorage.deleteFromProject).mockResolvedValue(true);

      await shareLearning({ memoryId: 'mem-agent' }, mockStorage, projectId, agentId);

      expect(mockStorage.set).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          agentId: differentAgentId, // Original agent preserved
        })
      );
    });

    it('should set new createdAt and updatedAt timestamps', async () => {
      const privateMemory: Memory = {
        id: 'mem-time',
        agentId,
        projectId,
        scope: 'private',
        category: 'longterm',
        content: 'Old timestamps',
        createdAt: '2020-01-01T10:00:00Z',
        updatedAt: '2020-01-01T10:00:00Z',
        version: 1,
      };

      vi.mocked(mockStorage.getFromProject).mockImplementation(async (key: string) => {
        if (key.includes('longterm') && key.includes('mem-time')) {
          return privateMemory;
        }
        return null;
      });

      vi.mocked(mockStorage.deleteFromProject).mockResolvedValue(true);

      await shareLearning({ memoryId: 'mem-time' }, mockStorage, projectId, agentId);

      const setCalls = vi.mocked(mockStorage.set).mock.calls;
      const sharedMemory = setCalls[0][1] as Memory;

      // Timestamps should be new (not from 2020)
      expect(new Date(sharedMemory.createdAt).getFullYear()).toBeGreaterThan(2020);
      expect(new Date(sharedMemory.updatedAt).getFullYear()).toBeGreaterThan(2020);
    });

    it('should set version to 1 for new shared memory', async () => {
      const privateMemory: Memory = {
        id: 'mem-version',
        agentId,
        projectId,
        scope: 'private',
        category: 'longterm',
        content: 'Version test',
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z',
        version: 5, // High version
      };

      vi.mocked(mockStorage.getFromProject).mockImplementation(async (key: string) => {
        if (key.includes('longterm') && key.includes('mem-version')) {
          return privateMemory;
        }
        return null;
      });

      vi.mocked(mockStorage.deleteFromProject).mockResolvedValue(true);

      await shareLearning({ memoryId: 'mem-version' }, mockStorage, projectId, agentId);

      expect(mockStorage.set).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          version: 1, // Reset to 1 for new shared memory
        })
      );
    });
  });
});
