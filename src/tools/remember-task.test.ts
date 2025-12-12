/**
 * Tests for remember-task tool
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { rememberTask, type RememberTaskInput } from './remember-task.js';
import type { NatsKvBackend } from '../storage/nats-kv.js';
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
  } as unknown as NatsKvBackend;
  return mockStorage;
};

describe('remember-task tool', () => {
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
    it('should store a basic task memory', async () => {
      const input: RememberTaskInput = {
        content: 'Implement user authentication',
      };

      const result = await rememberTask(input, storage, projectId, agentId);

      expect(result.memoryId).toBeDefined();
      expect(result.memoryId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i); // UUID v4 format
      expect(result.expiresAt).toBeDefined(); // tasks always have 24h TTL

      expect(storage.set).toHaveBeenCalledTimes(1);
      const [key, memory, ttl] = (storage.set as any).mock.calls[0];

      expect(key).toBe(`agents/${agentId}/tasks/${result.memoryId}`);
      expect(memory).toMatchObject({
        id: result.memoryId,
        agentId,
        projectId,
        scope: 'private', // Always private for tasks
        category: 'tasks', // Always tasks
        content: 'Implement user authentication',
        version: 1,
      });
      expect(memory.createdAt).toBeDefined();
      expect(memory.updatedAt).toBeDefined();
      expect(memory.expiresAt).toBeDefined();
      expect(ttl).toBe(86400); // 24 hours in seconds
    });

    it('should store task with metadata', async () => {
      const input: RememberTaskInput = {
        content: 'Fix bug in payment processing',
        metadata: {
          tags: ['bug', 'critical', 'payment'],
          priority: 1,
          source: 'issue-tracker',
        },
      };

      const result = await rememberTask(input, storage, projectId, agentId);

      expect(result.memoryId).toBeDefined();
      expect(result.expiresAt).toBeDefined();

      const [, memory] = (storage.set as any).mock.calls[0];
      expect(memory.metadata).toEqual({
        tags: ['bug', 'critical', 'payment'],
        priority: 1,
        source: 'issue-tracker',
      });
    });

    it('should store task with relatedTo metadata', async () => {
      const input: RememberTaskInput = {
        content: 'Review pull request #123',
        metadata: {
          relatedTo: ['task-456', 'task-789'],
          tags: ['review'],
        },
      };

      const result = await rememberTask(input, storage, projectId, agentId);

      const [, memory] = (storage.set as any).mock.calls[0];
      expect(memory.metadata?.relatedTo).toEqual(['task-456', 'task-789']);
      expect(memory.metadata?.tags).toEqual(['review']);
    });

    it('should store multiple tasks independently', async () => {
      const tasks = [
        'Task 1: Write unit tests',
        'Task 2: Update documentation',
        'Task 3: Refactor API endpoints',
      ];

      const results = [];
      for (const content of tasks) {
        const result = await rememberTask({ content }, storage, projectId, agentId);
        results.push(result);
      }

      expect(storage.set).toHaveBeenCalledTimes(3);
      expect(results.every((r) => r.expiresAt)).toBe(true);

      // All memory IDs should be unique
      const ids = results.map((r) => r.memoryId);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(3);
    });

    it('should always use private scope regardless of input', async () => {
      const input: RememberTaskInput = {
        content: 'This task should be private',
      };

      await rememberTask(input, storage, projectId, agentId);

      const [, memory] = (storage.set as any).mock.calls[0];
      expect(memory.scope).toBe('private');
    });

    it('should always use tasks category regardless of input', async () => {
      const input: RememberTaskInput = {
        content: 'This is definitely a task',
      };

      await rememberTask(input, storage, projectId, agentId);

      const [, memory] = (storage.set as any).mock.calls[0];
      expect(memory.category).toBe('tasks');
    });
  });

  describe('Validation Errors', () => {
    it('should reject empty content', async () => {
      const input: RememberTaskInput = {
        content: '',
      };

      await expect(rememberTask(input, storage, projectId, agentId)).rejects.toThrow(
        PatternError
      );
      await expect(rememberTask(input, storage, projectId, agentId)).rejects.toThrow(
        'Content cannot be empty'
      );

      try {
        await rememberTask(input, storage, projectId, agentId);
      } catch (error) {
        expect(error).toBeInstanceOf(PatternError);
        expect((error as PatternError).code).toBe(PatternErrorCode.VALIDATION_ERROR);
      }
    });

    it('should reject whitespace-only content', async () => {
      const input: RememberTaskInput = {
        content: '   \n\t  ',
      };

      await expect(rememberTask(input, storage, projectId, agentId)).rejects.toThrow(
        'Content cannot be empty'
      );
    });

    it('should reject content exceeding max size (32KB)', async () => {
      const largeContent = 'a'.repeat(32 * 1024 + 1); // 32KB + 1 byte
      const input: RememberTaskInput = {
        content: largeContent,
      };

      await expect(rememberTask(input, storage, projectId, agentId)).rejects.toThrow(
        PatternError
      );

      try {
        await rememberTask(input, storage, projectId, agentId);
      } catch (error) {
        expect(error).toBeInstanceOf(PatternError);
        expect((error as PatternError).code).toBe(PatternErrorCode.VALIDATION_ERROR);
        expect((error as PatternError).message).toContain('exceeds maximum');
        expect((error as PatternError).details).toMatchObject({
          maxSize: 32 * 1024,
        });
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle content at exactly max size (32KB)', async () => {
      const maxContent = 'a'.repeat(32 * 1024); // Exactly 32KB
      const input: RememberTaskInput = {
        content: maxContent,
      };

      const result = await rememberTask(input, storage, projectId, agentId);

      expect(result.memoryId).toBeDefined();
      expect(storage.set).toHaveBeenCalledTimes(1);

      const [, memory] = (storage.set as any).mock.calls[0];
      expect(memory.content).toBe(maxContent);
    });

    it('should handle special characters in content', async () => {
      const specialContent = 'Task: Handle special chars \n\t\r"\'\\中文🎉@#$%^&*()';
      const input: RememberTaskInput = {
        content: specialContent,
      };

      const result = await rememberTask(input, storage, projectId, agentId);

      expect(result.memoryId).toBeDefined();

      const [, memory] = (storage.set as any).mock.calls[0];
      expect(memory.content).toBe(specialContent);
    });

    it('should handle Unicode content correctly for size calculation', async () => {
      // Some Unicode characters take multiple bytes
      const unicodeContent = '任务：'.repeat(10000); // Chinese characters
      const input: RememberTaskInput = {
        content: unicodeContent,
      };

      const byteLength = Buffer.byteLength(unicodeContent, 'utf8');

      if (byteLength > 32 * 1024) {
        await expect(rememberTask(input, storage, projectId, agentId)).rejects.toThrow(
          PatternError
        );
      } else {
        const result = await rememberTask(input, storage, projectId, agentId);
        expect(result.memoryId).toBeDefined();
      }
    });

    it('should handle very long task descriptions', async () => {
      const longTask = 'x'.repeat(20000); // 20KB task description
      const input: RememberTaskInput = {
        content: longTask,
      };

      const result = await rememberTask(input, storage, projectId, agentId);
      expect(result.memoryId).toBeDefined();
    });

    it('should handle metadata with empty arrays', async () => {
      const input: RememberTaskInput = {
        content: 'Task with empty metadata',
        metadata: {
          tags: [],
          relatedTo: [],
        },
      };

      const result = await rememberTask(input, storage, projectId, agentId);

      const [, memory] = (storage.set as any).mock.calls[0];
      expect(memory.metadata).toEqual({
        tags: [],
        relatedTo: [],
      });
    });

    it('should not include metadata field if not provided', async () => {
      const input: RememberTaskInput = {
        content: 'Task without metadata',
      };

      await rememberTask(input, storage, projectId, agentId);

      const [, memory] = (storage.set as any).mock.calls[0];
      expect(memory.metadata).toBeUndefined();
    });

    it('should generate unique IDs for concurrent task creation', async () => {
      const input: RememberTaskInput = {
        content: 'Concurrent task',
      };

      const promises = Array(10)
        .fill(null)
        .map(() => rememberTask(input, storage, projectId, agentId));

      const results = await Promise.all(promises);
      const ids = results.map((r) => r.memoryId);

      // All IDs should be unique
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(10);
    });

    it('should handle single character content', async () => {
      const input: RememberTaskInput = {
        content: 'x',
      };

      const result = await rememberTask(input, storage, projectId, agentId);
      expect(result.memoryId).toBeDefined();

      const [, memory] = (storage.set as any).mock.calls[0];
      expect(memory.content).toBe('x');
    });

    it('should handle structured task content', async () => {
      const structuredTask = `
Task: Implement OAuth2 authentication
- Set up OAuth provider
- Create callback endpoints
- Implement token refresh
- Add user session management
      `;

      const input: RememberTaskInput = {
        content: structuredTask,
      };

      const result = await rememberTask(input, storage, projectId, agentId);
      expect(result.memoryId).toBeDefined();

      const [, memory] = (storage.set as any).mock.calls[0];
      expect(memory.content).toBe(structuredTask);
    });

    it('should handle metadata with all fields', async () => {
      const input: RememberTaskInput = {
        content: 'Comprehensive task',
        metadata: {
          tags: ['backend', 'api', 'urgent'],
          priority: 1,
          relatedTo: ['task-1', 'task-2'],
          source: 'project-management',
        },
      };

      await rememberTask(input, storage, projectId, agentId);

      const [, memory] = (storage.set as any).mock.calls[0];
      expect(memory.metadata).toEqual({
        tags: ['backend', 'api', 'urgent'],
        priority: 1,
        relatedTo: ['task-1', 'task-2'],
        source: 'project-management',
      });
    });
  });

  describe('TTL Behavior', () => {
    it('should always set 24h TTL for tasks', async () => {
      const input: RememberTaskInput = {
        content: 'Task with TTL',
      };

      const result = await rememberTask(input, storage, projectId, agentId);

      expect(result.expiresAt).toBeDefined();

      const [, , ttl] = (storage.set as any).mock.calls[0];
      expect(ttl).toBe(86400); // 24 hours in seconds
    });

    it('should calculate correct expiresAt timestamp', async () => {
      const beforeCall = Date.now();
      const input: RememberTaskInput = {
        content: 'Task to check expiry',
      };

      const result = await rememberTask(input, storage, projectId, agentId);

      expect(result.expiresAt).toBeDefined();
      const expiresAt = new Date(result.expiresAt!).getTime();
      const expectedExpiry = beforeCall + 86400 * 1000; // 24 hours

      // Should be within 1 second of expected
      expect(Math.abs(expiresAt - expectedExpiry)).toBeLessThan(1000);
    });

    it('should store expiresAt in memory object', async () => {
      const input: RememberTaskInput = {
        content: 'Task with expiry',
      };

      await rememberTask(input, storage, projectId, agentId);

      const [, memory] = (storage.set as any).mock.calls[0];
      expect(memory.expiresAt).toBeDefined();
      expect(memory.expiresAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/); // ISO 8601 format
    });
  });

  describe('Storage Key Generation', () => {
    it('should generate correct key format', async () => {
      const input: RememberTaskInput = {
        content: 'Test task',
      };

      const result = await rememberTask(input, storage, projectId, agentId);

      const [key] = (storage.set as any).mock.calls[0];
      expect(key).toBe(`agents/${agentId}/tasks/${result.memoryId}`);
    });

    it('should use agentId in key for private scope', async () => {
      const input: RememberTaskInput = {
        content: 'Agent-specific task',
      };

      await rememberTask(input, storage, projectId, agentId);

      const [key] = (storage.set as any).mock.calls[0];
      expect(key).toContain(`agents/${agentId}`);
    });

    it('should use tasks category in key', async () => {
      const input: RememberTaskInput = {
        content: 'Task category key',
      };

      await rememberTask(input, storage, projectId, agentId);

      const [key] = (storage.set as any).mock.calls[0];
      expect(key).toContain('/tasks/');
    });
  });

  describe('Timestamp Behavior', () => {
    it('should set createdAt and updatedAt to same value', async () => {
      const input: RememberTaskInput = {
        content: 'Timestamp test',
      };

      await rememberTask(input, storage, projectId, agentId);

      const [, memory] = (storage.set as any).mock.calls[0];
      expect(memory.createdAt).toBe(memory.updatedAt);
    });

    it('should set timestamps to current time', async () => {
      const beforeCall = Date.now();
      const input: RememberTaskInput = {
        content: 'Time test',
      };

      await rememberTask(input, storage, projectId, agentId);
      const afterCall = Date.now();

      const [, memory] = (storage.set as any).mock.calls[0];
      const createdAt = new Date(memory.createdAt).getTime();

      expect(createdAt).toBeGreaterThanOrEqual(beforeCall);
      expect(createdAt).toBeLessThanOrEqual(afterCall);
    });

    it('should use ISO 8601 format for timestamps', async () => {
      const input: RememberTaskInput = {
        content: 'ISO format test',
      };

      await rememberTask(input, storage, projectId, agentId);

      const [, memory] = (storage.set as any).mock.calls[0];
      expect(memory.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      expect(memory.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });
  });
});
