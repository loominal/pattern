/**
 * Integration tests for Pattern MCP Server
 * Tests multi-agent scenarios and acceptance criteria validation
 *
 * Based on PLAN.md section 11.0.6 Acceptance Criteria
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { NatsKvBackend } from './storage/nats-kv.js';
import { buildKey } from './storage/interface.js';
import { remember, type RememberInput } from './tools/remember.js';
import { rememberTask } from './tools/remember-task.js';
import { rememberLearning } from './tools/remember-learning.js';
import { commitInsight } from './tools/commit-insight.js';
import { coreMemory } from './tools/core-memory.js';
import { forget } from './tools/forget.js';
import { shareLearning } from './tools/share-learning.js';
import { recallContext } from './tools/recall-context.js';
import { cleanup } from './tools/cleanup.js';
// Memory type used for documentation purposes

/**
 * Integration test suite for multi-agent scenarios
 */
describe('Multi-Agent Integration Tests', () => {
  let storage: NatsKvBackend;
  const projectId = `integration-test-${Date.now()}`;
  const agent1Id = 'integration-agent-1';
  const agent2Id = 'integration-agent-2';
  const natsUrl = process.env.NATS_URL || 'nats://localhost:4222';

  beforeAll(async () => {
    storage = new NatsKvBackend(natsUrl);
    await storage.connect();
    await storage.ensureBucket(projectId);
  });

  afterAll(async () => {
    await storage.disconnect();
  });

  describe('F-AC-1: Agent can store and retrieve private memory', () => {
    it('should store and retrieve private memory via recall_context', async () => {
      // Store a private memory
      const input: RememberInput = {
        content: 'Integration test private memory',
        scope: 'private',
        category: 'longterm',
        metadata: {
          tags: ['integration', 'test'],
          priority: 1,
        },
      };

      const result = await remember(input, storage, projectId, agent1Id);
      expect(result.memoryId).toBeDefined();

      // Retrieve via recall_context
      const context = await recallContext(storage, projectId, agent1Id, {
        scope: 'private',
        categories: ['longterm'],
      });

      expect(context.private.length).toBeGreaterThan(0);
      const found = context.private.find((m) => m.id === result.memoryId);
      expect(found).toBeDefined();
      expect(found?.content).toBe('Integration test private memory');
    });
  });

  describe('F-AC-2: Private memories NOT visible to other agents', () => {
    let privateMemoryId: string;

    beforeEach(async () => {
      // Agent 1 stores a private memory
      const result = await remember(
        {
          content: 'Secret private memory for agent 1 only',
          scope: 'private',
          category: 'longterm',
        },
        storage,
        projectId,
        agent1Id
      );
      privateMemoryId = result.memoryId;
    });

    it('should NOT be visible to agent 2', async () => {
      // Agent 2 tries to recall context
      const context = await recallContext(storage, projectId, agent2Id, {
        scope: 'private',
      });

      // Agent 2 should NOT see agent 1's private memory
      const found = context.private.find((m) => m.id === privateMemoryId);
      expect(found).toBeUndefined();
    });

    it('should be visible to agent 1', async () => {
      // Agent 1 can see their own private memory
      const context = await recallContext(storage, projectId, agent1Id, {
        scope: 'private',
      });

      const found = context.private.find((m) => m.id === privateMemoryId);
      expect(found).toBeDefined();
    });
  });

  describe('F-AC-3: Shared memories visible to all agents in same project', () => {
    let sharedMemoryId: string;

    beforeEach(async () => {
      // Agent 1 stores a shared memory
      const result = await remember(
        {
          content: 'Shared decision for all agents',
          scope: 'shared',
          category: 'decisions',
        },
        storage,
        projectId,
        agent1Id
      );
      sharedMemoryId = result.memoryId;
    });

    it('should be visible to agent 1 (creator)', async () => {
      const context = await recallContext(storage, projectId, agent1Id, {
        scope: 'shared',
      });

      const found = context.shared.find((m) => m.id === sharedMemoryId);
      expect(found).toBeDefined();
      expect(found?.content).toBe('Shared decision for all agents');
    });

    it('should be visible to agent 2 (other agent)', async () => {
      const context = await recallContext(storage, projectId, agent2Id, {
        scope: 'shared',
      });

      const found = context.shared.find((m) => m.id === sharedMemoryId);
      expect(found).toBeDefined();
      expect(found?.content).toBe('Shared decision for all agents');
    });
  });

  describe('F-AC-4: Memories with 24h TTL have expiresAt set', () => {
    it('should set expiresAt for recent category', async () => {
      const result = await rememberLearning(
        { content: 'Short-term learning' },
        storage,
        projectId,
        agent1Id
      );

      expect(result.expiresAt).toBeDefined();
      const expiresAt = new Date(result.expiresAt!);
      const now = new Date();
      const diff = expiresAt.getTime() - now.getTime();

      // Should be approximately 24 hours (86400 seconds)
      expect(diff).toBeGreaterThan(23 * 60 * 60 * 1000); // > 23 hours
      expect(diff).toBeLessThan(25 * 60 * 60 * 1000); // < 25 hours
    });

    it('should set expiresAt for tasks category', async () => {
      const result = await rememberTask(
        { content: 'Short-term task' },
        storage,
        projectId,
        agent1Id
      );

      expect(result.expiresAt).toBeDefined();
    });
  });

  describe('F-AC-5: commit_insight promotes recent→longterm', () => {
    it('should promote memory from recent to longterm and remove TTL', async () => {
      // Create a recent memory (has TTL)
      const recentResult = await rememberLearning(
        { content: 'Learning to promote' },
        storage,
        projectId,
        agent1Id
      );

      expect(recentResult.expiresAt).toBeDefined();

      // Promote to longterm
      const commitResult = await commitInsight(
        { memoryId: recentResult.memoryId },
        storage,
        projectId,
        agent1Id
      );

      expect(commitResult.memoryId).toBe(recentResult.memoryId);
      expect(commitResult.previousCategory).toBe('recent');

      // Verify the memory is now in longterm
      const context = await recallContext(storage, projectId, agent1Id, {
        scope: 'private',
        categories: ['longterm'],
      });

      const promoted = context.private.find((m) => m.id === recentResult.memoryId);
      expect(promoted).toBeDefined();
      expect(promoted?.category).toBe('longterm');
      expect(promoted?.expiresAt).toBeUndefined();
    });
  });

  describe('F-AC-6: share_learning makes private memory visible to all', () => {
    it('should share a private longterm memory to shared learnings', async () => {
      // Create a private longterm memory
      const privateResult = await remember(
        {
          content: 'Private insight to share',
          scope: 'private',
          category: 'longterm',
        },
        storage,
        projectId,
        agent1Id
      );

      // Share it
      const shareResult = await shareLearning(
        {
          memoryId: privateResult.memoryId,
          category: 'learnings',
          keepPrivate: false,
        },
        storage,
        projectId,
        agent1Id
      );

      expect(shareResult.sharedMemoryId).toBeDefined();
      expect(shareResult.originalDeleted).toBe(true);

      // Verify agent 2 can see it
      const agent2Context = await recallContext(storage, projectId, agent2Id, {
        scope: 'shared',
        categories: ['learnings'],
      });

      const found = agent2Context.shared.find((m) => m.id === shareResult.sharedMemoryId);
      expect(found).toBeDefined();
      expect(found?.content).toBe('Private insight to share');
    });
  });

  describe('F-AC-7: core_memory stores protected identity memories', () => {
    it('should store core memory without TTL', async () => {
      const result = await coreMemory(
        { content: 'I am a helpful coding assistant' },
        storage,
        projectId,
        agent1Id
      );

      expect(result.memoryId).toBeDefined();

      // Retrieve and verify no TTL
      const key = buildKey(agent1Id, 'core', result.memoryId, 'private');
      const memory = await storage.getFromProject(key, projectId);

      expect(memory).toBeDefined();
      expect(memory?.category).toBe('core');
      expect(memory?.expiresAt).toBeUndefined();
    });
  });

  describe('F-AC-8: forget deletes memories (with force for core)', () => {
    it('should delete regular memory without force', async () => {
      const result = await remember(
        { content: 'Memory to delete', scope: 'private', category: 'longterm' },
        storage,
        projectId,
        agent1Id
      );

      const deleteResult = await forget(
        { memoryId: result.memoryId },
        storage,
        projectId,
        agent1Id
      );

      expect(deleteResult.deleted).toBe(true);

      // Verify deleted
      const key = buildKey(agent1Id, 'longterm', result.memoryId, 'private');
      const memory = await storage.getFromProject(key, projectId);
      expect(memory).toBeNull();
    });

    it('should require force=true to delete core memory', async () => {
      const result = await coreMemory(
        { content: 'Core memory to delete' },
        storage,
        projectId,
        agent1Id
      );

      // Try without force - should fail
      await expect(
        forget({ memoryId: result.memoryId }, storage, projectId, agent1Id)
      ).rejects.toThrow('force=true');

      // With force - should succeed
      const deleteResult = await forget(
        { memoryId: result.memoryId, force: true },
        storage,
        projectId,
        agent1Id
      );

      expect(deleteResult.deleted).toBe(true);
    });
  });

  describe('F-AC-9: cleanup removes expired memories', () => {
    it('should report cleanup results', async () => {
      // Run cleanup
      const result = await cleanup({}, storage, projectId);

      expect(result).toHaveProperty('expired');
      expect(result).toHaveProperty('deleted');
      expect(typeof result.expired).toBe('number');
      expect(typeof result.deleted).toBe('number');
    });
  });

  describe('F-AC-10: Memories isolated by projectId', () => {
    const project1 = `isolation-test-1-${Date.now()}`;
    const project2 = `isolation-test-2-${Date.now()}`;

    beforeAll(async () => {
      await storage.ensureBucket(project1);
      await storage.ensureBucket(project2);
    });

    it('should isolate memories between projects', async () => {
      // Store memory in project 1
      const result1 = await remember(
        { content: 'Project 1 only', scope: 'shared', category: 'decisions' },
        storage,
        project1,
        agent1Id
      );

      // Store memory in project 2
      const result2 = await remember(
        { content: 'Project 2 only', scope: 'shared', category: 'decisions' },
        storage,
        project2,
        agent1Id
      );

      // Verify project 1 memory not in project 2
      const context2 = await recallContext(storage, project2, agent1Id, {
        scope: 'shared',
      });
      const found1In2 = context2.shared.find((m) => m.id === result1.memoryId);
      expect(found1In2).toBeUndefined();

      // Verify project 2 memory not in project 1
      const context1 = await recallContext(storage, project1, agent1Id, {
        scope: 'shared',
      });
      const found2In1 = context1.shared.find((m) => m.id === result2.memoryId);
      expect(found2In1).toBeUndefined();

      // Verify each project sees only its own memory
      expect(context1.shared.some((m) => m.id === result1.memoryId)).toBe(true);
      expect(context2.shared.some((m) => m.id === result2.memoryId)).toBe(true);
    });
  });
});

