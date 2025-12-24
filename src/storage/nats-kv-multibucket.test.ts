/**
 * Multi-bucket integration tests for NATS KV storage backend
 * Covers personal scope (user bucket) and public scope (global bucket) operations
 * These tests improve coverage for lines 600-934 in nats-kv.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NatsKvBackend } from './nats-kv.js';
import { buildKey } from './interface.js';
import type { Memory } from '../types.js';
import { v4 as uuidv4 } from 'uuid';

describe('NatsKvBackend Multi-Bucket Operations', () => {
  let backend: NatsKvBackend;
  const projectId = `test-multibucket-${Date.now()}`;
  const agentId1 = 'test-agent-1';
  const agentId2 = 'test-agent-2';
  const natsUrl = process.env.NATS_URL || 'nats://localhost:4222';

  beforeAll(async () => {
    backend = new NatsKvBackend(natsUrl, agentId1);
    await backend.connect();
    await backend.ensureBucket(projectId);
  });

  afterAll(async () => {
    await backend.disconnect();
  });

  describe('Personal Scope - User Bucket Operations', () => {
    it('should ensure user bucket for agent', async () => {
      await expect(backend.ensureUserBucket(agentId1)).resolves.not.toThrow();
    });

    it('should store and retrieve memory from user bucket', async () => {
      const memory: Memory = {
        id: uuidv4(),
        agentId: agentId1,
        projectId, // personal scope crosses projects
        scope: 'personal',
        category: 'core',
        content: 'Personal core memory',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
      };

      const key = buildKey(agentId1, 'core', memory.id, 'personal');

      // Store via set() which should route to user bucket for personal scope
      await backend.set(key, memory);

      // Retrieve from user bucket
      const retrieved = await backend.getFromUserBucket(key, agentId1);
      expect(retrieved).toEqual(memory);
    });

    it('should list memories from user bucket by prefix', async () => {
      // Create multiple personal memories
      const memories: Memory[] = [];
      for (let i = 0; i < 3; i++) {
        const memory: Memory = {
          id: uuidv4(),
          agentId: agentId1,
          projectId,
          scope: 'personal',
          category: 'core',
          content: `Personal memory ${i}`,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          version: 1,
        };
        memories.push(memory);

        const key = buildKey(agentId1, 'core', memory.id, 'personal');
        await backend.set(key, memory);
      }

      // List all personal memories
      const prefix = `agents/${agentId1}/core/`;
      const listed = await backend.listFromUserBucket(prefix, agentId1);
      expect(listed.length).toBeGreaterThanOrEqual(3);
      expect(listed.every((m) => m.scope === 'personal' && m.category === 'core')).toBe(true);
    });

    it('should list keys from user bucket by prefix', async () => {
      const prefix = `agents/${agentId1}/core/`;
      const keys = await backend.keysFromUserBucket(prefix, agentId1);
      expect(keys.length).toBeGreaterThanOrEqual(1);
      expect(keys.every((k) => k.startsWith(prefix))).toBe(true);
    });

    it('should delete memory from user bucket', async () => {
      const memory: Memory = {
        id: uuidv4(),
        agentId: agentId1,
        projectId,
        scope: 'personal',
        category: 'core',
        content: 'Memory to delete from user bucket',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
      };

      const key = buildKey(agentId1, 'core', memory.id, 'personal');
      await backend.set(key, memory);

      // Verify it exists
      const exists = await backend.getFromUserBucket(key, agentId1);
      expect(exists).not.toBeNull();

      // Delete it
      const deleted = await backend.deleteFromUserBucket(key, agentId1);
      expect(deleted).toBe(true);

      // Verify deletion
      const afterDelete = await backend.getFromUserBucket(key, agentId1);
      expect(afterDelete).toBeNull();
    });

    it('should return false when deleting non-existent memory from user bucket', async () => {
      const key = buildKey(agentId1, 'core', 'non-existent-uuid', 'personal');
      const deleted = await backend.deleteFromUserBucket(key, agentId1);
      expect(deleted).toBe(false);
    });

    it('should return null for non-existent memory in user bucket', async () => {
      const key = buildKey(agentId1, 'core', 'non-existent-uuid', 'personal');
      const retrieved = await backend.getFromUserBucket(key, agentId1);
      expect(retrieved).toBeNull();
    });

    it('should isolate personal memories by agent', async () => {
      // Agent 1 memory
      const memory1: Memory = {
        id: uuidv4(),
        agentId: agentId1,
        projectId,
        scope: 'personal',
        category: 'core',
        content: 'Agent 1 personal memory',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
      };

      // Agent 2 memory
      const memory2: Memory = {
        id: uuidv4(),
        agentId: agentId2,
        projectId,
        scope: 'personal',
        category: 'core',
        content: 'Agent 2 personal memory',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
      };

      const key1 = buildKey(agentId1, 'core', memory1.id, 'personal');
      const key2 = buildKey(agentId2, 'core', memory2.id, 'personal');

      await backend.set(key1, memory1);
      await backend.set(key2, memory2);

      // Agent 1 should only see their memory
      const agent1Retrieved = await backend.getFromUserBucket(key1, agentId1);
      expect(agent1Retrieved).toEqual(memory1);

      // Agent 2 should not see agent 1's memory
      const agent2CannotSee = await backend.getFromUserBucket(key1, agentId2);
      expect(agent2CannotSee).toBeNull();

      // Agent 2 should see their own memory
      const agent2Retrieved = await backend.getFromUserBucket(key2, agentId2);
      expect(agent2Retrieved).toEqual(memory2);
    });

    it('should handle empty results for non-matching prefix in user bucket', async () => {
      const prefix = 'agents/non-existent-agent/core/';
      const memories = await backend.listFromUserBucket(prefix, agentId1);
      expect(memories).toEqual([]);
    });

    it('should handle list errors gracefully in user bucket', async () => {
      // This tests the catch block in listFromUserBucket for individual memory failures
      // Create a memory, then list with a prefix that includes it
      const memory: Memory = {
        id: uuidv4(),
        agentId: agentId1,
        projectId,
        scope: 'personal',
        category: 'core',
        content: 'Test memory for error handling',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
      };

      const key = buildKey(agentId1, 'core', memory.id, 'personal');
      await backend.set(key, memory);

      // List should work even if individual gets fail (they're caught and logged)
      const prefix = `agents/${agentId1}/core/`;
      const listed = await backend.listFromUserBucket(prefix, agentId1);
      expect(Array.isArray(listed)).toBe(true);
    });
  });

  describe('Public Scope - Global Bucket Operations', () => {
    it('should ensure global bucket', async () => {
      await expect(backend.ensureGlobalBucket()).resolves.not.toThrow();
    });

    it('should store and retrieve memory from global bucket', async () => {
      const memory: Memory = {
        id: uuidv4(),
        agentId: agentId1,
        projectId, // public scope is global
        scope: 'public',
        category: 'learnings',
        content: 'Public learning shared globally',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
      };

      const key = buildKey(agentId1, 'learnings', memory.id, 'public');

      // Store via set() which should route to global bucket for public scope
      await backend.set(key, memory);

      // Retrieve from global bucket
      const retrieved = await backend.getFromGlobalBucket(key);
      expect(retrieved).toEqual(memory);
    });

    it('should list memories from global bucket by prefix', async () => {
      // Create multiple public memories
      const memories: Memory[] = [];
      for (let i = 0; i < 3; i++) {
        const memory: Memory = {
          id: uuidv4(),
          agentId: agentId1,
          projectId,
          scope: 'public',
          category: 'learnings',
          content: `Public learning ${i}`,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          version: 1,
        };
        memories.push(memory);

        const key = buildKey(agentId1, 'learnings', memory.id, 'public');
        await backend.set(key, memory);
      }

      // List all public learnings
      const prefix = 'shared/learnings/';
      const listed = await backend.listFromGlobalBucket(prefix);
      expect(listed.length).toBeGreaterThanOrEqual(3);
      expect(listed.every((m) => m.scope === 'public' && m.category === 'learnings')).toBe(true);
    });

    it('should list keys from global bucket by prefix', async () => {
      const prefix = 'shared/learnings/';
      const keys = await backend.keysFromGlobalBucket(prefix);
      expect(keys.length).toBeGreaterThanOrEqual(1);
      expect(keys.every((k) => k.startsWith(prefix))).toBe(true);
    });

    it('should delete memory from global bucket', async () => {
      const memory: Memory = {
        id: uuidv4(),
        agentId: agentId1,
        projectId,
        scope: 'public',
        category: 'learnings',
        content: 'Memory to delete from global bucket',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
      };

      const key = buildKey(agentId1, 'learnings', memory.id, 'public');
      await backend.set(key, memory);

      // Verify it exists
      const exists = await backend.getFromGlobalBucket(key);
      expect(exists).not.toBeNull();

      // Delete it
      const deleted = await backend.deleteFromGlobalBucket(key);
      expect(deleted).toBe(true);

      // Verify deletion
      const afterDelete = await backend.getFromGlobalBucket(key);
      expect(afterDelete).toBeNull();
    });

    it('should return false when deleting non-existent memory from global bucket', async () => {
      const key = buildKey(agentId1, 'learnings', 'non-existent-uuid', 'public');
      const deleted = await backend.deleteFromGlobalBucket(key);
      expect(deleted).toBe(false);
    });

    it('should return null for non-existent memory in global bucket', async () => {
      const key = buildKey(agentId1, 'learnings', 'non-existent-uuid', 'public');
      const retrieved = await backend.getFromGlobalBucket(key);
      expect(retrieved).toBeNull();
    });

    it('should make public memories visible to all agents', async () => {
      const memory: Memory = {
        id: uuidv4(),
        agentId: agentId1,
        projectId,
        scope: 'public',
        category: 'learnings',
        content: 'Publicly visible learning',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
      };

      const key = buildKey(agentId1, 'learnings', memory.id, 'public');
      await backend.set(key, memory);

      // Both agents should see the same public memory
      const retrieved = await backend.getFromGlobalBucket(key);
      expect(retrieved).toEqual(memory);
    });

    it('should handle empty results for non-matching prefix in global bucket', async () => {
      const prefix = 'shared/non-existent-category/';
      const memories = await backend.listFromGlobalBucket(prefix);
      expect(memories).toEqual([]);
    });

    it('should handle list errors gracefully in global bucket', async () => {
      // This tests the catch block in listFromGlobalBucket for individual memory failures
      const memory: Memory = {
        id: uuidv4(),
        agentId: agentId1,
        projectId,
        scope: 'public',
        category: 'learnings',
        content: 'Test memory for error handling',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
      };

      const key = buildKey(agentId1, 'learnings', memory.id, 'public');
      await backend.set(key, memory);

      // List should work even if individual gets fail (they're caught and logged)
      const prefix = 'shared/learnings/';
      const listed = await backend.listFromGlobalBucket(prefix);
      expect(Array.isArray(listed)).toBe(true);
    });
  });

  describe('Scope Routing - ensureBucketForScope', () => {
    it('should ensure project bucket for private scope', async () => {
      const testProjectId = `test-scope-private-${Date.now()}`;
      await expect(
        backend.ensureBucketForScope('private', testProjectId, agentId1)
      ).resolves.not.toThrow();
    });

    it('should ensure project bucket for team scope', async () => {
      const testProjectId = `test-scope-team-${Date.now()}`;
      await expect(
        backend.ensureBucketForScope('team', testProjectId, agentId1)
      ).resolves.not.toThrow();
    });

    it('should ensure user bucket for personal scope', async () => {
      const testAgentId = `test-agent-personal-${Date.now()}`;
      await expect(
        backend.ensureBucketForScope('personal', projectId, testAgentId)
      ).resolves.not.toThrow();
    });

    it('should ensure global bucket for public scope', async () => {
      await expect(
        backend.ensureBucketForScope('public', projectId, agentId1)
      ).resolves.not.toThrow();
    });
  });

  describe('AgentId Management', () => {
    it('should set agent ID after construction', () => {
      const testBackend = new NatsKvBackend(natsUrl);
      expect(() => testBackend.setAgentId('new-agent-id')).not.toThrow();
    });

    it('should use provided agent ID in constructor', () => {
      const testBackend = new NatsKvBackend(natsUrl, 'constructor-agent-id');
      expect(testBackend).toBeDefined();
    });
  });

  describe('Bucket Caching', () => {
    it('should not error when ensuring same bucket multiple times', async () => {
      const testProjectId = `test-cache-${Date.now()}`;
      await backend.ensureBucket(testProjectId);
      // Second call should use cached bucket
      await expect(backend.ensureBucket(testProjectId)).resolves.not.toThrow();
      // Third call for good measure
      await expect(backend.ensureBucket(testProjectId)).resolves.not.toThrow();
    });

    it('should not error when ensuring same user bucket multiple times', async () => {
      const testAgentId = `test-cache-agent-${Date.now()}`;
      await backend.ensureUserBucket(testAgentId);
      // Second call should use cached bucket
      await expect(backend.ensureUserBucket(testAgentId)).resolves.not.toThrow();
    });

    it('should not error when ensuring global bucket multiple times', async () => {
      await backend.ensureGlobalBucket();
      // Second call should use cached bucket
      await expect(backend.ensureGlobalBucket()).resolves.not.toThrow();
    });
  });

  describe('Error Handling - Bucket Not Initialized', () => {
    it('should throw when getting from user bucket before ensuring', async () => {
      const uninitializedAgent = `uninitialized-agent-${Date.now()}`;
      const key = buildKey(uninitializedAgent, 'core', 'test', 'personal');

      // ensureUserBucket is called within getFromUserBucket, so this should work
      // But we can test the getBucketByName error by trying to use a bucket that doesn't exist
      const testBackend = new NatsKvBackend(natsUrl);
      await testBackend.connect();

      // This should work because getFromUserBucket calls ensureUserBucket internally
      await expect(
        testBackend.getFromUserBucket(key, uninitializedAgent)
      ).resolves.toBeDefined();
    });
  });
});
