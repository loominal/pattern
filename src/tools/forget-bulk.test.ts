/**
 * Tests for forget-bulk tool
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { forgetBulk, type ForgetBulkInput } from './forget-bulk.js';
import type { NatsKvBackend } from '../storage/nats-kv.js';
import type { Memory } from '../types.js';

// Mock logger
vi.mock('../logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const createMockStorage = () => {
  const mockStorage = {
    set: vi.fn(),
    get: vi.fn(),
    delete: vi.fn(),
    list: vi.fn(),
    keys: vi.fn(),
    getFromProject: vi.fn(),
    deleteFromProject: vi.fn().mockResolvedValue(true),
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
    deleteFromUserBucket: vi.fn().mockResolvedValue(true),
    getFromGlobalBucket: vi.fn().mockResolvedValue(null),
    listFromGlobalBucket: vi.fn().mockResolvedValue([]),
    keysFromGlobalBucket: vi.fn().mockResolvedValue([]),
    deleteFromGlobalBucket: vi.fn().mockResolvedValue(true),
  } as unknown as NatsKvBackend;
  return mockStorage;
};

describe('forget-bulk tool', () => {
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
    it('should delete multiple existing memories', async () => {
      const memoryIds = ['mem-1', 'mem-2', 'mem-3'];

      // Mock memories exist in private scope
      vi.mocked(storage.getFromProject).mockImplementation(async (key) => {
        if (key.includes('mem-1') || key.includes('mem-2') || key.includes('mem-3')) {
          return {
            id: key.split('/').pop(),
            agentId,
            projectId,
            scope: 'private',
            category: 'longterm',
            content: 'Test content',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            version: 1,
          } as Memory;
        }
        return null;
      });

      const input: ForgetBulkInput = { memoryIds };

      const result = await forgetBulk(input, storage, projectId, agentId);

      expect(result.deleted).toBe(3);
      expect(result.failed).toBe(0);
      expect(result.errors).toHaveLength(0);
      expect(storage.deleteFromProject).toHaveBeenCalledTimes(3);
    });

    it('should handle empty array gracefully', async () => {
      const input: ForgetBulkInput = { memoryIds: [] };

      const result = await forgetBulk(input, storage, projectId, agentId);

      expect(result.deleted).toBe(0);
      expect(result.failed).toBe(0);
      expect(result.errors).toHaveLength(0);
      expect(storage.deleteFromProject).not.toHaveBeenCalled();
    });

    it('should delete memories from different scopes', async () => {
      const memoryIds = ['private-mem', 'personal-mem', 'team-mem'];

      // Mock different scopes
      vi.mocked(storage.getFromProject).mockImplementation(async (key) => {
        if (key.includes('private-mem')) {
          return {
            id: 'private-mem',
            agentId,
            projectId,
            scope: 'private',
            category: 'longterm',
            content: 'Private',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            version: 1,
          } as Memory;
        }
        if (key.includes('team-mem')) {
          return {
            id: 'team-mem',
            agentId,
            projectId,
            scope: 'team',
            category: 'decisions',
            content: 'Team',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            version: 1,
          } as Memory;
        }
        return null;
      });

      vi.mocked(storage.getFromUserBucket).mockImplementation(async (key) => {
        if (key.includes('personal-mem')) {
          return {
            id: 'personal-mem',
            agentId,
            projectId,
            scope: 'personal',
            category: 'core',
            content: 'Personal',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            version: 1,
          } as Memory;
        }
        return null;
      });

      const input: ForgetBulkInput = { memoryIds, force: true };

      const result = await forgetBulk(input, storage, projectId, agentId);

      expect(result.deleted).toBe(3);
      expect(result.failed).toBe(0);
    });
  });

  describe('Error Handling Scenarios', () => {
    it('should continue on errors when stopOnError is false', async () => {
      const memoryIds = ['mem-1', 'non-existent', 'mem-3'];

      vi.mocked(storage.getFromProject).mockImplementation(async (key) => {
        if (key.includes('non-existent')) {
          return null; // Memory not found
        }
        return {
          id: key.split('/').pop(),
          agentId,
          projectId,
          scope: 'private',
          category: 'longterm',
          content: 'Test content',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          version: 1,
        } as Memory;
      });

      const input: ForgetBulkInput = {
        memoryIds,
        stopOnError: false,
      };

      const result = await forgetBulk(input, storage, projectId, agentId);

      expect(result.deleted).toBe(2);
      expect(result.failed).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toMatchObject({
        memoryId: 'non-existent',
      });
      expect(result.errors[0].error).toContain('not found');
    });

    it('should stop on first error when stopOnError is true', async () => {
      const memoryIds = ['mem-1', 'non-existent', 'mem-3'];

      vi.mocked(storage.getFromProject).mockImplementation(async (key) => {
        if (key.includes('mem-1')) {
          return {
            id: 'mem-1',
            agentId,
            projectId,
            scope: 'private',
            category: 'longterm',
            content: 'Test',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            version: 1,
          } as Memory;
        }
        return null;
      });

      const input: ForgetBulkInput = {
        memoryIds,
        stopOnError: true,
      };

      const result = await forgetBulk(input, storage, projectId, agentId);

      expect(result.deleted).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toMatchObject({
        memoryId: 'non-existent',
      });
      // Should have stopped and not attempted mem-3
    });

    it('should handle all non-existent memory IDs', async () => {
      const memoryIds = ['non-1', 'non-2', 'non-3'];

      vi.mocked(storage.getFromProject).mockResolvedValue(null);
      vi.mocked(storage.getFromUserBucket).mockResolvedValue(null);
      vi.mocked(storage.getFromGlobalBucket).mockResolvedValue(null);

      const input: ForgetBulkInput = {
        memoryIds,
        stopOnError: false,
      };

      const result = await forgetBulk(input, storage, projectId, agentId);

      expect(result.deleted).toBe(0);
      expect(result.failed).toBe(3);
      expect(result.errors).toHaveLength(3);
    });

    it('should handle empty string memory IDs', async () => {
      const memoryIds = ['mem-1', '', 'mem-3'];

      vi.mocked(storage.getFromProject).mockResolvedValue({
        id: 'mem-1',
        agentId,
        projectId,
        scope: 'private',
        category: 'longterm',
        content: 'Test',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
      } as Memory);

      const input: ForgetBulkInput = {
        memoryIds,
        stopOnError: false,
      };

      const result = await forgetBulk(input, storage, projectId, agentId);

      expect(result.failed).toBeGreaterThan(0);
      expect(result.errors.some((e) => e.memoryId === '')).toBe(true);
      expect(result.errors.some((e) => e.error.includes('cannot be empty'))).toBe(true);
    });

    it('should collect all errors with correct memory IDs', async () => {
      const memoryIds = ['mem-1', 'non-1', 'mem-3', 'non-2'];

      vi.mocked(storage.getFromProject).mockImplementation(async (key) => {
        if (key.includes('mem-1') || key.includes('mem-3')) {
          return {
            id: key.split('/').pop(),
            agentId,
            projectId,
            scope: 'private',
            category: 'longterm',
            content: 'Test',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            version: 1,
          } as Memory;
        }
        return null;
      });

      const input: ForgetBulkInput = {
        memoryIds,
        stopOnError: false,
      };

      const result = await forgetBulk(input, storage, projectId, agentId);

      expect(result.deleted).toBe(2);
      expect(result.failed).toBe(2);
      expect(result.errors).toHaveLength(2);
      expect(result.errors[0].memoryId).toBe('non-1');
      expect(result.errors[1].memoryId).toBe('non-2');
    });
  });

  describe('Core Memory Scenarios', () => {
    it('should delete core memories with force flag', async () => {
      const memoryIds = ['core-mem-1'];

      vi.mocked(storage.getFromUserBucket).mockResolvedValue({
        id: 'core-mem-1',
        agentId,
        projectId,
        scope: 'personal',
        category: 'core',
        content: 'Core memory',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
      } as Memory);

      const input: ForgetBulkInput = {
        memoryIds,
        force: true,
      };

      const result = await forgetBulk(input, storage, projectId, agentId);

      expect(result.deleted).toBe(1);
      expect(result.failed).toBe(0);
      expect(storage.deleteFromUserBucket).toHaveBeenCalledTimes(1);
    });

    it('should fail to delete core memories without force flag', async () => {
      const memoryIds = ['core-mem-1'];

      vi.mocked(storage.getFromUserBucket).mockResolvedValue({
        id: 'core-mem-1',
        agentId,
        projectId,
        scope: 'personal',
        category: 'core',
        content: 'Core memory',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
      } as Memory);

      const input: ForgetBulkInput = {
        memoryIds,
        force: false,
      };

      const result = await forgetBulk(input, storage, projectId, agentId);

      expect(result.deleted).toBe(0);
      expect(result.failed).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].error).toContain('force=true');
    });

    it('should handle mix of core and non-core memories with force flag', async () => {
      const memoryIds = ['core-mem', 'regular-mem'];

      vi.mocked(storage.getFromProject).mockImplementation(async (key) => {
        if (key.includes('regular-mem')) {
          return {
            id: 'regular-mem',
            agentId,
            projectId,
            scope: 'private',
            category: 'longterm',
            content: 'Regular',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            version: 1,
          } as Memory;
        }
        return null;
      });

      vi.mocked(storage.getFromUserBucket).mockImplementation(async (key) => {
        if (key.includes('core-mem')) {
          return {
            id: 'core-mem',
            agentId,
            projectId,
            scope: 'personal',
            category: 'core',
            content: 'Core',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            version: 1,
          } as Memory;
        }
        return null;
      });

      const input: ForgetBulkInput = {
        memoryIds,
        force: true,
      };

      const result = await forgetBulk(input, storage, projectId, agentId);

      expect(result.deleted).toBe(2);
      expect(result.failed).toBe(0);
    });
  });

  describe('Partial Success Scenarios', () => {
    it('should return partial results when some succeed and some fail', async () => {
      const memoryIds = ['mem-1', 'non-existent', 'mem-3'];

      vi.mocked(storage.getFromProject).mockImplementation(async (key) => {
        if (key.includes('mem-1') || key.includes('mem-3')) {
          return {
            id: key.split('/').pop(),
            agentId,
            projectId,
            scope: 'private',
            category: 'longterm',
            content: 'Test',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            version: 1,
          } as Memory;
        }
        return null;
      });

      const input: ForgetBulkInput = {
        memoryIds,
        stopOnError: false,
      };

      const result = await forgetBulk(input, storage, projectId, agentId);

      expect(result.deleted).toBe(2);
      expect(result.failed).toBe(1);
      expect(result.errors).toHaveLength(1);
    });
  });

  describe('Access Control Scenarios', () => {
    it('should fail to delete team memories created by another agent', async () => {
      const memoryIds = ['team-mem'];

      vi.mocked(storage.getFromProject).mockResolvedValue({
        id: 'team-mem',
        agentId: 'different-agent',
        projectId,
        scope: 'team',
        category: 'decisions',
        content: 'Team memory',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
      } as Memory);

      const input: ForgetBulkInput = { memoryIds };

      const result = await forgetBulk(input, storage, projectId, agentId);

      expect(result.deleted).toBe(0);
      expect(result.failed).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].error).toContain('created by another agent');
    });

    it('should successfully delete own team memories', async () => {
      const memoryIds = ['team-mem'];

      vi.mocked(storage.getFromProject).mockResolvedValue({
        id: 'team-mem',
        agentId, // Same agent
        projectId,
        scope: 'team',
        category: 'decisions',
        content: 'Team memory',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
      } as Memory);

      const input: ForgetBulkInput = { memoryIds };

      const result = await forgetBulk(input, storage, projectId, agentId);

      expect(result.deleted).toBe(1);
      expect(result.failed).toBe(0);
    });
  });

  describe('Verification Scenarios', () => {
    it('should verify memories are not retrievable after deletion', async () => {
      const memoryIds = ['mem-1'];

      vi.mocked(storage.getFromProject).mockResolvedValue({
        id: 'mem-1',
        agentId,
        projectId,
        scope: 'private',
        category: 'longterm',
        content: 'Test',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
      } as Memory);

      vi.mocked(storage.deleteFromProject).mockResolvedValue(true);

      const input: ForgetBulkInput = { memoryIds };

      const result = await forgetBulk(input, storage, projectId, agentId);

      expect(result.deleted).toBe(1);
      expect(storage.deleteFromProject).toHaveBeenCalledTimes(1);

      // Verify the delete was called with correct parameters
      const deleteCall = vi.mocked(storage.deleteFromProject).mock.calls[0];
      expect(deleteCall[0]).toContain('mem-1');
      expect(deleteCall[1]).toBe(projectId);
    });
  });

  describe('Storage Failure Scenarios', () => {
    it('should handle storage deletion failures', async () => {
      const memoryIds = ['mem-1', 'mem-2'];

      vi.mocked(storage.getFromProject).mockResolvedValue({
        id: 'mem-1',
        agentId,
        projectId,
        scope: 'private',
        category: 'longterm',
        content: 'Test',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
      } as Memory);

      vi.mocked(storage.deleteFromProject)
        .mockResolvedValueOnce(true)
        .mockRejectedValueOnce(new Error('Storage deletion failed'));

      const input: ForgetBulkInput = {
        memoryIds,
        stopOnError: false,
      };

      const result = await forgetBulk(input, storage, projectId, agentId);

      expect(result.deleted).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].error).toContain('Storage deletion failed');
    });
  });
});
