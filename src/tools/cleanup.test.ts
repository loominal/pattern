/**
 * Tests for cleanup tool
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup } from './cleanup.js';
import type { Memory } from '../types.js';
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

describe('cleanup', () => {
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
    it('should expire TTL memories and enforce limits by default', async () => {
      const now = new Date();
      const memories: Memory[] = [
        {
          id: 'mem-expired',
          agentId,
          projectId,
          scope: 'private',
          category: 'recent',
          content: 'Expired memory',
          createdAt: '2025-01-01T08:00:00Z',
          updatedAt: '2025-01-01T08:00:00Z',
          expiresAt: new Date(now.getTime() - 1000).toISOString(),
          version: 1,
        },
        {
          id: 'mem-active',
          agentId,
          projectId,
          scope: 'private',
          category: 'recent',
          content: 'Active memory',
          createdAt: '2025-01-01T09:00:00Z',
          updatedAt: '2025-01-01T09:00:00Z',
          version: 1,
        },
      ];

      vi.mocked(mockStorage.listFromProject).mockResolvedValue(memories);
      vi.mocked(mockStorage.deleteFromProject).mockResolvedValue(true);

      const result = await cleanup({}, mockStorage, projectId);

      expect(result.expired).toBe(1);
      expect(result.errors).toHaveLength(0);

      // Verify deletion was called for expired memory
      expect(mockStorage.deleteFromProject).toHaveBeenCalledWith(
        `agents/${agentId}/recent/mem-expired`,
        projectId
      );
    });

    it('should only expire TTL memories when expireOnly is true', async () => {
      const now = new Date();
      const memories: Memory[] = Array.from({ length: 1100 }, (_, i) => ({
        id: `mem-${i}`,
        agentId,
        projectId,
        scope: 'private' as const,
        category: 'recent' as const,
        content: `Memory ${i}`,
        createdAt: `2025-01-01T${String(i % 24).padStart(2, '0')}:00:00Z`,
        updatedAt: `2025-01-01T${String(i % 24).padStart(2, '0')}:00:00Z`,
        expiresAt:
          i === 0 ? new Date(now.getTime() - 1000).toISOString() : undefined,
        version: 1,
      }));

      vi.mocked(mockStorage.listFromProject).mockResolvedValue(memories);
      vi.mocked(mockStorage.deleteFromProject).mockResolvedValue(true);

      const result = await cleanup({ expireOnly: true }, mockStorage, projectId);

      expect(result.expired).toBe(1);
      expect(result.deleted).toBe(0); // No limit enforcement
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('TTL Expiration', () => {
    it('should expire multiple TTL memories', async () => {
      const now = new Date();
      const memories: Memory[] = [
        {
          id: 'mem-1',
          agentId,
          projectId,
          scope: 'private',
          category: 'recent',
          content: 'Expired 1',
          createdAt: '2025-01-01T08:00:00Z',
          updatedAt: '2025-01-01T08:00:00Z',
          expiresAt: new Date(now.getTime() - 5000).toISOString(),
          version: 1,
        },
        {
          id: 'mem-2',
          agentId,
          projectId,
          scope: 'private',
          category: 'tasks',
          content: 'Expired 2',
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
          category: 'recent',
          content: 'Active',
          createdAt: '2025-01-01T09:00:00Z',
          updatedAt: '2025-01-01T09:00:00Z',
          version: 1,
        },
      ];

      vi.mocked(mockStorage.listFromProject).mockResolvedValue(memories);
      vi.mocked(mockStorage.deleteFromProject).mockResolvedValue(true);

      const result = await cleanup({}, mockStorage, projectId);

      expect(result.expired).toBe(2);
      expect(mockStorage.deleteFromProject).toHaveBeenCalledWith(
        `agents/${agentId}/recent/mem-1`,
        projectId
      );
      expect(mockStorage.deleteFromProject).toHaveBeenCalledWith(
        `agents/${agentId}/tasks/mem-2`,
        projectId
      );
    });

    it('should not expire memories without expiresAt', async () => {
      const memories: Memory[] = [
        {
          id: 'mem-1',
          agentId,
          projectId,
          scope: 'private',
          category: 'longterm',
          content: 'No TTL',
          createdAt: '2020-01-01T08:00:00Z',
          updatedAt: '2020-01-01T08:00:00Z',
          version: 1,
        },
      ];

      vi.mocked(mockStorage.listFromProject).mockResolvedValue(memories);

      const result = await cleanup({}, mockStorage, projectId);

      expect(result.expired).toBe(0);
      expect(mockStorage.deleteFromProject).not.toHaveBeenCalled();
    });

    it('should not expire memories with future expiresAt', async () => {
      const now = new Date();
      const memories: Memory[] = [
        {
          id: 'mem-1',
          agentId,
          projectId,
          scope: 'private',
          category: 'recent',
          content: 'Future expiry',
          createdAt: '2025-01-01T08:00:00Z',
          updatedAt: '2025-01-01T08:00:00Z',
          expiresAt: new Date(now.getTime() + 86400000).toISOString(), // +24 hours
          version: 1,
        },
      ];

      vi.mocked(mockStorage.listFromProject).mockResolvedValue(memories);

      const result = await cleanup({}, mockStorage, projectId);

      expect(result.expired).toBe(0);
    });
  });

  describe('Limit Enforcement', () => {
    it('should enforce recent limit (1000)', async () => {
      const memories: Memory[] = Array.from({ length: 1100 }, (_, i) => ({
        id: `mem-${i}`,
        agentId,
        projectId,
        scope: 'private' as const,
        category: 'recent' as const,
        content: `Recent ${i}`,
        createdAt: `2025-01-01T${String(i % 24).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}:00Z`,
        updatedAt: `2025-01-01T${String(i % 24).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}:00Z`,
        version: 1,
      }));

      vi.mocked(mockStorage.listFromProject).mockResolvedValue(memories);
      vi.mocked(mockStorage.deleteFromProject).mockResolvedValue(true);

      const result = await cleanup({}, mockStorage, projectId);

      expect(result.deleted).toBe(100); // 1100 - 1000
      expect(result.errors).toHaveLength(0);
    });

    it('should enforce tasks limit (500)', async () => {
      const memories: Memory[] = Array.from({ length: 600 }, (_, i) => ({
        id: `mem-${i}`,
        agentId,
        projectId,
        scope: 'private' as const,
        category: 'tasks' as const,
        content: `Task ${i}`,
        createdAt: `2025-01-01T${String(i % 24).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}:00Z`,
        updatedAt: `2025-01-01T${String(i % 24).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}:00Z`,
        version: 1,
      }));

      vi.mocked(mockStorage.listFromProject).mockResolvedValue(memories);
      vi.mocked(mockStorage.deleteFromProject).mockResolvedValue(true);

      const result = await cleanup({}, mockStorage, projectId);

      expect(result.deleted).toBe(100); // 600 - 500
    });

    it('should delete oldest memories first', async () => {
      const memories: Memory[] = [
        {
          id: 'mem-newest',
          agentId,
          projectId,
          scope: 'private',
          category: 'recent',
          content: 'Newest',
          createdAt: '2025-01-03T10:00:00Z',
          updatedAt: '2025-01-03T10:00:00Z',
          version: 1,
        },
        {
          id: 'mem-oldest',
          agentId,
          projectId,
          scope: 'private',
          category: 'recent',
          content: 'Oldest',
          createdAt: '2025-01-01T10:00:00Z',
          updatedAt: '2025-01-01T10:00:00Z',
          version: 1,
        },
        ...Array.from({ length: 1000 }, (_, i) => ({
          id: `mem-${i}`,
          agentId,
          projectId,
          scope: 'private' as const,
          category: 'recent' as const,
          content: `Memory ${i}`,
          createdAt: '2025-01-02T10:00:00Z',
          updatedAt: '2025-01-02T10:00:00Z',
          version: 1,
        })),
      ];

      vi.mocked(mockStorage.listFromProject).mockResolvedValue(memories);
      vi.mocked(mockStorage.deleteFromProject).mockResolvedValue(true);

      const result = await cleanup({}, mockStorage, projectId);

      expect(result.deleted).toBeGreaterThan(0);

      // Verify oldest was deleted
      expect(mockStorage.deleteFromProject).toHaveBeenCalledWith(
        `agents/${agentId}/recent/mem-oldest`,
        projectId
      );

      // Verify newest was NOT deleted
      const calls = vi.mocked(mockStorage.deleteFromProject).mock.calls;
      const deletedIds = calls.map((call) => call[0]);
      expect(deletedIds).not.toContain(
        `agents/${agentId}/recent/mem-newest`
      );
    });

    it('should report error when core limit exceeded but not delete', async () => {
      const memories: Memory[] = Array.from({ length: 150 }, (_, i) => ({
        id: `mem-${i}`,
        agentId,
        projectId,
        scope: 'private' as const,
        category: 'core' as const,
        content: `Core ${i}`,
        createdAt: `2025-01-01T${String(i % 24).padStart(2, '0')}:00:00Z`,
        updatedAt: `2025-01-01T${String(i % 24).padStart(2, '0')}:00:00Z`,
        version: 1,
      }));

      vi.mocked(mockStorage.listFromProject).mockResolvedValue(memories);

      const result = await cleanup({}, mockStorage, projectId);

      expect(result.deleted).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Core memory limit exceeded');
      expect(result.errors[0]).toContain('150 memories');
      expect(result.errors[0]).toContain('limit: 100');
    });

    it('should not enforce limits when under threshold', async () => {
      const memories: Memory[] = [
        {
          id: 'mem-1',
          agentId,
          projectId,
          scope: 'private',
          category: 'recent',
          content: 'Recent 1',
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
          content: 'Task 1',
          createdAt: '2025-01-01T09:00:00Z',
          updatedAt: '2025-01-01T09:00:00Z',
          version: 1,
        },
        {
          id: 'mem-3',
          agentId,
          projectId,
          scope: 'private',
          category: 'core',
          content: 'Core 1',
          createdAt: '2025-01-01T08:00:00Z',
          updatedAt: '2025-01-01T08:00:00Z',
          version: 1,
        },
      ];

      vi.mocked(mockStorage.listFromProject).mockResolvedValue(memories);

      const result = await cleanup({}, mockStorage, projectId);

      expect(result.deleted).toBe(0);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('Error Handling', () => {
    it('should continue and report errors when expiration fails', async () => {
      const now = new Date();
      const memories: Memory[] = [
        {
          id: 'mem-1',
          agentId,
          projectId,
          scope: 'private',
          category: 'recent',
          content: 'Will fail',
          createdAt: '2025-01-01T08:00:00Z',
          updatedAt: '2025-01-01T08:00:00Z',
          expiresAt: new Date(now.getTime() - 1000).toISOString(),
          version: 1,
        },
        {
          id: 'mem-2',
          agentId,
          projectId,
          scope: 'private',
          category: 'recent',
          content: 'Will succeed',
          createdAt: '2025-01-01T07:00:00Z',
          updatedAt: '2025-01-01T07:00:00Z',
          expiresAt: new Date(now.getTime() - 2000).toISOString(),
          version: 1,
        },
      ];

      vi.mocked(mockStorage.listFromProject).mockResolvedValue(memories);
      vi.mocked(mockStorage.deleteFromProject).mockImplementation(
        async (key: string) => {
          if (key.includes('mem-1')) {
            throw new Error('Delete failed');
          }
          return true;
        }
      );

      const result = await cleanup({}, mockStorage, projectId);

      expect(result.expired).toBe(1); // Only mem-2 succeeded
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Failed to expire memory mem-1');
      expect(result.errors[0]).toContain('Delete failed');
    });

    it('should continue and report errors when limit enforcement deletion fails', async () => {
      const memories: Memory[] = Array.from({ length: 1100 }, (_, i) => ({
        id: `mem-${i}`,
        agentId,
        projectId,
        scope: 'private' as const,
        category: 'recent' as const,
        content: `Recent ${i}`,
        createdAt: `2025-01-01T${String(i % 24).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}:00Z`,
        updatedAt: `2025-01-01T${String(i % 24).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}:00Z`,
        version: 1,
      }));

      vi.mocked(mockStorage.listFromProject).mockResolvedValue(memories);
      vi.mocked(mockStorage.deleteFromProject).mockImplementation(
        async (key: string) => {
          // Fail on first deletion
          if (key.includes('mem-0')) {
            throw new Error('Delete failed');
          }
          return true;
        }
      );

      const result = await cleanup({}, mockStorage, projectId);

      expect(result.deleted).toBe(99); // 100 - 1 failed
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Failed to delete recent memory');
    });

    it('should handle storage errors gracefully', async () => {
      vi.mocked(mockStorage.listFromProject).mockRejectedValue(
        new Error('Storage error')
      );

      await expect(cleanup({}, mockStorage, projectId)).rejects.toThrow(
        'Storage error'
      );
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty memory list', async () => {
      vi.mocked(mockStorage.listFromProject).mockResolvedValue([]);

      const result = await cleanup({}, mockStorage, projectId);

      expect(result.expired).toBe(0);
      expect(result.deleted).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle deleted flag returning false', async () => {
      const now = new Date();
      const memories: Memory[] = [
        {
          id: 'mem-1',
          agentId,
          projectId,
          scope: 'private',
          category: 'recent',
          content: 'Expired',
          createdAt: '2025-01-01T08:00:00Z',
          updatedAt: '2025-01-01T08:00:00Z',
          expiresAt: new Date(now.getTime() - 1000).toISOString(),
          version: 1,
        },
      ];

      vi.mocked(mockStorage.listFromProject).mockResolvedValue(memories);
      vi.mocked(mockStorage.deleteFromProject).mockResolvedValue(false);

      const result = await cleanup({}, mockStorage, projectId);

      expect(result.expired).toBe(0); // Not counted as expired if delete returns false
    });

    it('should exclude expired memories from limit enforcement', async () => {
      const now = new Date();
      const memories: Memory[] = [
        ...Array.from({ length: 100 }, (_, i) => ({
          id: `mem-expired-${i}`,
          agentId,
          projectId,
          scope: 'private' as const,
          category: 'recent' as const,
          content: `Expired ${i}`,
          createdAt: '2025-01-01T08:00:00Z',
          updatedAt: '2025-01-01T08:00:00Z',
          expiresAt: new Date(now.getTime() - 1000).toISOString(),
          version: 1,
        })),
        ...Array.from({ length: 900 }, (_, i) => ({
          id: `mem-active-${i}`,
          agentId,
          projectId,
          scope: 'private' as const,
          category: 'recent' as const,
          content: `Active ${i}`,
          createdAt: `2025-01-01T${String(i % 24).padStart(2, '0')}:00:00Z`,
          updatedAt: `2025-01-01T${String(i % 24).padStart(2, '0')}:00:00Z`,
          version: 1,
        })),
      ];

      vi.mocked(mockStorage.listFromProject).mockResolvedValue(memories);
      vi.mocked(mockStorage.deleteFromProject).mockResolvedValue(true);

      const result = await cleanup({}, mockStorage, projectId);

      expect(result.expired).toBe(100);
      expect(result.deleted).toBe(0); // 900 active memories is under the 1000 limit
    });

    it('should handle mixed categories in single cleanup', async () => {
      const now = new Date();
      const memories: Memory[] = [
        // Expired recent
        {
          id: 'mem-exp-recent',
          agentId,
          projectId,
          scope: 'private',
          category: 'recent',
          content: 'Expired recent',
          createdAt: '2025-01-01T08:00:00Z',
          updatedAt: '2025-01-01T08:00:00Z',
          expiresAt: new Date(now.getTime() - 1000).toISOString(),
          version: 1,
        },
        // Over-limit recent
        ...Array.from({ length: 1100 }, (_, i) => ({
          id: `mem-recent-${i}`,
          agentId,
          projectId,
          scope: 'private' as const,
          category: 'recent' as const,
          content: `Recent ${i}`,
          createdAt: `2025-01-01T${String(i % 24).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}:00Z`,
          updatedAt: `2025-01-01T${String(i % 24).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}:00Z`,
          version: 1,
        })),
        // Over-limit tasks
        ...Array.from({ length: 600 }, (_, i) => ({
          id: `mem-task-${i}`,
          agentId,
          projectId,
          scope: 'private' as const,
          category: 'tasks' as const,
          content: `Task ${i}`,
          createdAt: `2025-01-01T${String(i % 24).padStart(2, '0')}:00:00Z`,
          updatedAt: `2025-01-01T${String(i % 24).padStart(2, '0')}:00:00Z`,
          version: 1,
        })),
        // Over-limit core (should error)
        ...Array.from({ length: 150 }, (_, i) => ({
          id: `mem-core-${i}`,
          agentId,
          projectId,
          scope: 'private' as const,
          category: 'core' as const,
          content: `Core ${i}`,
          createdAt: `2025-01-01T${String(i % 24).padStart(2, '0')}:00:00Z`,
          updatedAt: `2025-01-01T${String(i % 24).padStart(2, '0')}:00:00Z`,
          version: 1,
        })),
      ];

      vi.mocked(mockStorage.listFromProject).mockResolvedValue(memories);
      vi.mocked(mockStorage.deleteFromProject).mockResolvedValue(true);

      const result = await cleanup({}, mockStorage, projectId);

      expect(result.expired).toBe(1); // Expired recent
      expect(result.deleted).toBe(200); // 100 excess recent + 100 excess tasks
      expect(result.errors).toHaveLength(1); // Core limit exceeded
      expect(result.errors[0]).toContain('Core memory limit exceeded');
    });
  });
});
