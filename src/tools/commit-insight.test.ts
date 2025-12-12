/**
 * Tests for commit-insight tool
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { commitInsight, type CommitInsightInput } from './commit-insight.js';
import type { NatsKvBackend } from '../storage/nats-kv.js';
import type { Memory } from '../types.js';
import { PatternError, PatternErrorCode } from '../types.js';
import { v4 as uuidv4 } from 'uuid';

describe('commit-insight tool', () => {
  let mockStorage: NatsKvBackend;
  const projectId = 'test-project';
  const agentId = 'test-agent-123';

  beforeEach(() => {
    // Create mock storage
    mockStorage = {
      getFromProject: vi.fn(),
      set: vi.fn(),
      deleteFromProject: vi.fn(),
    } as unknown as NatsKvBackend;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Happy Path Scenarios', () => {
    it('should commit a recent memory to longterm', async () => {
      const memoryId = uuidv4();
      const recentMemory: Memory = {
        id: memoryId,
        agentId,
        projectId,
        scope: 'private',
        category: 'recent',
        content: 'Important insight from recent work',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400 * 1000).toISOString(),
        version: 1,
      };

      // Mock storage to return the recent memory
      vi.mocked(mockStorage.getFromProject)
        .mockResolvedValueOnce(recentMemory)
        .mockResolvedValue(null);

      vi.mocked(mockStorage.set).mockResolvedValue();
      vi.mocked(mockStorage.deleteFromProject).mockResolvedValue(true);

      const input: CommitInsightInput = {
        memoryId,
      };

      const result = await commitInsight(input, mockStorage, projectId, agentId);

      expect(result.memoryId).toBe(memoryId);
      expect(result.previousCategory).toBe('recent');

      // Verify storage interactions
      expect(mockStorage.getFromProject).toHaveBeenCalledWith(
        `agents/${agentId}/recent/${memoryId}`,
        projectId
      );

      // Verify the memory was stored with updated category and no TTL
      expect(mockStorage.set).toHaveBeenCalledWith(
        `agents/${agentId}/longterm/${memoryId}`,
        expect.objectContaining({
          id: memoryId,
          category: 'longterm',
          content: 'Important insight from recent work',
        })
      );

      // Verify expiresAt was removed
      const setCall = vi.mocked(mockStorage.set).mock.calls[0];
      const storedMemory = setCall[1] as Memory;
      expect(storedMemory.expiresAt).toBeUndefined();

      // Verify old memory was deleted
      expect(mockStorage.deleteFromProject).toHaveBeenCalledWith(
        `agents/${agentId}/recent/${memoryId}`,
        projectId
      );
    });

    it('should commit a task memory to longterm', async () => {
      const memoryId = uuidv4();
      const taskMemory: Memory = {
        id: memoryId,
        agentId,
        projectId,
        scope: 'private',
        category: 'tasks',
        content: 'Completed task with valuable learning',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400 * 1000).toISOString(),
        version: 1,
      };

      // Mock storage - first call returns null (not found in recent), second returns the task
      vi.mocked(mockStorage.getFromProject)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(taskMemory);

      vi.mocked(mockStorage.set).mockResolvedValue();
      vi.mocked(mockStorage.deleteFromProject).mockResolvedValue(true);

      const input: CommitInsightInput = {
        memoryId,
      };

      const result = await commitInsight(input, mockStorage, projectId, agentId);

      expect(result.memoryId).toBe(memoryId);
      expect(result.previousCategory).toBe('tasks');

      // Verify both categories were checked
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

    it('should update memory content when newContent is provided', async () => {
      const memoryId = uuidv4();
      const recentMemory: Memory = {
        id: memoryId,
        agentId,
        projectId,
        scope: 'private',
        category: 'recent',
        content: 'Original content',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
      };

      vi.mocked(mockStorage.getFromProject)
        .mockResolvedValueOnce(recentMemory)
        .mockResolvedValue(null);

      vi.mocked(mockStorage.set).mockResolvedValue();
      vi.mocked(mockStorage.deleteFromProject).mockResolvedValue(true);

      const input: CommitInsightInput = {
        memoryId,
        newContent: 'Updated content with additional context',
      };

      await commitInsight(input, mockStorage, projectId, agentId);

      // Verify the content was updated
      expect(mockStorage.set).toHaveBeenCalledWith(
        `agents/${agentId}/longterm/${memoryId}`,
        expect.objectContaining({
          content: 'Updated content with additional context',
        })
      );
    });

    it('should preserve metadata when committing', async () => {
      const memoryId = uuidv4();
      const recentMemory: Memory = {
        id: memoryId,
        agentId,
        projectId,
        scope: 'private',
        category: 'recent',
        content: 'Memory with metadata',
        metadata: {
          tags: ['important', 'api-design'],
          priority: 1,
          relatedTo: ['other-memory-id'],
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
      };

      vi.mocked(mockStorage.getFromProject)
        .mockResolvedValueOnce(recentMemory)
        .mockResolvedValue(null);

      vi.mocked(mockStorage.set).mockResolvedValue();
      vi.mocked(mockStorage.deleteFromProject).mockResolvedValue(true);

      const input: CommitInsightInput = {
        memoryId,
      };

      await commitInsight(input, mockStorage, projectId, agentId);

      // Verify metadata was preserved
      expect(mockStorage.set).toHaveBeenCalledWith(
        `agents/${agentId}/longterm/${memoryId}`,
        expect.objectContaining({
          metadata: {
            tags: ['important', 'api-design'],
            priority: 1,
            relatedTo: ['other-memory-id'],
          },
        })
      );
    });
  });

  describe('Validation Errors', () => {
    it('should throw error when memoryId is empty', async () => {
      const input: CommitInsightInput = {
        memoryId: '',
      };

      await expect(
        commitInsight(input, mockStorage, projectId, agentId)
      ).rejects.toThrow(PatternError);

      await expect(
        commitInsight(input, mockStorage, projectId, agentId)
      ).rejects.toMatchObject({
        code: PatternErrorCode.VALIDATION_ERROR,
        message: 'Memory ID cannot be empty',
      });
    });

    it('should throw error when memoryId is only whitespace', async () => {
      const input: CommitInsightInput = {
        memoryId: '   ',
      };

      await expect(
        commitInsight(input, mockStorage, projectId, agentId)
      ).rejects.toThrow(PatternError);

      await expect(
        commitInsight(input, mockStorage, projectId, agentId)
      ).rejects.toMatchObject({
        code: PatternErrorCode.VALIDATION_ERROR,
      });
    });

    it('should throw error when memory is not found', async () => {
      const memoryId = uuidv4();

      // Mock storage to return null for all categories
      vi.mocked(mockStorage.getFromProject).mockResolvedValue(null);

      const input: CommitInsightInput = {
        memoryId,
      };

      await expect(
        commitInsight(input, mockStorage, projectId, agentId)
      ).rejects.toThrow(PatternError);

      await expect(
        commitInsight(input, mockStorage, projectId, agentId)
      ).rejects.toMatchObject({
        code: PatternErrorCode.MEMORY_NOT_FOUND,
        message: expect.stringContaining('not found in \'recent\' or \'tasks\' categories'),
        details: { memoryId },
      });

      // Verify both categories were checked
      expect(mockStorage.getFromProject).toHaveBeenCalledWith(
        `agents/${agentId}/recent/${memoryId}`,
        projectId
      );
      expect(mockStorage.getFromProject).toHaveBeenCalledWith(
        `agents/${agentId}/tasks/${memoryId}`,
        projectId
      );
    });

    it('should throw error when memory is already longterm', async () => {
      const memoryId = uuidv4();
      const longtermMemory: Memory = {
        id: memoryId,
        agentId,
        projectId,
        scope: 'private',
        category: 'longterm',
        content: 'Already committed',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
      };

      vi.mocked(mockStorage.getFromProject)
        .mockResolvedValue(longtermMemory);

      const input: CommitInsightInput = {
        memoryId,
      };

      await expect(
        commitInsight(input, mockStorage, projectId, agentId)
      ).rejects.toMatchObject({
        code: PatternErrorCode.VALIDATION_ERROR,
        message: expect.stringContaining('already in \'longterm\' category'),
        details: {
          memoryId,
          category: 'longterm',
        },
      });
    });

    it('should throw error when memory is core (protected)', async () => {
      const memoryId = uuidv4();
      const coreMemory: Memory = {
        id: memoryId,
        agentId,
        projectId,
        scope: 'private',
        category: 'core',
        content: 'Core identity memory',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
      };

      vi.mocked(mockStorage.getFromProject)
        .mockResolvedValue(coreMemory);

      const input: CommitInsightInput = {
        memoryId,
      };

      await expect(
        commitInsight(input, mockStorage, projectId, agentId)
      ).rejects.toMatchObject({
        code: PatternErrorCode.CORE_PROTECTED,
        message: expect.stringContaining('core'),
        details: {
          memoryId,
          category: 'core',
        },
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle memory without expiresAt property', async () => {
      const memoryId = uuidv4();
      const recentMemory: Memory = {
        id: memoryId,
        agentId,
        projectId,
        scope: 'private',
        category: 'recent',
        content: 'Memory without TTL',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
        // No expiresAt property
      };

      vi.mocked(mockStorage.getFromProject)
        .mockResolvedValueOnce(recentMemory)
        .mockResolvedValue(null);

      vi.mocked(mockStorage.set).mockResolvedValue();
      vi.mocked(mockStorage.deleteFromProject).mockResolvedValue(true);

      const input: CommitInsightInput = {
        memoryId,
      };

      await commitInsight(input, mockStorage, projectId, agentId);

      // Should succeed and the stored memory should not have expiresAt
      const setCall = vi.mocked(mockStorage.set).mock.calls[0];
      const storedMemory = setCall[1] as Memory;
      expect(storedMemory.expiresAt).toBeUndefined();
    });

    it('should update updatedAt timestamp when committing', async () => {
      const memoryId = uuidv4();
      const pastDate = new Date('2023-01-01T00:00:00Z').toISOString();
      const recentMemory: Memory = {
        id: memoryId,
        agentId,
        projectId,
        scope: 'private',
        category: 'recent',
        content: 'Old memory',
        createdAt: pastDate,
        updatedAt: pastDate,
        version: 1,
      };

      vi.mocked(mockStorage.getFromProject)
        .mockResolvedValueOnce(recentMemory)
        .mockResolvedValue(null);

      vi.mocked(mockStorage.set).mockResolvedValue();
      vi.mocked(mockStorage.deleteFromProject).mockResolvedValue(true);

      const input: CommitInsightInput = {
        memoryId,
      };

      await commitInsight(input, mockStorage, projectId, agentId);

      // Verify updatedAt was updated
      const setCall = vi.mocked(mockStorage.set).mock.calls[0];
      const storedMemory = setCall[1] as Memory;
      expect(storedMemory.updatedAt).not.toBe(pastDate);
      expect(new Date(storedMemory.updatedAt).getTime()).toBeGreaterThan(
        new Date(pastDate).getTime()
      );
    });

    it('should preserve createdAt timestamp when committing', async () => {
      const memoryId = uuidv4();
      const pastDate = new Date('2023-01-01T00:00:00Z').toISOString();
      const recentMemory: Memory = {
        id: memoryId,
        agentId,
        projectId,
        scope: 'private',
        category: 'recent',
        content: 'Old memory',
        createdAt: pastDate,
        updatedAt: pastDate,
        version: 1,
      };

      vi.mocked(mockStorage.getFromProject)
        .mockResolvedValueOnce(recentMemory)
        .mockResolvedValue(null);

      vi.mocked(mockStorage.set).mockResolvedValue();
      vi.mocked(mockStorage.deleteFromProject).mockResolvedValue(true);

      const input: CommitInsightInput = {
        memoryId,
      };

      await commitInsight(input, mockStorage, projectId, agentId);

      // Verify createdAt was preserved
      const setCall = vi.mocked(mockStorage.set).mock.calls[0];
      const storedMemory = setCall[1] as Memory;
      expect(storedMemory.createdAt).toBe(pastDate);
    });

    it('should handle empty newContent string', async () => {
      const memoryId = uuidv4();
      const recentMemory: Memory = {
        id: memoryId,
        agentId,
        projectId,
        scope: 'private',
        category: 'recent',
        content: 'Original content',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
      };

      vi.mocked(mockStorage.getFromProject)
        .mockResolvedValueOnce(recentMemory)
        .mockResolvedValue(null);

      vi.mocked(mockStorage.set).mockResolvedValue();
      vi.mocked(mockStorage.deleteFromProject).mockResolvedValue(true);

      const input: CommitInsightInput = {
        memoryId,
        newContent: '', // Empty string (but not undefined)
      };

      await commitInsight(input, mockStorage, projectId, agentId);

      // Should update to empty content
      expect(mockStorage.set).toHaveBeenCalledWith(
        `agents/${agentId}/longterm/${memoryId}`,
        expect.objectContaining({
          content: '',
        })
      );
    });

    it('should preserve version number when committing', async () => {
      const memoryId = uuidv4();
      const recentMemory: Memory = {
        id: memoryId,
        agentId,
        projectId,
        scope: 'private',
        category: 'recent',
        content: 'Memory content',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
      };

      vi.mocked(mockStorage.getFromProject)
        .mockResolvedValueOnce(recentMemory)
        .mockResolvedValue(null);

      vi.mocked(mockStorage.set).mockResolvedValue();
      vi.mocked(mockStorage.deleteFromProject).mockResolvedValue(true);

      const input: CommitInsightInput = {
        memoryId,
      };

      await commitInsight(input, mockStorage, projectId, agentId);

      // Verify version was preserved
      const setCall = vi.mocked(mockStorage.set).mock.calls[0];
      const storedMemory = setCall[1] as Memory;
      expect(storedMemory.version).toBe(1);
    });
  });
});