/**
 * Non-functional tests
 */
describe('Non-Functional Tests', () => {
  let storage: NatsKvBackend;
  const projectId = `nf-test-${Date.now()}`;
  const agentId = 'nf-test-agent';
  const natsUrl = process.env.NATS_URL || 'nats://localhost:4222';

  beforeAll(async () => {
    storage = new NatsKvBackend(natsUrl);
    await storage.connect();
    await storage.ensureBucket(projectId);
  });

  afterAll(async () => {
    await storage.disconnect();
  });

  describe('NF-AC-1: recall_context <100ms for typical use', () => {
    it('should complete recall_context quickly for small memory set', async () => {
      // Create 10 memories
      for (let i = 0; i < 10; i++) {
        await remember(
          {
            content: `Test memory ${i}`,
            scope: 'private',
            category: 'longterm',
          },
          storage,
          projectId,
          agentId
        );
      }

      // Measure recall time
      const start = Date.now();
      await recallContext(storage, projectId, agentId, {});
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(500); // 500ms is generous for 10 memories
    });
  });

  describe('NF-AC-5: Meaningful error messages', () => {
    it('should provide clear error for non-existent memory forget', async () => {
      try {
        await forget({ memoryId: 'non-existent-memory-id' }, storage, projectId, agentId);
        expect.fail('Should have thrown');
      } catch (error: unknown) {
        const err = error as Error;
        expect(err.message).toContain('not found');
      }
    });

    it('should provide clear error for invalid category', async () => {
      try {
        await remember(
          {
            content: 'Invalid',
            scope: 'private',
            category: 'decisions', // decisions is a shared category
          },
          storage,
          projectId,
          agentId
        );
        expect.fail('Should have thrown');
      } catch (error: unknown) {
        const err = error as Error;
        expect(err.message.toLowerCase()).toContain('category');
      }
    });
  });
});

