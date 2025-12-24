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

      vi.mocked(mockStorage.listFromProject).mockImplementation(async (prefix: string) => {
        if (prefix === `agents/${agentId}/`) {
          return memories;
        }
        return [];
      });
      vi.mocked(mockStorage.listFromUserBucket).mockResolvedValue([]);
      vi.mocked(mockStorage.listFromGlobalBucket).mockResolvedValue([]);

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

      vi.mocked(mockStorage.listFromProject).mockImplementation(async (prefix: string) => {
        if (prefix === `agents/${agentId}/`) {
          return memories;
        }
        return [];
      });
      vi.mocked(mockStorage.listFromUserBucket).mockResolvedValue([]);
      vi.mocked(mockStorage.listFromGlobalBucket).mockResolvedValue([]);

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

      vi.mocked(mockStorage.listFromProject).mockImplementation(async (prefix: string) => {
        if (prefix === `agents/${agentId}/`) {
          return memories;
        }
        return [];
      });
      vi.mocked(mockStorage.listFromUserBucket).mockResolvedValue([]);
      vi.mocked(mockStorage.listFromGlobalBucket).mockResolvedValue([]);

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

      vi.mocked(mockStorage.listFromProject).mockImplementation(async (prefix: string) => {
        if (prefix === `agents/${agentId}/`) {
          return memories;
        }
        return [];
      });
      vi.mocked(mockStorage.listFromUserBucket).mockResolvedValue([]);
      vi.mocked(mockStorage.listFromGlobalBucket).mockResolvedValue([]);

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

      vi.mocked(mockStorage.listFromProject).mockImplementation(async (prefix: string) => {
        if (prefix === `agents/${agentId}/`) {
          return memories;
        }
        return [];
      });
      vi.mocked(mockStorage.listFromUserBucket).mockResolvedValue([]);
      vi.mocked(mockStorage.listFromGlobalBucket).mockResolvedValue([]);

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

  describe('Tag Filtering', () => {
    it('should filter by single tag', async () => {
      const memories: Memory[] = [
        {
          id: 'mem-1',
          agentId,
          projectId,
          scope: 'private',
          category: 'recent',
          content: 'Memory with tag1',
          createdAt: '2025-01-01T10:00:00Z',
          updatedAt: '2025-01-01T10:00:00Z',
          version: 1,
          metadata: {
            tags: ['tag1', 'tag2'],
          },
        },
        {
          id: 'mem-2',
          agentId,
          projectId,
          scope: 'private',
          category: 'recent',
          content: 'Memory without tag1',
          createdAt: '2025-01-01T09:00:00Z',
          updatedAt: '2025-01-01T09:00:00Z',
          version: 1,
          metadata: {
            tags: ['tag3'],
          },
        },
      ];

      vi.mocked(mockStorage.listFromProject).mockImplementation(async (prefix: string) => {
        if (prefix === `agents/${agentId}/`) {
          return memories;
        }
        return [];
      });
      vi.mocked(mockStorage.listFromUserBucket).mockResolvedValue([]);
      vi.mocked(mockStorage.listFromGlobalBucket).mockResolvedValue([]);

      const result = await recallContext(mockStorage, projectId, agentId, {
        tags: ['tag1'],
      });

      expect(result.private).toHaveLength(1);
      expect(result.private[0].id).toBe('mem-1');
    });

    it('should filter by multiple tags (AND logic)', async () => {
      const memories: Memory[] = [
        {
          id: 'mem-1',
          agentId,
          projectId,
          scope: 'private',
          category: 'recent',
          content: 'Memory with both tags',
          createdAt: '2025-01-01T10:00:00Z',
          updatedAt: '2025-01-01T10:00:00Z',
          version: 1,
          metadata: {
            tags: ['tag1', 'tag2', 'tag3'],
          },
        },
        {
          id: 'mem-2',
          agentId,
          projectId,
          scope: 'private',
          category: 'recent',
          content: 'Memory with only tag1',
          createdAt: '2025-01-01T09:00:00Z',
          updatedAt: '2025-01-01T09:00:00Z',
          version: 1,
          metadata: {
            tags: ['tag1'],
          },
        },
      ];

      vi.mocked(mockStorage.listFromProject).mockImplementation(async (prefix: string) => {
        if (prefix === `agents/${agentId}/`) {
          return memories;
        }
        return [];
      });
      vi.mocked(mockStorage.listFromUserBucket).mockResolvedValue([]);
      vi.mocked(mockStorage.listFromGlobalBucket).mockResolvedValue([]);

      const result = await recallContext(mockStorage, projectId, agentId, {
        tags: ['tag1', 'tag2'],
      });

      expect(result.private).toHaveLength(1);
      expect(result.private[0].id).toBe('mem-1');
    });

    it('should return no results when tag not found', async () => {
      const memories: Memory[] = [
        {
          id: 'mem-1',
          agentId,
          projectId,
          scope: 'private',
          category: 'recent',
          content: 'Memory',
          createdAt: '2025-01-01T10:00:00Z',
          updatedAt: '2025-01-01T10:00:00Z',
          version: 1,
          metadata: {
            tags: ['tag1'],
          },
        },
      ];

      vi.mocked(mockStorage.listFromProject).mockImplementation(async (prefix: string) => {
        if (prefix === `agents/${agentId}/`) {
          return memories;
        }
        return [];
      });
      vi.mocked(mockStorage.listFromUserBucket).mockResolvedValue([]);
      vi.mocked(mockStorage.listFromGlobalBucket).mockResolvedValue([]);

      const result = await recallContext(mockStorage, projectId, agentId, {
        tags: ['nonexistent'],
      });

      expect(result.private).toHaveLength(0);
    });

    it('should handle memories without tags', async () => {
      const memories: Memory[] = [
        {
          id: 'mem-1',
          agentId,
          projectId,
          scope: 'private',
          category: 'recent',
          content: 'Memory without tags',
          createdAt: '2025-01-01T10:00:00Z',
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
      vi.mocked(mockStorage.listFromUserBucket).mockResolvedValue([]);
      vi.mocked(mockStorage.listFromGlobalBucket).mockResolvedValue([]);

      const result = await recallContext(mockStorage, projectId, agentId, {
        tags: ['tag1'],
      });

      expect(result.private).toHaveLength(0);
    });

    it('should return all memories when tags array is empty', async () => {
      const memories: Memory[] = [
        {
          id: 'mem-1',
          agentId,
          projectId,
          scope: 'private',
          category: 'recent',
          content: 'Memory',
          createdAt: '2025-01-01T10:00:00Z',
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
      vi.mocked(mockStorage.listFromUserBucket).mockResolvedValue([]);
      vi.mocked(mockStorage.listFromGlobalBucket).mockResolvedValue([]);

      const result = await recallContext(mockStorage, projectId, agentId, {
        tags: [],
      });

      expect(result.private).toHaveLength(1);
    });
  });

  describe('Priority Filtering', () => {
    it('should filter by minPriority only', async () => {
      const memories: Memory[] = [
        {
          id: 'mem-1',
          agentId,
          projectId,
          scope: 'private',
          category: 'recent',
          content: 'High priority',
          createdAt: '2025-01-01T10:00:00Z',
          updatedAt: '2025-01-01T10:00:00Z',
          version: 1,
          metadata: { priority: 1 },
        },
        {
          id: 'mem-2',
          agentId,
          projectId,
          scope: 'private',
          category: 'recent',
          content: 'Low priority',
          createdAt: '2025-01-01T09:00:00Z',
          updatedAt: '2025-01-01T09:00:00Z',
          version: 1,
          metadata: { priority: 3 },
        },
      ];

      vi.mocked(mockStorage.listFromProject).mockImplementation(async (prefix: string) => {
        if (prefix === `agents/${agentId}/`) {
          return memories;
        }
        return [];
      });
      vi.mocked(mockStorage.listFromUserBucket).mockResolvedValue([]);
      vi.mocked(mockStorage.listFromGlobalBucket).mockResolvedValue([]);

      const result = await recallContext(mockStorage, projectId, agentId, {
        minPriority: 2,
      });

      expect(result.private).toHaveLength(1);
      expect(result.private[0].id).toBe('mem-2');
    });

    it('should filter by maxPriority only', async () => {
      const memories: Memory[] = [
        {
          id: 'mem-1',
          agentId,
          projectId,
          scope: 'private',
          category: 'recent',
          content: 'High priority',
          createdAt: '2025-01-01T10:00:00Z',
          updatedAt: '2025-01-01T10:00:00Z',
          version: 1,
          metadata: { priority: 1 },
        },
        {
          id: 'mem-2',
          agentId,
          projectId,
          scope: 'private',
          category: 'recent',
          content: 'Low priority',
          createdAt: '2025-01-01T09:00:00Z',
          updatedAt: '2025-01-01T09:00:00Z',
          version: 1,
          metadata: { priority: 3 },
        },
      ];

      vi.mocked(mockStorage.listFromProject).mockImplementation(async (prefix: string) => {
        if (prefix === `agents/${agentId}/`) {
          return memories;
        }
        return [];
      });
      vi.mocked(mockStorage.listFromUserBucket).mockResolvedValue([]);
      vi.mocked(mockStorage.listFromGlobalBucket).mockResolvedValue([]);

      const result = await recallContext(mockStorage, projectId, agentId, {
        maxPriority: 2,
      });

      expect(result.private).toHaveLength(1);
      expect(result.private[0].id).toBe('mem-1');
    });

    it('should filter by priority range (min and max)', async () => {
      const memories: Memory[] = [
        {
          id: 'mem-1',
          agentId,
          projectId,
          scope: 'private',
          category: 'recent',
          content: 'High priority',
          createdAt: '2025-01-01T10:00:00Z',
          updatedAt: '2025-01-01T10:00:00Z',
          version: 1,
          metadata: { priority: 1 },
        },
        {
          id: 'mem-2',
          agentId,
          projectId,
          scope: 'private',
          category: 'recent',
          content: 'Medium priority',
          createdAt: '2025-01-01T09:00:00Z',
          updatedAt: '2025-01-01T09:00:00Z',
          version: 1,
          metadata: { priority: 2 },
        },
        {
          id: 'mem-3',
          agentId,
          projectId,
          scope: 'private',
          category: 'recent',
          content: 'Low priority',
          createdAt: '2025-01-01T08:00:00Z',
          updatedAt: '2025-01-01T08:00:00Z',
          version: 1,
          metadata: { priority: 3 },
        },
      ];

      vi.mocked(mockStorage.listFromProject).mockImplementation(async (prefix: string) => {
        if (prefix === `agents/${agentId}/`) {
          return memories;
        }
        return [];
      });
      vi.mocked(mockStorage.listFromUserBucket).mockResolvedValue([]);
      vi.mocked(mockStorage.listFromGlobalBucket).mockResolvedValue([]);

      const result = await recallContext(mockStorage, projectId, agentId, {
        minPriority: 2,
        maxPriority: 2,
      });

      expect(result.private).toHaveLength(1);
      expect(result.private[0].id).toBe('mem-2');
    });

    it('should handle default priority (2) for memories without priority', async () => {
      const memories: Memory[] = [
        {
          id: 'mem-1',
          agentId,
          projectId,
          scope: 'private',
          category: 'recent',
          content: 'No priority set',
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
          content: 'High priority',
          createdAt: '2025-01-01T09:00:00Z',
          updatedAt: '2025-01-01T09:00:00Z',
          version: 1,
          metadata: { priority: 1 },
        },
      ];

      vi.mocked(mockStorage.listFromProject).mockImplementation(async (prefix: string) => {
        if (prefix === `agents/${agentId}/`) {
          return memories;
        }
        return [];
      });
      vi.mocked(mockStorage.listFromUserBucket).mockResolvedValue([]);
      vi.mocked(mockStorage.listFromGlobalBucket).mockResolvedValue([]);

      const result = await recallContext(mockStorage, projectId, agentId, {
        minPriority: 2,
      });

      expect(result.private).toHaveLength(1);
      expect(result.private[0].id).toBe('mem-1');
    });
  });

  describe('Date Range Filtering', () => {
    it('should filter by createdAfter', async () => {
      const memories: Memory[] = [
        {
          id: 'mem-1',
          agentId,
          projectId,
          scope: 'private',
          category: 'recent',
          content: 'Old memory',
          createdAt: '2025-01-01T08:00:00Z',
          updatedAt: '2025-01-01T10:00:00Z',
          version: 1,
        },
        {
          id: 'mem-2',
          agentId,
          projectId,
          scope: 'private',
          category: 'recent',
          content: 'New memory',
          createdAt: '2025-01-05T10:00:00Z',
          updatedAt: '2025-01-05T10:00:00Z',
          version: 1,
        },
      ];

      vi.mocked(mockStorage.listFromProject).mockImplementation(async (prefix: string) => {
        if (prefix === `agents/${agentId}/`) {
          return memories;
        }
        return [];
      });
      vi.mocked(mockStorage.listFromUserBucket).mockResolvedValue([]);
      vi.mocked(mockStorage.listFromGlobalBucket).mockResolvedValue([]);

      const result = await recallContext(mockStorage, projectId, agentId, {
        createdAfter: '2025-01-03T00:00:00Z',
      });

      expect(result.private).toHaveLength(1);
      expect(result.private[0].id).toBe('mem-2');
    });

    it('should filter by createdBefore', async () => {
      const memories: Memory[] = [
        {
          id: 'mem-1',
          agentId,
          projectId,
          scope: 'private',
          category: 'recent',
          content: 'Old memory',
          createdAt: '2025-01-01T08:00:00Z',
          updatedAt: '2025-01-01T10:00:00Z',
          version: 1,
        },
        {
          id: 'mem-2',
          agentId,
          projectId,
          scope: 'private',
          category: 'recent',
          content: 'New memory',
          createdAt: '2025-01-05T10:00:00Z',
          updatedAt: '2025-01-05T10:00:00Z',
          version: 1,
        },
      ];

      vi.mocked(mockStorage.listFromProject).mockImplementation(async (prefix: string) => {
        if (prefix === `agents/${agentId}/`) {
          return memories;
        }
        return [];
      });
      vi.mocked(mockStorage.listFromUserBucket).mockResolvedValue([]);
      vi.mocked(mockStorage.listFromGlobalBucket).mockResolvedValue([]);

      const result = await recallContext(mockStorage, projectId, agentId, {
        createdBefore: '2025-01-03T00:00:00Z',
      });

      expect(result.private).toHaveLength(1);
      expect(result.private[0].id).toBe('mem-1');
    });

    it('should filter by created date range (createdAfter + createdBefore)', async () => {
      const memories: Memory[] = [
        {
          id: 'mem-1',
          agentId,
          projectId,
          scope: 'private',
          category: 'recent',
          content: 'Too old',
          createdAt: '2025-01-01T08:00:00Z',
          updatedAt: '2025-01-01T10:00:00Z',
          version: 1,
        },
        {
          id: 'mem-2',
          agentId,
          projectId,
          scope: 'private',
          category: 'recent',
          content: 'In range',
          createdAt: '2025-01-03T10:00:00Z',
          updatedAt: '2025-01-03T10:00:00Z',
          version: 1,
        },
        {
          id: 'mem-3',
          agentId,
          projectId,
          scope: 'private',
          category: 'recent',
          content: 'Too new',
          createdAt: '2025-01-10T10:00:00Z',
          updatedAt: '2025-01-10T10:00:00Z',
          version: 1,
        },
      ];

      vi.mocked(mockStorage.listFromProject).mockImplementation(async (prefix: string) => {
        if (prefix === `agents/${agentId}/`) {
          return memories;
        }
        return [];
      });
      vi.mocked(mockStorage.listFromUserBucket).mockResolvedValue([]);
      vi.mocked(mockStorage.listFromGlobalBucket).mockResolvedValue([]);

      const result = await recallContext(mockStorage, projectId, agentId, {
        createdAfter: '2025-01-02T00:00:00Z',
        createdBefore: '2025-01-05T00:00:00Z',
      });

      expect(result.private).toHaveLength(1);
      expect(result.private[0].id).toBe('mem-2');
    });

    it('should filter by updatedAfter', async () => {
      const memories: Memory[] = [
        {
          id: 'mem-1',
          agentId,
          projectId,
          scope: 'private',
          category: 'recent',
          content: 'Old update',
          createdAt: '2025-01-01T08:00:00Z',
          updatedAt: '2025-01-01T10:00:00Z',
          version: 1,
        },
        {
          id: 'mem-2',
          agentId,
          projectId,
          scope: 'private',
          category: 'recent',
          content: 'New update',
          createdAt: '2025-01-01T08:00:00Z',
          updatedAt: '2025-01-05T10:00:00Z',
          version: 1,
        },
      ];

      vi.mocked(mockStorage.listFromProject).mockImplementation(async (prefix: string) => {
        if (prefix === `agents/${agentId}/`) {
          return memories;
        }
        return [];
      });
      vi.mocked(mockStorage.listFromUserBucket).mockResolvedValue([]);
      vi.mocked(mockStorage.listFromGlobalBucket).mockResolvedValue([]);

      const result = await recallContext(mockStorage, projectId, agentId, {
        updatedAfter: '2025-01-03T00:00:00Z',
      });

      expect(result.private).toHaveLength(1);
      expect(result.private[0].id).toBe('mem-2');
    });

    it('should filter by updatedBefore', async () => {
      const memories: Memory[] = [
        {
          id: 'mem-1',
          agentId,
          projectId,
          scope: 'private',
          category: 'recent',
          content: 'Old update',
          createdAt: '2025-01-01T08:00:00Z',
          updatedAt: '2025-01-01T10:00:00Z',
          version: 1,
        },
        {
          id: 'mem-2',
          agentId,
          projectId,
          scope: 'private',
          category: 'recent',
          content: 'New update',
          createdAt: '2025-01-01T08:00:00Z',
          updatedAt: '2025-01-05T10:00:00Z',
          version: 1,
        },
      ];

      vi.mocked(mockStorage.listFromProject).mockImplementation(async (prefix: string) => {
        if (prefix === `agents/${agentId}/`) {
          return memories;
        }
        return [];
      });
      vi.mocked(mockStorage.listFromUserBucket).mockResolvedValue([]);
      vi.mocked(mockStorage.listFromGlobalBucket).mockResolvedValue([]);

      const result = await recallContext(mockStorage, projectId, agentId, {
        updatedBefore: '2025-01-03T00:00:00Z',
      });

      expect(result.private).toHaveLength(1);
      expect(result.private[0].id).toBe('mem-1');
    });

    it('should filter by updated date range (updatedAfter + updatedBefore)', async () => {
      const memories: Memory[] = [
        {
          id: 'mem-1',
          agentId,
          projectId,
          scope: 'private',
          category: 'recent',
          content: 'Too old',
          createdAt: '2025-01-01T08:00:00Z',
          updatedAt: '2025-01-01T10:00:00Z',
          version: 1,
        },
        {
          id: 'mem-2',
          agentId,
          projectId,
          scope: 'private',
          category: 'recent',
          content: 'In range',
          createdAt: '2025-01-01T08:00:00Z',
          updatedAt: '2025-01-03T10:00:00Z',
          version: 1,
        },
        {
          id: 'mem-3',
          agentId,
          projectId,
          scope: 'private',
          category: 'recent',
          content: 'Too new',
          createdAt: '2025-01-01T08:00:00Z',
          updatedAt: '2025-01-10T10:00:00Z',
          version: 1,
        },
      ];

      vi.mocked(mockStorage.listFromProject).mockImplementation(async (prefix: string) => {
        if (prefix === `agents/${agentId}/`) {
          return memories;
        }
        return [];
      });
      vi.mocked(mockStorage.listFromUserBucket).mockResolvedValue([]);
      vi.mocked(mockStorage.listFromGlobalBucket).mockResolvedValue([]);

      const result = await recallContext(mockStorage, projectId, agentId, {
        updatedAfter: '2025-01-02T00:00:00Z',
        updatedBefore: '2025-01-05T00:00:00Z',
      });

      expect(result.private).toHaveLength(1);
      expect(result.private[0].id).toBe('mem-2');
    });
  });

  describe('Content Search', () => {
    it('should filter by case-insensitive content search', async () => {
      const memories: Memory[] = [
        {
          id: 'mem-1',
          agentId,
          projectId,
          scope: 'private',
          category: 'recent',
          content: 'The API uses REST with JSON responses',
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
          content: 'Database setup instructions',
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
      vi.mocked(mockStorage.listFromUserBucket).mockResolvedValue([]);
      vi.mocked(mockStorage.listFromGlobalBucket).mockResolvedValue([]);

      const result = await recallContext(mockStorage, projectId, agentId, {
        search: 'api',
      });

      expect(result.private).toHaveLength(1);
      expect(result.private[0].id).toBe('mem-1');
    });

    it('should handle partial match in content search', async () => {
      const memories: Memory[] = [
        {
          id: 'mem-1',
          agentId,
          projectId,
          scope: 'private',
          category: 'recent',
          content: 'Authentication implemented',
          createdAt: '2025-01-01T10:00:00Z',
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
      vi.mocked(mockStorage.listFromUserBucket).mockResolvedValue([]);
      vi.mocked(mockStorage.listFromGlobalBucket).mockResolvedValue([]);

      const result = await recallContext(mockStorage, projectId, agentId, {
        search: 'auth',
      });

      expect(result.private).toHaveLength(1);
    });

    it('should return no results when search text not found', async () => {
      const memories: Memory[] = [
        {
          id: 'mem-1',
          agentId,
          projectId,
          scope: 'private',
          category: 'recent',
          content: 'Some content',
          createdAt: '2025-01-01T10:00:00Z',
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
      vi.mocked(mockStorage.listFromUserBucket).mockResolvedValue([]);
      vi.mocked(mockStorage.listFromGlobalBucket).mockResolvedValue([]);

      const result = await recallContext(mockStorage, projectId, agentId, {
        search: 'nonexistent',
      });

      expect(result.private).toHaveLength(0);
    });

    it('should return all memories when search is empty string', async () => {
      const memories: Memory[] = [
        {
          id: 'mem-1',
          agentId,
          projectId,
          scope: 'private',
          category: 'recent',
          content: 'Memory',
          createdAt: '2025-01-01T10:00:00Z',
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
      vi.mocked(mockStorage.listFromUserBucket).mockResolvedValue([]);
      vi.mocked(mockStorage.listFromGlobalBucket).mockResolvedValue([]);

      const result = await recallContext(mockStorage, projectId, agentId, {
        search: '',
      });

      expect(result.private).toHaveLength(1);
    });
  });

  describe('Combined Filters', () => {
    it('should combine tags + priority filters', async () => {
      const memories: Memory[] = [
        {
          id: 'mem-1',
          agentId,
          projectId,
          scope: 'private',
          category: 'recent',
          content: 'High priority with tag',
          createdAt: '2025-01-01T10:00:00Z',
          updatedAt: '2025-01-01T10:00:00Z',
          version: 1,
          metadata: {
            tags: ['important'],
            priority: 1,
          },
        },
        {
          id: 'mem-2',
          agentId,
          projectId,
          scope: 'private',
          category: 'recent',
          content: 'Low priority with tag',
          createdAt: '2025-01-01T09:00:00Z',
          updatedAt: '2025-01-01T09:00:00Z',
          version: 1,
          metadata: {
            tags: ['important'],
            priority: 3,
          },
        },
        {
          id: 'mem-3',
          agentId,
          projectId,
          scope: 'private',
          category: 'recent',
          content: 'High priority without tag',
          createdAt: '2025-01-01T08:00:00Z',
          updatedAt: '2025-01-01T08:00:00Z',
          version: 1,
          metadata: {
            priority: 1,
          },
        },
      ];

      vi.mocked(mockStorage.listFromProject).mockImplementation(async (prefix: string) => {
        if (prefix === `agents/${agentId}/`) {
          return memories;
        }
        return [];
      });
      vi.mocked(mockStorage.listFromUserBucket).mockResolvedValue([]);
      vi.mocked(mockStorage.listFromGlobalBucket).mockResolvedValue([]);

      const result = await recallContext(mockStorage, projectId, agentId, {
        tags: ['important'],
        maxPriority: 1,
      });

      expect(result.private).toHaveLength(1);
      expect(result.private[0].id).toBe('mem-1');
    });

    it('should combine tags + date range filters', async () => {
      const memories: Memory[] = [
        {
          id: 'mem-1',
          agentId,
          projectId,
          scope: 'private',
          category: 'recent',
          content: 'Recent with tag',
          createdAt: '2025-01-05T10:00:00Z',
          updatedAt: '2025-01-05T10:00:00Z',
          version: 1,
          metadata: {
            tags: ['important'],
          },
        },
        {
          id: 'mem-2',
          agentId,
          projectId,
          scope: 'private',
          category: 'recent',
          content: 'Old with tag',
          createdAt: '2025-01-01T10:00:00Z',
          updatedAt: '2025-01-01T10:00:00Z',
          version: 1,
          metadata: {
            tags: ['important'],
          },
        },
      ];

      vi.mocked(mockStorage.listFromProject).mockImplementation(async (prefix: string) => {
        if (prefix === `agents/${agentId}/`) {
          return memories;
        }
        return [];
      });
      vi.mocked(mockStorage.listFromUserBucket).mockResolvedValue([]);
      vi.mocked(mockStorage.listFromGlobalBucket).mockResolvedValue([]);

      const result = await recallContext(mockStorage, projectId, agentId, {
        tags: ['important'],
        createdAfter: '2025-01-03T00:00:00Z',
      });

      expect(result.private).toHaveLength(1);
      expect(result.private[0].id).toBe('mem-1');
    });

    it('should combine priority + content search filters', async () => {
      const memories: Memory[] = [
        {
          id: 'mem-1',
          agentId,
          projectId,
          scope: 'private',
          category: 'recent',
          content: 'High priority API documentation',
          createdAt: '2025-01-01T10:00:00Z',
          updatedAt: '2025-01-01T10:00:00Z',
          version: 1,
          metadata: {
            priority: 1,
          },
        },
        {
          id: 'mem-2',
          agentId,
          projectId,
          scope: 'private',
          category: 'recent',
          content: 'Low priority API notes',
          createdAt: '2025-01-01T09:00:00Z',
          updatedAt: '2025-01-01T09:00:00Z',
          version: 1,
          metadata: {
            priority: 3,
          },
        },
      ];

      vi.mocked(mockStorage.listFromProject).mockImplementation(async (prefix: string) => {
        if (prefix === `agents/${agentId}/`) {
          return memories;
        }
        return [];
      });
      vi.mocked(mockStorage.listFromUserBucket).mockResolvedValue([]);
      vi.mocked(mockStorage.listFromGlobalBucket).mockResolvedValue([]);

      const result = await recallContext(mockStorage, projectId, agentId, {
        search: 'API',
        maxPriority: 1,
      });

      expect(result.private).toHaveLength(1);
      expect(result.private[0].id).toBe('mem-1');
    });

    it('should combine all filters together', async () => {
      const memories: Memory[] = [
        {
          id: 'mem-1',
          agentId,
          projectId,
          scope: 'private',
          category: 'recent',
          content: 'Perfect match - API documentation',
          createdAt: '2025-01-05T10:00:00Z',
          updatedAt: '2025-01-05T10:00:00Z',
          version: 1,
          metadata: {
            tags: ['api', 'docs'],
            priority: 1,
          },
        },
        {
          id: 'mem-2',
          agentId,
          projectId,
          scope: 'private',
          category: 'recent',
          content: 'API notes but wrong priority',
          createdAt: '2025-01-05T10:00:00Z',
          updatedAt: '2025-01-05T10:00:00Z',
          version: 1,
          metadata: {
            tags: ['api', 'docs'],
            priority: 3,
          },
        },
        {
          id: 'mem-3',
          agentId,
          projectId,
          scope: 'private',
          category: 'recent',
          content: 'API notes but too old',
          createdAt: '2025-01-01T10:00:00Z',
          updatedAt: '2025-01-01T10:00:00Z',
          version: 1,
          metadata: {
            tags: ['api', 'docs'],
            priority: 1,
          },
        },
      ];

      vi.mocked(mockStorage.listFromProject).mockImplementation(async (prefix: string) => {
        if (prefix === `agents/${agentId}/`) {
          return memories;
        }
        return [];
      });
      vi.mocked(mockStorage.listFromUserBucket).mockResolvedValue([]);
      vi.mocked(mockStorage.listFromGlobalBucket).mockResolvedValue([]);

      const result = await recallContext(mockStorage, projectId, agentId, {
        tags: ['api', 'docs'],
        maxPriority: 1,
        createdAfter: '2025-01-03T00:00:00Z',
        search: 'documentation',
      });

      expect(result.private).toHaveLength(1);
      expect(result.private[0].id).toBe('mem-1');
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

      vi.mocked(mockStorage.listFromProject).mockImplementation(async (prefix: string) => {
        if (prefix === `agents/${agentId}/`) {
          return memories;
        }
        return [];
      });
      vi.mocked(mockStorage.listFromUserBucket).mockResolvedValue([]);
      vi.mocked(mockStorage.listFromGlobalBucket).mockResolvedValue([]);

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

      vi.mocked(mockStorage.listFromProject).mockImplementation(async (prefix: string) => {
        if (prefix === `agents/${agentId}/`) {
          return memories;
        }
        return [];
      });
      vi.mocked(mockStorage.listFromUserBucket).mockResolvedValue([]);
      vi.mocked(mockStorage.listFromGlobalBucket).mockResolvedValue([]);

      const result = await recallContext(mockStorage, projectId, agentId);

      const summaryBytes = Buffer.byteLength(result.summary, 'utf8');
      expect(summaryBytes).toBeLessThanOrEqual(4096);
      expect(result.summary).toContain('...');
    });
  });
});
