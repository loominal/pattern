/**
 * Tests for forget tool
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { forget, type ForgetInput } from './forget.js';
import type { NatsKvBackend } from '../storage/nats-kv.js';
import type { Memory } from '../types.js';
import { PatternError, PatternErrorCode } from '../types.js';
import { v4 as uuidv4 } from 'uuid';

describe('forget tool', () => {
  let mockStorage: NatsKvBackend;
  const projectId = 'test-project';
  const agentId = 'test-agent-123';

  beforeEach(() => {
    // Create mock storage
    mockStorage = {
      getFromProject: vi.fn(),
      deleteFromProject: vi.fn(),
    } as unknown as NatsKvBackend;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Happy Path Scenarios - Private Memories', () => {
    it('should delete a recent memory', async () => {
      const memoryId = uuidv4();
      const recentMemory: Memory = {
        id: memoryId,
        agentId,
        projectId,
        scope: 'private',
        category: 'recent',
        content: 'Memory to forget',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
      };

      vi.mocked(mockStorage.getFromProject)
        .mockResolvedValueOnce(recentMemory);
      vi.mocked(mockStorage.deleteFromProject).mockResolvedValue(true);

      const input: ForgetInput = {
        memoryId,
      };

      const result = await forget(input, mockStorage, projectId, agentId);

      expect(result.deleted).toBe(true);
      expect(result.category).toBe('recent');

      // Verify deletion
      expect(mockStorage.deleteFromProject).toHaveBeenCalledWith(
        `agents/${agentId}/recent/${memoryId}`,
        projectId
      );
    });

    it('should delete a tasks memory', async () => {
      const memoryId = uuidv4();
      const taskMemory: Memory = {
        id: memoryId,
        agentId,
        projectId,
        scope: 'private',
        category: 'tasks',
        content: 'Task to forget',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
      };

      // Not found in recent, found in tasks
      vi.mocked(mockStorage.getFromProject)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(taskMemory);
      vi.mocked(mockStorage.deleteFromProject).mockResolvedValue(true);

      const input: ForgetInput = {
        memoryId,
      };

      const result = await forget(input, mockStorage, projectId, agentId);

      expect(result.deleted).toBe(true);
      expect(result.category).toBe('tasks');

      // Verify it checked both categories
      expect(mockStorage.getFromProject).toHaveBeenNthCalledWith(
        1,
        `agents/${agentId}/recent/${memoryId}`,
        projectId
      );
      expect(mockStorage.getFromProject).toHaveBeenNthCalledWith(
        2,
        `agents/${agentId}/tasks/${memoryId}`,
        projectId
      );
    });

    it('should delete a longterm memory', async () => {
      const memoryId = uuidv4();
      const longtermMemory: Memory = {
        id: memoryId,
        agentId,
        projectId,
        scope: 'private',
        category: 'longterm',
        content: 'Longterm memory to forget',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
      };

      // Not found in recent or tasks, found in longterm
      vi.mocked(mockStorage.getFromProject)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(longtermMemory);
      vi.mocked(mockStorage.deleteFromProject).mockResolvedValue(true);

      const input: ForgetInput = {
        memoryId,
      };

      const result = await forget(input, mockStorage, projectId, agentId);

      expect(result.deleted).toBe(true);
      expect(result.category).toBe('longterm');
    });

    it('should delete a core memory when force=true', async () => {
      const memoryId = uuidv4();
      const coreMemory: Memory = {
        id: memoryId,
        agentId,
        projectId,
        scope: 'private',
        category: 'core',
        content: 'Core memory to forget',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
      };

      // Not found in other categories, found in core
      vi.mocked(mockStorage.getFromProject)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(coreMemory);
      vi.mocked(mockStorage.deleteFromProject).mockResolvedValue(true);

      const input: ForgetInput = {
        memoryId,
        force: true,
      };

      const result = await forget(input, mockStorage, projectId, agentId);

      expect(result.deleted).toBe(true);
      expect(result.category).toBe('core');

      expect(mockStorage.deleteFromProject).toHaveBeenCalledWith(
        `agents/${agentId}/core/${memoryId}`,
        projectId
      );
    });
  });

  describe('Happy Path Scenarios - Shared Memories', () => {
    it('should delete a shared decision created by current agent', async () => {
      const memoryId = uuidv4();
      const decisionMemory: Memory = {
        id: memoryId,
        agentId, // Created by current agent
        projectId,
        scope: 'shared',
        category: 'decisions',
        content: 'Decision to forget',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
      };

      // Not found in private categories, found in shared decisions
      vi.mocked(mockStorage.getFromProject)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(decisionMemory);
      vi.mocked(mockStorage.deleteFromProject).mockResolvedValue(true);

      const input: ForgetInput = {
        memoryId,
      };

      const result = await forget(input, mockStorage, projectId, agentId);

      expect(result.deleted).toBe(true);
      expect(result.category).toBe('decisions');

      expect(mockStorage.deleteFromProject).toHaveBeenCalledWith(
        `shared/decisions/${memoryId}`,
        projectId
      );
    });

    it('should delete a shared architecture memory', async () => {
      const memoryId = uuidv4();
      const architectureMemory: Memory = {
        id: memoryId,
        agentId,
        projectId,
        scope: 'shared',
        category: 'architecture',
        content: 'Architecture note to forget',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
      };

      // Found in shared architecture
      vi.mocked(mockStorage.getFromProject)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(architectureMemory);
      vi.mocked(mockStorage.deleteFromProject).mockResolvedValue(true);

      const input: ForgetInput = {
        memoryId,
      };

      const result = await forget(input, mockStorage, projectId, agentId);

      expect(result.deleted).toBe(true);
      expect(result.category).toBe('architecture');
    });

    it('should delete a shared learning', async () => {
      const memoryId = uuidv4();
      const learningMemory: Memory = {
        id: memoryId,
        agentId,
        projectId,
        scope: 'shared',
        category: 'learnings',
        content: 'Learning to forget',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
      };

      // Found in shared learnings (last category checked)
      vi.mocked(mockStorage.getFromProject)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(learningMemory);
      vi.mocked(mockStorage.deleteFromProject).mockResolvedValue(true);

      const input: ForgetInput = {
        memoryId,
      };

      const result = await forget(input, mockStorage, projectId, agentId);

      expect(result.deleted).toBe(true);
      expect(result.category).toBe('learnings');
    });
  });

  describe('Validation Errors', () => {
    it('should throw error when memoryId is empty', async () => {
      const input: ForgetInput = {
        memoryId: '',
      };

      await expect(
        forget(input, mockStorage, projectId, agentId)
      ).rejects.toThrow(PatternError);

      await expect(
        forget(input, mockStorage, projectId, agentId)
      ).rejects.toMatchObject({
        code: PatternErrorCode.VALIDATION_ERROR,
        message: 'Memory ID cannot be empty',
      });
    });

    it('should throw error when memoryId is only whitespace', async () => {
      const input: ForgetInput = {
        memoryId: '   ',
      };

      await expect(
        forget(input, mockStorage, projectId, agentId)
      ).rejects.toThrow(PatternError);

      await expect(
        forget(input, mockStorage, projectId, agentId)
      ).rejects.toMatchObject({
        code: PatternErrorCode.VALIDATION_ERROR,
      });
    });

    it('should throw error when memory is not found', async () => {
      const memoryId = uuidv4();

      // Mock not found in any category
      vi.mocked(mockStorage.getFromProject).mockResolvedValue(null);

      const input: ForgetInput = {
        memoryId,
      };

      await expect(
        forget(input, mockStorage, projectId, agentId)
      ).rejects.toMatchObject({
        code: PatternErrorCode.MEMORY_NOT_FOUND,
        message: expect.stringContaining('not found'),
        details: { memoryId },
      });

      // Verify all categories were checked (4 private + 3 shared = 7 total)
      expect(mockStorage.getFromProject).toHaveBeenCalledTimes(7);
    });
  });

  describe('Core Memory Protection', () => {
    it('should throw error when deleting core memory without force', async () => {
      const memoryId = uuidv4();
      const coreMemory: Memory = {
        id: memoryId,
        agentId,
        projectId,
        scope: 'private',
        category: 'core',
        content: 'Protected core memory',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
      };

      vi.mocked(mockStorage.getFromProject)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(coreMemory);

      const input: ForgetInput = {
        memoryId,
        force: false,
      };

      await expect(
        forget(input, mockStorage, projectId, agentId)
      ).rejects.toMatchObject({
        code: PatternErrorCode.CORE_PROTECTED,
        message: expect.stringContaining('force=true'),
        details: {
          memoryId,
          category: 'core',
        },
      });

      // Verify delete was not called
      expect(mockStorage.deleteFromProject).not.toHaveBeenCalled();
    });

    it('should throw error when deleting core memory with undefined force', async () => {
      const memoryId = uuidv4();
      const coreMemory: Memory = {
        id: memoryId,
        agentId,
        projectId,
        scope: 'private',
        category: 'core',
        content: 'Protected core memory',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
      };

      vi.mocked(mockStorage.getFromProject)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(coreMemory);

      const input: ForgetInput = {
        memoryId,
        // force is undefined
      };

      await expect(
        forget(input, mockStorage, projectId, agentId)
      ).rejects.toMatchObject({
        code: PatternErrorCode.CORE_PROTECTED,
      });

      expect(mockStorage.deleteFromProject).not.toHaveBeenCalled();
    });
  });

  describe('Access Control - Shared Memories', () => {
    it('should throw error when trying to delete shared memory created by another agent', async () => {
      const memoryId = uuidv4();
      const otherAgentId = 'other-agent-456';
      const sharedMemory: Memory = {
        id: memoryId,
        agentId: otherAgentId, // Created by different agent
        projectId,
        scope: 'shared',
        category: 'decisions',
        content: 'Decision by another agent',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
      };

      vi.mocked(mockStorage.getFromProject)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(sharedMemory);

      const input: ForgetInput = {
        memoryId,
      };

      await expect(
        forget(input, mockStorage, projectId, agentId)
      ).rejects.toMatchObject({
        code: PatternErrorCode.ACCESS_DENIED,
        message: expect.stringContaining('another agent'),
        details: {
          memoryId,
          creator: otherAgentId,
          currentAgent: agentId,
        },
      });

      // Verify delete was not called
      expect(mockStorage.deleteFromProject).not.toHaveBeenCalled();
    });

    it('should allow deleting shared memory created by current agent', async () => {
      const memoryId = uuidv4();
      const sharedMemory: Memory = {
        id: memoryId,
        agentId, // Created by current agent
        projectId,
        scope: 'shared',
        category: 'architecture',
        content: 'My architecture note',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
      };

      vi.mocked(mockStorage.getFromProject)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(sharedMemory);
      vi.mocked(mockStorage.deleteFromProject).mockResolvedValue(true);

      const input: ForgetInput = {
        memoryId,
      };

      const result = await forget(input, mockStorage, projectId, agentId);

      expect(result.deleted).toBe(true);
      expect(result.category).toBe('architecture');
    });
  });

  describe('Edge Cases', () => {
    it('should return false when storage deletion fails', async () => {
      const memoryId = uuidv4();
      const recentMemory: Memory = {
        id: memoryId,
        agentId,
        projectId,
        scope: 'private',
        category: 'recent',
        content: 'Memory that fails to delete',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
      };

      vi.mocked(mockStorage.getFromProject)
        .mockResolvedValueOnce(recentMemory);
      vi.mocked(mockStorage.deleteFromProject).mockResolvedValue(false);

      const input: ForgetInput = {
        memoryId,
      };

      const result = await forget(input, mockStorage, projectId, agentId);

      expect(result.deleted).toBe(false);
      expect(result.category).toBe('recent');
    });

    it('should search private categories before shared categories', async () => {
      const memoryId = uuidv4();
      const sharedMemory: Memory = {
        id: memoryId,
        agentId,
        projectId,
        scope: 'shared',
        category: 'decisions',
        content: 'Shared memory',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
      };

      // Not found in private, found in shared
      vi.mocked(mockStorage.getFromProject)
        .mockResolvedValueOnce(null) // recent
        .mockResolvedValueOnce(null) // tasks
        .mockResolvedValueOnce(null) // longterm
        .mockResolvedValueOnce(null) // core
        .mockResolvedValueOnce(sharedMemory); // decisions
      vi.mocked(mockStorage.deleteFromProject).mockResolvedValue(true);

      const input: ForgetInput = {
        memoryId,
      };

      await forget(input, mockStorage, projectId, agentId);

      // Verify search order: all private categories first
      expect(mockStorage.getFromProject).toHaveBeenNthCalledWith(
        1,
        `agents/${agentId}/recent/${memoryId}`,
        projectId
      );
      expect(mockStorage.getFromProject).toHaveBeenNthCalledWith(
        2,
        `agents/${agentId}/tasks/${memoryId}`,
        projectId
      );
      expect(mockStorage.getFromProject).toHaveBeenNthCalledWith(
        3,
        `agents/${agentId}/longterm/${memoryId}`,
        projectId
      );
      expect(mockStorage.getFromProject).toHaveBeenNthCalledWith(
        4,
        `agents/${agentId}/core/${memoryId}`,
        projectId
      );
      expect(mockStorage.getFromProject).toHaveBeenNthCalledWith(
        5,
        `shared/decisions/${memoryId}`,
        projectId
      );
    });

    it('should stop searching after finding memory in first category', async () => {
      const memoryId = uuidv4();
      const recentMemory: Memory = {
        id: memoryId,
        agentId,
        projectId,
        scope: 'private',
        category: 'recent',
        content: 'Found in first category',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
      };

      vi.mocked(mockStorage.getFromProject)
        .mockResolvedValueOnce(recentMemory);
      vi.mocked(mockStorage.deleteFromProject).mockResolvedValue(true);

      const input: ForgetInput = {
        memoryId,
      };

      await forget(input, mockStorage, projectId, agentId);

      // Should only check the first category
      expect(mockStorage.getFromProject).toHaveBeenCalledTimes(1);
    });

    it('should handle memory with metadata', async () => {
      const memoryId = uuidv4();
      const memoryWithMetadata: Memory = {
        id: memoryId,
        agentId,
        projectId,
        scope: 'private',
        category: 'longterm',
        content: 'Memory with metadata',
        metadata: {
          tags: ['important'],
          priority: 1,
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
      };

      vi.mocked(mockStorage.getFromProject)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(memoryWithMetadata);
      vi.mocked(mockStorage.deleteFromProject).mockResolvedValue(true);

      const input: ForgetInput = {
        memoryId,
      };

      const result = await forget(input, mockStorage, projectId, agentId);

      expect(result.deleted).toBe(true);
      expect(result.category).toBe('longterm');
    });

    it('should handle memory with expiresAt', async () => {
      const memoryId = uuidv4();
      const memoryWithTTL: Memory = {
        id: memoryId,
        agentId,
        projectId,
        scope: 'private',
        category: 'tasks',
        content: 'Memory with TTL',
        expiresAt: new Date(Date.now() + 86400 * 1000).toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
      };

      vi.mocked(mockStorage.getFromProject)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(memoryWithTTL);
      vi.mocked(mockStorage.deleteFromProject).mockResolvedValue(true);

      const input: ForgetInput = {
        memoryId,
      };

      const result = await forget(input, mockStorage, projectId, agentId);

      expect(result.deleted).toBe(true);
      expect(result.category).toBe('tasks');
    });
  });
});