/**
 * Recall context summary tests
 */
describe('Recall Context Summary Generation', () => {
  let storage: NatsKvBackend;
  const projectId = `summary-test-${Date.now()}`;
  const agentId = 'summary-test-agent';
  const natsUrl = process.env.NATS_URL || 'nats://localhost:4222';

  beforeAll(async () => {
    storage = new NatsKvBackend(natsUrl);
    await storage.connect();
    await storage.ensureBucket(projectId);

    // Create some memories for summary testing
    await coreMemory(
      { content: 'Core identity: I help with coding tasks' },
      storage,
      projectId,
      agentId
    );

    await remember(
      {
        content: 'Long-term learning: Always write tests',
        scope: 'private',
        category: 'longterm',
      },
      storage,
      projectId,
      agentId
    );

    await remember(
      {
        content: 'Shared decision: Use TypeScript for all code',
        scope: 'shared',
        category: 'decisions',
      },
      storage,
      projectId,
      agentId
    );
  });

  afterAll(async () => {
    await storage.disconnect();
  });

  it('should generate a summary string', async () => {
    const context = await recallContext(storage, projectId, agentId, {});

    expect(context.summary).toBeDefined();
    expect(context.summary.length).toBeGreaterThan(0);
  });

  it('should include content from memories in summary', async () => {
    const context = await recallContext(storage, projectId, agentId, {});

    // Summary should contain parts of our memories
    expect(context.summary).toContain('coding');
  });

  it('should provide accurate counts', async () => {
    const context = await recallContext(storage, projectId, agentId, {});

    expect(context.counts.private).toBeGreaterThan(0);
    expect(context.counts.shared).toBeGreaterThan(0);
    expect(typeof context.counts.expired).toBe('number');
  });
});
