/**
 * Tests for remember-learning tool
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { rememberLearning, type RememberLearningInput } from './remember-learning.js';
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

describe('remember-learning tool', () => {
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
    it('should store a basic learning memory', async () => {
      const input: RememberLearningInput = {
        content: 'Learned that React hooks simplify state management',
      };

      const result = await rememberLearning(input, storage, projectId, agentId);

      expect(result.memoryId).toBeDefined();
      expect(result.memoryId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i); // UUID v4 format
      expect(result.expiresAt).toBeDefined(); // recent category has 24h TTL

      expect(storage.set).toHaveBeenCalledTimes(1);
      const [key, memory, ttl] = (storage.set as any).mock.calls[0];

      expect(key).toBe(`agents/${agentId}/recent/${result.memoryId}`);
      expect(memory).toMatchObject({
        id: result.memoryId,
        agentId,
        projectId,
        scope: 'private', // Always private for learnings
        category: 'recent', // Always recent
        content: 'Learned that React hooks simplify state management',
        version: 1,
      });
      expect(memory.createdAt).toBeDefined();
      expect(memory.updatedAt).toBeDefined();
      expect(memory.expiresAt).toBeDefined();
      expect(ttl).toBe(86400); // 24 hours in seconds
    });

    it('should store learning with metadata', async () => {
      const input: RememberLearningInput = {
        content: 'Discovered that caching reduces database load',
        metadata: {
          tags: ['performance', 'optimization', 'database'],
          priority: 1,
          source: 'experimentation',
        },
      };

      const result = await rememberLearning(input, storage, projectId, agentId);

      expect(result.memoryId).toBeDefined();
      expect(result.expiresAt).toBeDefined();

      const [, memory] = (storage.set as any).mock.calls[0];
      expect(memory.metadata).toEqual({
        tags: ['performance', 'optimization', 'database'],
        priority: 1,
        source: 'experimentation',
      });
    });

    it('should store learning with relatedTo metadata', async () => {
      const input: RememberLearningInput = {
        content: 'Understanding microservices requires knowledge of distributed systems',
        metadata: {
          relatedTo: ['learning-123', 'learning-456'],
          tags: ['architecture'],
        },
      };

      const result = await rememberLearning(input, storage, projectId, agentId);

      const [, memory] = (storage.set as any).mock.calls[0];
      expect(memory.metadata?.relatedTo).toEqual(['learning-123', 'learning-456']);
      expect(memory.metadata?.tags).toEqual(['architecture']);
    });

    it('should store multiple learnings independently', async () => {
      const learnings = [
        'Learning 1: TypeScript provides better type safety than JavaScript',
        'Learning 2: Test-driven development improves code quality',
        'Learning 3: CI/CD pipelines automate deployment processes',
      ];

      const results = [];
      for (const content of learnings) {
        const result = await rememberLearning({ content }, storage, projectId, agentId);
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
      const input: RememberLearningInput = {
        content: 'This learning should be private',
      };

      await rememberLearning(input, storage, projectId, agentId);

      const [, memory] = (storage.set as any).mock.calls[0];
      expect(memory.scope).toBe('private');
    });

    it('should always use recent category regardless of input', async () => {
      const input: RememberLearningInput = {
        content: 'This is a recent learning',
      };

      await rememberLearning(input, storage, projectId, agentId);

      const [, memory] = (storage.set as any).mock.calls[0];
      expect(memory.category).toBe('recent');
    });
  });

  describe('Validation Errors', () => {
    it('should reject empty content', async () => {
      const input: RememberLearningInput = {
        content: '',
      };

      await expect(rememberLearning(input, storage, projectId, agentId)).rejects.toThrow(
        PatternError
      );
      await expect(rememberLearning(input, storage, projectId, agentId)).rejects.toThrow(
        'Content cannot be empty'
      );

      try {
        await rememberLearning(input, storage, projectId, agentId);
      } catch (error) {
        expect(error).toBeInstanceOf(PatternError);
        expect((error as PatternError).code).toBe(PatternErrorCode.VALIDATION_ERROR);
      }
    });

    it('should reject whitespace-only content', async () => {
      const input: RememberLearningInput = {
        content: '   \n\t  ',
      };

      await expect(rememberLearning(input, storage, projectId, agentId)).rejects.toThrow(
        'Content cannot be empty'
      );
    });

    it('should reject content exceeding max size (32KB)', async () => {
      const largeContent = 'a'.repeat(32 * 1024 + 1); // 32KB + 1 byte
      const input: RememberLearningInput = {
        content: largeContent,
      };

      await expect(rememberLearning(input, storage, projectId, agentId)).rejects.toThrow(
        PatternError
      );

      try {
        await rememberLearning(input, storage, projectId, agentId);
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
      const input: RememberLearningInput = {
        content: maxContent,
      };

      const result = await rememberLearning(input, storage, projectId, agentId);

      expect(result.memoryId).toBeDefined();
      expect(storage.set).toHaveBeenCalledTimes(1);

      const [, memory] = (storage.set as any).mock.calls[0];
      expect(memory.content).toBe(maxContent);
    });

    it('should handle special characters in content', async () => {
      const specialContent = 'Learning: Handle special chars \n\t\r"\'\\中文🎉@#$%^&*()';
      const input: RememberLearningInput = {
        content: specialContent,
      };

      const result = await rememberLearning(input, storage, projectId, agentId);

      expect(result.memoryId).toBeDefined();

      const [, memory] = (storage.set as any).mock.calls[0];
      expect(memory.content).toBe(specialContent);
    });

    it('should handle Unicode content correctly for size calculation', async () => {
      // Some Unicode characters take multiple bytes
      const unicodeContent = '学习：'.repeat(10000); // Chinese characters
      const input: RememberLearningInput = {
        content: unicodeContent,
      };

      const byteLength = Buffer.byteLength(unicodeContent, 'utf8');

      if (byteLength > 32 * 1024) {
        await expect(rememberLearning(input, storage, projectId, agentId)).rejects.toThrow(
          PatternError
        );
      } else {
        const result = await rememberLearning(input, storage, projectId, agentId);
        expect(result.memoryId).toBeDefined();
      }
    });

    it('should handle very long learning descriptions', async () => {
      const longLearning = 'x'.repeat(20000); // 20KB learning description
      const input: RememberLearningInput = {
        content: longLearning,
      };

      const result = await rememberLearning(input, storage, projectId, agentId);
      expect(result.memoryId).toBeDefined();
    });

    it('should handle metadata with empty arrays', async () => {
      const input: RememberLearningInput = {
        content: 'Learning with empty metadata',
        metadata: {
          tags: [],
          relatedTo: [],
        },
      };

      const result = await rememberLearning(input, storage, projectId, agentId);

      const [, memory] = (storage.set as any).mock.calls[0];
      expect(memory.metadata).toEqual({
        tags: [],
        relatedTo: [],
      });
    });

    it('should not include metadata field if not provided', async () => {
      const input: RememberLearningInput = {
        content: 'Learning without metadata',
      };

      await rememberLearning(input, storage, projectId, agentId);

      const [, memory] = (storage.set as any).mock.calls[0];
      expect(memory.metadata).toBeUndefined();
    });

    it('should generate unique IDs for concurrent learning creation', async () => {
      const input: RememberLearningInput = {
        content: 'Concurrent learning',
      };

      const promises = Array(10)
        .fill(null)
        .map(() => rememberLearning(input, storage, projectId, agentId));

      const results = await Promise.all(promises);
      const ids = results.map((r) => r.memoryId);

      // All IDs should be unique
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(10);
    });

    it('should handle single character content', async () => {
      const input: RememberLearningInput = {
        content: 'x',
      };

      const result = await rememberLearning(input, storage, projectId, agentId);
      expect(result.memoryId).toBeDefined();

      const [, memory] = (storage.set as any).mock.calls[0];
      expect(memory.content).toBe('x');
    });

    it('should handle structured learning content', async () => {
      const structuredLearning = `
Learning: Best practices for API design
- Use RESTful conventions
- Implement proper error handling
- Version your APIs
- Document endpoints thoroughly
- Use HTTP status codes correctly
      `;

      const input: RememberLearningInput = {
        content: structuredLearning,
      };

      const result = await rememberLearning(input, storage, projectId, agentId);
      expect(result.memoryId).toBeDefined();

      const [, memory] = (storage.set as any).mock.calls[0];
      expect(memory.content).toBe(structuredLearning);
    });

    it('should handle metadata with all fields', async () => {
      const input: RememberLearningInput = {
        content: 'Comprehensive learning',
        metadata: {
          tags: ['programming', 'best-practices', 'important'],
          priority: 1,
          relatedTo: ['learning-1', 'learning-2'],
          source: 'documentation',
        },
      };

      await rememberLearning(input, storage, projectId, agentId);

      const [, memory] = (storage.set as any).mock.calls[0];
      expect(memory.metadata).toEqual({
        tags: ['programming', 'best-practices', 'important'],
        priority: 1,
        relatedTo: ['learning-1', 'learning-2'],
        source: 'documentation',
      });
    });

    it('should handle technical learning content', async () => {
      const technicalLearning = `
Learned about the Observer pattern:
- Defines one-to-many dependency between objects
- When one object changes state, all dependents are notified
- Promotes loose coupling
- Commonly used in event handling systems
Example: addEventListener in JavaScript implements this pattern
      `;

      const input: RememberLearningInput = {
        content: technicalLearning,
      };

      const result = await rememberLearning(input, storage, projectId, agentId);
      expect(result.memoryId).toBeDefined();

      const [, memory] = (storage.set as any).mock.calls[0];
      expect(memory.content).toBe(technicalLearning);
    });

    it('should handle learning with code snippets', async () => {
      const learningWithCode = `
Learned how to use async/await in JavaScript:

async function fetchData() {
  try {
    const response = await fetch('/api/data');
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error:', error);
  }
}
      `;

      const input: RememberLearningInput = {
        content: learningWithCode,
      };

      const result = await rememberLearning(input, storage, projectId, agentId);
      expect(result.memoryId).toBeDefined();

      const [, memory] = (storage.set as any).mock.calls[0];
      expect(memory.content).toBe(learningWithCode);
    });
  });

  describe('TTL Behavior', () => {
    it('should always set 24h TTL for learnings', async () => {
      const input: RememberLearningInput = {
        content: 'Learning with TTL',
      };

      const result = await rememberLearning(input, storage, projectId, agentId);

      expect(result.expiresAt).toBeDefined();

      const [, , ttl] = (storage.set as any).mock.calls[0];
      expect(ttl).toBe(86400); // 24 hours in seconds
    });

    it('should calculate correct expiresAt timestamp', async () => {
      const beforeCall = Date.now();
      const input: RememberLearningInput = {
        content: 'Learning to check expiry',
      };

      const result = await rememberLearning(input, storage, projectId, agentId);

      expect(result.expiresAt).toBeDefined();
      const expiresAt = new Date(result.expiresAt!).getTime();
      const expectedExpiry = beforeCall + 86400 * 1000; // 24 hours

      // Should be within 1 second of expected
      expect(Math.abs(expiresAt - expectedExpiry)).toBeLessThan(1000);
    });

    it('should store expiresAt in memory object', async () => {
      const input: RememberLearningInput = {
        content: 'Learning with expiry',
      };

      await rememberLearning(input, storage, projectId, agentId);

      const [, memory] = (storage.set as any).mock.calls[0];
      expect(memory.expiresAt).toBeDefined();
      expect(memory.expiresAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/); // ISO 8601 format
    });
  });

  describe('Storage Key Generation', () => {
    it('should generate correct key format', async () => {
      const input: RememberLearningInput = {
        content: 'Test learning',
      };

      const result = await rememberLearning(input, storage, projectId, agentId);

      const [key] = (storage.set as any).mock.calls[0];
      expect(key).toBe(`agents/${agentId}/recent/${result.memoryId}`);
    });

    it('should use agentId in key for private scope', async () => {
      const input: RememberLearningInput = {
        content: 'Agent-specific learning',
      };

      await rememberLearning(input, storage, projectId, agentId);

      const [key] = (storage.set as any).mock.calls[0];
      expect(key).toContain(`agents/${agentId}`);
    });

    it('should use recent category in key', async () => {
      const input: RememberLearningInput = {
        content: 'Recent category key',
      };

      await rememberLearning(input, storage, projectId, agentId);

      const [key] = (storage.set as any).mock.calls[0];
      expect(key).toContain('/recent/');
    });
  });

  describe('Timestamp Behavior', () => {
    it('should set createdAt and updatedAt to same value', async () => {
      const input: RememberLearningInput = {
        content: 'Timestamp test',
      };

      await rememberLearning(input, storage, projectId, agentId);

      const [, memory] = (storage.set as any).mock.calls[0];
      expect(memory.createdAt).toBe(memory.updatedAt);
    });

    it('should set timestamps to current time', async () => {
      const beforeCall = Date.now();
      const input: RememberLearningInput = {
        content: 'Time test',
      };

      await rememberLearning(input, storage, projectId, agentId);
      const afterCall = Date.now();

      const [, memory] = (storage.set as any).mock.calls[0];
      const createdAt = new Date(memory.createdAt).getTime();

      expect(createdAt).toBeGreaterThanOrEqual(beforeCall);
      expect(createdAt).toBeLessThanOrEqual(afterCall);
    });

    it('should use ISO 8601 format for timestamps', async () => {
      const input: RememberLearningInput = {
        content: 'ISO format test',
      };

      await rememberLearning(input, storage, projectId, agentId);

      const [, memory] = (storage.set as any).mock.calls[0];
      expect(memory.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      expect(memory.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });
  });

  describe('Priority Metadata', () => {
    it('should handle high priority learnings', async () => {
      const input: RememberLearningInput = {
        content: 'Critical learning',
        metadata: {
          priority: 1,
        },
      };

      await rememberLearning(input, storage, projectId, agentId);

      const [, memory] = (storage.set as any).mock.calls[0];
      expect(memory.metadata?.priority).toBe(1);
    });

    it('should handle medium priority learnings', async () => {
      const input: RememberLearningInput = {
        content: 'Moderate learning',
        metadata: {
          priority: 2,
        },
      };

      await rememberLearning(input, storage, projectId, agentId);

      const [, memory] = (storage.set as any).mock.calls[0];
      expect(memory.metadata?.priority).toBe(2);
    });

    it('should handle low priority learnings', async () => {
      const input: RememberLearningInput = {
        content: 'Nice to know',
        metadata: {
          priority: 3,
        },
      };

      await rememberLearning(input, storage, projectId, agentId);

      const [, memory] = (storage.set as any).mock.calls[0];
      expect(memory.metadata?.priority).toBe(3);
    });
  });
});
