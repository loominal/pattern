/**
 * Tests for recall_context tool
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { recallContext } from './recall-context.js';
import type { Memory, MemoryCategory } from '../types.js';
import type { StorageBackend } from '../storage/interface.js';

// Mock logger
vi.mock('../logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

describe('recall_context', () => {
  let mockStorage: StorageBackend;
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
      // New multi-bucket methods
      getFromUserBucket: vi.fn().mockResolvedValue(null),
      listFromUserBucket: vi.fn().mockResolvedValue([]),
      keysFromUserBucket: vi.fn().mockResolvedValue([]),
      deleteFromUserBucket: vi.fn().mockResolvedValue(false),
      getFromGlobalBucket: vi.fn().mockResolvedValue(null),
      listFromGlobalBucket: vi.fn().mockResolvedValue([]),
      keysFromGlobalBucket: vi.fn().mockResolvedValue([]),
      deleteFromGlobalBucket: vi.fn().mockResolvedValue(false),
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Happy Path', () => {
    it('should recall private memories with default options', async () => {
      const privateMemories: Memory[] = [
        {
          id: 'mem-1',
          agentId,
          projectId,
          scope: 'private',
          category: 'recent',
          content: 'Recent memory 1',
          createdAt: '2025-01-01T10:00:00Z',
          updatedAt: '2025-01-01T10:00:00Z',
          version: 1,
        },
        {
          id: 'mem-2',
          agentId,
          projectId,
          scope: 'private',
          category: 'core',
          content: 'Core memory 1',
          createdAt: '2025-01-01T09:00:00Z',
          updatedAt: '2025-01-01T09:00:00Z',
          version: 1,
        },
      ];

      vi.mocked(mockStorage.listFromProject).mockImplementation(async (prefix: string) => {
        if (prefix === `agents/${agentId}/`) {
          return privateMemories;
        }
        return [];
      });

      const result = await recallContext(mockStorage, projectId, agentId);

      expect(result.private).toHaveLength(2);
      expect(result.team).toHaveLength(0);
      expect(result.counts.private).toBe(2);
      expect(result.counts.team).toBe(0);
      expect(result.counts.expired).toBe(0);
      expect(result.summary).toContain('core');
      expect(result.summary).toContain('recent');
    });

    it('should recall shared memories with default options', async () => {
      const sharedMemories: Memory[] = [
        {
          id: 'mem-3',
          agentId: 'other-agent',
          projectId,
          scope: 'team',
          category: 'decisions',
          content: 'Important decision',
          createdAt: '2025-01-01T08:00:00Z',
          updatedAt: '2025-01-01T08:00:00Z',
          version: 1,
        },
      ];

      vi.mocked(mockStorage.listFromProject).mockImplementation(async (prefix: string) => {
        if (prefix === 'shared/') {
          return sharedMemories;
        }
        return [];
      });

      const result = await recallContext(mockStorage, projectId, agentId);

      expect(result.private).toHaveLength(0);
      expect(result.team).toHaveLength(1);
      expect(result.counts.private).toBe(0);
      expect(result.counts.team).toBe(1);
      expect(result.counts.expired).toBe(0);
      expect(result.summary).toContain('decisions');
    });

    it('should recall both private and shared memories', async () => {
      const privateMemories: Memory[] = [
        {
          id: 'mem-1',
          agentId,
          projectId,
          scope: 'private',
          category: 'tasks',
          content: 'Task 1',
          createdAt: '2025-01-01T10:00:00Z',
          updatedAt: '2025-01-01T10:00:00Z',
          version: 1,
        },
      ];

      const sharedMemories: Memory[] = [
        {
          id: 'mem-2',
          agentId: 'other-agent',
          projectId,
          scope: 'team',
          category: 'learnings',
          content: 'Learning 1',
          createdAt: '2025-01-01T09:00:00Z',
          updatedAt: '2025-01-01T09:00:00Z',
          version: 1,
        },
      ];

      vi.mocked(mockStorage.listFromProject).mockImplementation(async (prefix: string) => {
        if (prefix === `agents/${agentId}/`) {
          return privateMemories;
        }
        if (prefix === 'shared/') {
          return sharedMemories;
        }
        return [];
      });

      const result = await recallContext(mockStorage, projectId, agentId, {
        scopes: ['private', 'personal', 'team', 'public'],
      });

      expect(result.private).toHaveLength(1);
      expect(result.team).toHaveLength(1);
      expect(result.counts.private).toBe(1);
      expect(result.counts.team).toBe(1);
    });
  });

  describe('Scope Filtering', () => {
    it('should filter for private scope only', async () => {
      const privateMemories: Memory[] = [
        {
          id: 'mem-1',
          agentId,
          projectId,
          scope: 'private',
          category: 'recent',
          content: 'Private memory',
          createdAt: '2025-01-01T10:00:00Z',
          updatedAt: '2025-01-01T10:00:00Z',
          version: 1,
        },
      ];

      vi.mocked(mockStorage.listFromProject).mockResolvedValue(privateMemories);

      const result = await recallContext(mockStorage, projectId, agentId, {
        scopes: ['private'],
      });

      expect(mockStorage.listFromProject).toHaveBeenCalledWith(`agents/${agentId}/`, projectId);
      expect(result.private).toHaveLength(1);
      expect(result.team).toHaveLength(0);
    });

    it('should filter for team scope only', async () => {
      const teamMemories: Memory[] = [
        {
          id: 'mem-1',
          agentId: 'other-agent',
          projectId,
          scope: 'team',
          category: 'decisions',
          content: 'Team memory',
          createdAt: '2025-01-01T10:00:00Z',
          updatedAt: '2025-01-01T10:00:00Z',
          version: 1,
        },
      ];

      vi.mocked(mockStorage.listFromProject).mockResolvedValue(teamMemories);

      const result = await recallContext(mockStorage, projectId, agentId, {
        scopes: ['team'],
      });

      expect(mockStorage.listFromProject).toHaveBeenCalledWith('shared/', projectId);
      expect(result.private).toHaveLength(0);
      expect(result.team).toHaveLength(1);
    });
  });

  describe('Category Filtering', () => {
    it('should filter by single category', async () => {
      const memories: Memory[] = [
        {
          id: 'mem-1',
          agentId,
          projectId,
          scope: 'private',
          category: 'core',
          content: 'Core memory',
          createdAt: '2025-01-01T10:00:00Z',
          updatedAt: '2025-01-01T10:00:00Z',
          version: 1,
        },
        {
          id: 'mem-2',
          agentId,
          projectId,
          scope: 'private',
          category: 'recent',
          content: 'Recent memory',
          createdAt: '2025-01-01T09:00:00Z',
          updatedAt: '2025-01-01T09:00:00Z',
          version: 1,
        },
      ];

      vi.mocked(mockStorage.listFromProject).mockImplementation(async (prefix: string) => {
        if (prefix === `agents/${agentId}/`) {
          return memories;
        }
        return [];
      });

      const result = await recallContext(mockStorage, projectId, agentId, {
        categories: ['core'],
      });

      expect(result.private).toHaveLength(1);
      expect(result.private[0].category).toBe('core');
    });

    it('should filter by multiple categories', async () => {
      const memories: Memory[] = [
        {
          id: 'mem-1',
          agentId,
          projectId,
          scope: 'private',
          category: 'core',
          content: 'Core memory',
          createdAt: '2025-01-01T10:00:00Z',
          updatedAt: '2025-01-01T10:00:00Z',
          version: 1,
        },
        {
          id: 'mem-2',
          agentId,
          projectId,
          scope: 'private',
          category: 'tasks',
          content: 'Task memory',
          createdAt: '2025-01-01T09:00:00Z',
          updatedAt: '2025-01-01T09:00:00Z',
          version: 1,
        },
        {
          id: 'mem-3',
          agentId,
          projectId,
          scope: 'private',
          category: 'recent',
          content: 'Recent memory',
          createdAt: '2025-01-01T08:00:00Z',
          updatedAt: '2025-01-01T08:00:00Z',
          version: 1,
        },
      ];

      vi.mocked(mockStorage.listFromProject).mockImplementation(async (prefix: string) => {
        if (prefix === `agents/${agentId}/`) {
          return memories;
        }
        return [];
      });

      const result = await recallContext(mockStorage, projectId, agentId, {
        categories: ['core', 'tasks'],
      });

      expect(result.private).toHaveLength(2);
      const categories = result.private.map((m) => m.category);
      expect(categories).toContain('core');
      expect(categories).toContain('tasks');
      expect(categories).not.toContain('recent');
    });
  });

  describe('Limit Enforcement', () => {
    it('should enforce default limit of 50', async () => {
      const memories: Memory[] = Array.from({ length: 100 }, (_, i) => ({
        id: `mem-${i}`,
        agentId,
        projectId,
        scope: 'private' as const,
        category: 'recent' as MemoryCategory,
        content: `Memory ${i}`,
        createdAt: `2025-01-01T${String(i % 24).padStart(2, '0')}:00:00Z`,
        updatedAt: `2025-01-01T${String(i % 24).padStart(2, '0')}:00:00Z`,
        version: 1,
      }));

      vi.mocked(mockStorage.listFromProject).mockResolvedValue(memories);

      const result = await recallContext(mockStorage, projectId, agentId);

      expect(result.private.length).toBe(50);
    });

    it('should enforce custom limit', async () => {
      const memories: Memory[] = Array.from({ length: 100 }, (_, i) => ({
        id: `mem-${i}`,
        agentId,
        projectId,
        scope: 'private' as const,
        category: 'recent' as MemoryCategory,
        content: `Memory ${i}`,
        createdAt: `2025-01-01T${String(i % 24).padStart(2, '0')}:00:00Z`,
        updatedAt: `2025-01-01T${String(i % 24).padStart(2, '0')}:00:00Z`,
        version: 1,
      }));

      vi.mocked(mockStorage.listFromProject).mockResolvedValue(memories);

      const result = await recallContext(mockStorage, projectId, agentId, {
        limit: 25,
      });

      expect(result.private.length).toBe(25);
    });

    it('should enforce max limit of 200', async () => {
      const memories: Memory[] = Array.from({ length: 250 }, (_, i) => ({
        id: `mem-${i}`,
        agentId,
        projectId,
        scope: 'private' as const,
        category: 'recent' as MemoryCategory,
        content: `Memory ${i}`,
        createdAt: `2025-01-01T${String(i % 24).padStart(2, '0')}:00:00Z`,
        updatedAt: `2025-01-01T${String(i % 24).padStart(2, '0')}:00:00Z`,
        version: 1,
      }));

      vi.mocked(mockStorage.listFromProject).mockResolvedValue(memories);

      const result = await recallContext(mockStorage, projectId, agentId, {
        limit: 300, // Request more than max
      });

      expect(result.private.length).toBe(200);
    });

    it('should enforce minimum limit of 1', async () => {
      const memories: Memory[] = [
        {
          id: 'mem-1',
          agentId,
          projectId,
          scope: 'private',
          category: 'recent',
          content: 'Memory 1',
          createdAt: '2025-01-01T10:00:00Z',
          updatedAt: '2025-01-01T10:00:00Z',
          version: 1,
        },
      ];

      vi.mocked(mockStorage.listFromProject).mockResolvedValue(memories);

      const result = await recallContext(mockStorage, projectId, agentId, {
        limit: 0, // Request zero
      });

      expect(result.private.length).toBe(1);
    });
  });

  describe('Since Timestamp Filtering', () => {
    it('should filter memories by since timestamp', async () => {
      const memories: Memory[] = [
        {
          id: 'mem-1',
          agentId,
          projectId,
          scope: 'private',
          category: 'recent',
          content: 'Old memory',
          createdAt: '2025-01-01T08:00:00Z',
          updatedAt: '2025-01-01T08:00:00Z',
          version: 1,
        },
        {
          id: 'mem-2',
          agentId,
          projectId,
          scope: 'private',
          category: 'recent',
          content: 'New memory',
          createdAt: '2025-01-01T12:00:00Z',
          updatedAt: '2025-01-01T12:00:00Z',
          version: 1,
        },
      ];

      vi.mocked(mockStorage.listFromProject).mockImplementation(async (prefix: string) => {
        if (prefix === `agents/${agentId}/`) {
          return memories;
        }
        return [];
      });

      const result = await recallContext(mockStorage, projectId, agentId, {
        since: '2025-01-01T10:00:00Z',
      });

      expect(result.private).toHaveLength(1);
      expect(result.private[0].id).toBe('mem-2');
    });

    it('should return empty array when no memories match since filter', async () => {
      const memories: Memory[] = [
        {
          id: 'mem-1',
          agentId,
          projectId,
          scope: 'private',
          category: 'recent',
          content: 'Old memory',
          createdAt: '2025-01-01T08:00:00Z',
          updatedAt: '2025-01-01T08:00:00Z',
          version: 1,
        },
      ];

      vi.mocked(mockStorage.listFromProject).mockResolvedValue(memories);

      const result = await recallContext(mockStorage, projectId, agentId, {
        since: '2025-01-02T00:00:00Z',
      });

      expect(result.private).toHaveLength(0);
    });
  });

  describe('Expired Memories', () => {
    it('should filter out expired memories', async () => {
      const now = new Date();
      const memories: Memory[] = [
        {
          id: 'mem-1',
          agentId,
          projectId,
          scope: 'private',
          category: 'recent',
          content: 'Active memory',
          createdAt: '2025-01-01T08:00:00Z',
          updatedAt: '2025-01-01T08:00:00Z',
          version: 1,
        },
        {
          id: 'mem-2',
          agentId,
          projectId,
          scope: 'private',
          category: 'tasks',
          content: 'Expired memory',
          createdAt: '2025-01-01T07:00:00Z',
          updatedAt: '2025-01-01T07:00:00Z',
          expiresAt: new Date(now.getTime() - 1000).toISOString(), // Expired 1 second ago
          version: 1,
        },
      ];

      vi.mocked(mockStorage.listFromProject).mockImplementation(async (prefix: string) => {
        if (prefix === `agents/${agentId}/`) {
          return memories;
        }
        return [];
      });

      const result = await recallContext(mockStorage, projectId, agentId);

      expect(result.private).toHaveLength(1);
      expect(result.private[0].id).toBe('mem-1');
      expect(result.counts.expired).toBe(1);
    });

    it('should count expired memories separately', async () => {
      const now = new Date();
      const memories: Memory[] = [
        {
          id: 'mem-1',
          agentId,
          projectId,
          scope: 'private',
          category: 'recent',
          content: 'Active memory',
          createdAt: '2025-01-01T08:00:00Z',
          updatedAt: '2025-01-01T08:00:00Z',
          version: 1,
        },
        {
          id: 'mem-2',
          agentId,
          projectId,
          scope: 'private',
          category: 'tasks',
          content: 'Expired 1',
          createdAt: '2025-01-01T07:00:00Z',
          updatedAt: '2025-01-01T07:00:00Z',
          expiresAt: new Date(now.getTime() - 1000).toISOString(),
          version: 1,
        },
        {
          id: 'mem-3',
          agentId,
          projectId,
          scope: 'private',
          category: 'tasks',
          content: 'Expired 2',
          createdAt: '2025-01-01T06:00:00Z',
          updatedAt: '2025-01-01T06:00:00Z',
          expiresAt: new Date(now.getTime() - 2000).toISOString(),
          version: 1,
        },
      ];

      vi.mocked(mockStorage.listFromProject).mockImplementation(async (prefix: string) => {
        if (prefix === `agents/${agentId}/`) {
          return memories;
        }
        return [];
      });

      const result = await recallContext(mockStorage, projectId, agentId);

      expect(result.private).toHaveLength(1);
      expect(result.counts.expired).toBe(2);
    });
  });

  describe('Priority Sorting', () => {
    it('should sort by category priority (core > longterm > recent)', async () => {
      const memories: Memory[] = [
        {
          id: 'mem-1',
          agentId,
          projectId,
          scope: 'private',
          category: 'recent',
          content: 'Recent',
          createdAt: '2025-01-01T10:00:00Z',
          updatedAt: '2025-01-01T10:00:00Z',
          version: 1,
        },
        {
          id: 'mem-2',
          agentId,
          projectId,
          scope: 'private',
          category: 'core',
          content: 'Core',
          createdAt: '2025-01-01T09:00:00Z',
          updatedAt: '2025-01-01T09:00:00Z',
          version: 1,
        },
        {
          id: 'mem-3',
          agentId,
          projectId,
          scope: 'private',
          category: 'longterm',
          content: 'Long term',
          createdAt: '2025-01-01T08:00:00Z',
          updatedAt: '2025-01-01T08:00:00Z',
          version: 1,
        },
      ];

      vi.mocked(mockStorage.listFromProject).mockImplementation(async (prefix: string) => {
        if (prefix === `agents/${agentId}/`) {
          return memories;
        }
        return [];
      });

      const result = await recallContext(mockStorage, projectId, agentId);

      expect(result.private[0].category).toBe('core');
      expect(result.private[1].category).toBe('longterm');
      expect(result.private[2].category).toBe('recent');
    });

    it('should sort by updatedAt within same category (newer first)', async () => {
      const memories: Memory[] = [
        {
          id: 'mem-1',
          agentId,
          projectId,
          scope: 'private',
          category: 'recent',
          content: 'Older',
          createdAt: '2025-01-01T08:00:00Z',
          updatedAt: '2025-01-01T08:00:00Z',
          version: 1,
        },
        {
          id: 'mem-2',
          agentId,
          projectId,
          scope: 'private',
          category: 'recent',
          content: 'Newer',
          createdAt: '2025-01-01T09:00:00Z',
          updatedAt: '2025-01-01T10:00:00Z',
          version: 1,
        },
      ];

      vi.mocked(mockStorage.listFromProject).mockImplementation(async (prefix: string) => {
        if (prefix === `agents/${agentId}/`) {
          return memories;
        }
        return [];
      });

      const result = await recallContext(mockStorage, projectId, agentId);

      expect(result.private[0].id).toBe('mem-2');
      expect(result.private[1].id).toBe('mem-1');
    });
  });

  describe('Edge Cases', () => {
    it('should handle no memories', async () => {
      vi.mocked(mockStorage.listFromProject).mockResolvedValue([]);

      const result = await recallContext(mockStorage, projectId, agentId);

      expect(result.private).toHaveLength(0);
      expect(result.team).toHaveLength(0);
      expect(result.summary).toBe('');
      expect(result.counts.private).toBe(0);
      expect(result.counts.team).toBe(0);
      expect(result.counts.expired).toBe(0);
    });

    it('should handle storage errors', async () => {
      vi.mocked(mockStorage.listFromProject).mockRejectedValue(new Error('Storage error'));

      await expect(recallContext(mockStorage, projectId, agentId)).rejects.toThrow('Storage error');
    });

    it('should generate summary with correct format', async () => {
      const memories: Memory[] = [
        {
          id: 'mem-1',
          agentId,
          projectId,
          scope: 'private',
          category: 'core',
          content: 'Core identity',
          createdAt: '2025-01-01T10:00:00Z',
          updatedAt: '2025-01-01T10:00:00Z',
          version: 1,
        },
        {
          id: 'mem-2',
          agentId,
          projectId,
          scope: 'private',
          category: 'recent',
          content: 'Recent activity',
          createdAt: '2025-01-01T09:00:00Z',
          updatedAt: '2025-01-01T09:00:00Z',
          version: 1,
        },
      ];

      vi.mocked(mockStorage.listFromProject).mockResolvedValue(memories);

      const result = await recallContext(mockStorage, projectId, agentId);

      expect(result.summary).toContain('## core');
      expect(result.summary).toContain('Core identity');
      expect(result.summary).toContain('## recent');
      expect(result.summary).toContain('Recent activity');
    });

    it('should truncate summary at 4KB limit', async () => {
      const largeContent = 'x'.repeat(5000); // 5KB content
      const memories: Memory[] = [
        {
          id: 'mem-1',
          agentId,
          projectId,
          scope: 'private',
          category: 'recent',
          content: largeContent,
          createdAt: '2025-01-01T10:00:00Z',
          updatedAt: '2025-01-01T10:00:00Z',
          version: 1,
        },
      ];

      vi.mocked(mockStorage.listFromProject).mockResolvedValue(memories);

      const result = await recallContext(mockStorage, projectId, agentId);

      const summaryBytes = Buffer.byteLength(result.summary, 'utf8');
      expect(summaryBytes).toBeLessThanOrEqual(4096);
      expect(result.summary).toContain('...');
    });
  });
});
