/**
 * Tests for NATS KV storage backend
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NatsKvBackend } from './nats-kv.js';
import { buildKey, parseKey } from './interface.js';
import type { Memory } from '../types.js';
import { v4 as uuidv4 } from 'uuid';

describe('Storage Helper Functions', () => {
  describe('buildKey', () => {
    it('should build shared key correctly', () => {
      const key = buildKey('agent-123', 'decisions', 'mem-456', 'shared');
      expect(key).toBe('shared/decisions/mem-456');
    });

    it('should build private key correctly', () => {
      const key = buildKey('agent-123', 'tasks', 'mem-789', 'private');
      expect(key).toBe('agents/agent-123/tasks/mem-789');
    });

    it('should build core memory key correctly', () => {
      const key = buildKey('agent-abc', 'core', 'mem-xyz', 'private');
      expect(key).toBe('agents/agent-abc/core/mem-xyz');
    });
  });

  describe('parseKey', () => {
    it('should parse shared key correctly', () => {
      const parsed = parseKey('shared/decisions/mem-456');
      expect(parsed).toEqual({
        category: 'decisions',
        memoryId: 'mem-456',
        scope: 'shared',
      });
    });

    it('should parse private key correctly', () => {
      const parsed = parseKey('agents/agent-123/tasks/mem-789');
      expect(parsed).toEqual({
        agentId: 'agent-123',
        category: 'tasks',
        memoryId: 'mem-789',
        scope: 'private',
      });
    });

    it('should throw on invalid shared key format', () => {
      expect(() => parseKey('shared/decisions')).toThrow('Invalid shared key format');
    });

    it('should throw on invalid private key format', () => {
      expect(() => parseKey('agents/agent-123/tasks')).toThrow('Invalid private key format');
    });

    it('should throw on completely invalid key', () => {
      expect(() => parseKey('invalid/key')).toThrow('Invalid key format');
    });

    it('should throw on empty parts in shared key', () => {
      expect(() => parseKey('shared//mem-456')).toThrow('Invalid shared key format');
    });

    it('should throw on empty parts in private key', () => {
      expect(() => parseKey('agents//tasks/mem-789')).toThrow('Invalid private key format');
    });
  });
});

describe('NatsKvBackend Integration', () => {
  let backend: NatsKvBackend;
  const projectId = `test-${Date.now()}`;
  const agentId = 'test-agent-123';
  const natsUrl = process.env.NATS_URL || 'nats://localhost:4222';

  beforeAll(async () => {
    backend = new NatsKvBackend(natsUrl);
    await backend.connect();
    await backend.ensureBucket(projectId);
  });

  afterAll(async () => {
    await backend.disconnect();
  });

  describe('Connection Management', () => {
    it('should connect to NATS', () => {
      expect(backend.isConnected()).toBe(true);
    });

    it('should not error on duplicate connect', async () => {
      await expect(backend.connect()).resolves.not.toThrow();
    });
  });

  describe('Bucket Management', () => {
    it('should create bucket for project', async () => {
      const newProjectId = `test-${Date.now()}-new`;
      await expect(backend.ensureBucket(newProjectId)).resolves.not.toThrow();
    });

    it('should not error on duplicate ensureBucket', async () => {
      await expect(backend.ensureBucket(projectId)).resolves.not.toThrow();
    });
  });

  describe('CRUD Operations', () => {
    it('should store and retrieve a private memory', async () => {
      const memory: Memory = {
        id: uuidv4(),
        agentId,
        projectId,
        scope: 'private',
        category: 'recent',
        content: 'Test memory content',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
      };

      const key = buildKey(agentId, 'recent', memory.id, 'private');
      await backend.set(key, memory);

      const retrieved = await backend.getFromProject(key, projectId);
      expect(retrieved).toEqual(memory);
    });

    it('should store and retrieve a shared memory', async () => {
      const memory: Memory = {
        id: uuidv4(),
        agentId,
        projectId,
        scope: 'shared',
        category: 'decisions',
        content: 'Shared decision',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
      };

      const key = buildKey(agentId, 'decisions', memory.id, 'shared');
      await backend.set(key, memory);

      const retrieved = await backend.getFromProject(key, projectId);
      expect(retrieved).toEqual(memory);
    });

    it('should store memory with TTL', async () => {
      const memory: Memory = {
        id: uuidv4(),
        agentId,
        projectId,
        scope: 'private',
        category: 'tasks',
        content: 'Task with TTL',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400 * 1000).toISOString(),
        version: 1,
      };

      const key = buildKey(agentId, 'tasks', memory.id, 'private');
      await backend.set(key, memory, 86400); // 24 hours

      const retrieved = await backend.getFromProject(key, projectId);
      expect(retrieved).toEqual(memory);
    });

    it('should return null for non-existent memory', async () => {
      const key = buildKey(agentId, 'recent', 'non-existent', 'private');
      const retrieved = await backend.getFromProject(key, projectId);
      expect(retrieved).toBeNull();
    });

    it('should delete a memory', async () => {
      const memory: Memory = {
        id: uuidv4(),
        agentId,
        projectId,
        scope: 'private',
        category: 'recent',
        content: 'Memory to delete',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
      };

      const key = buildKey(agentId, 'recent', memory.id, 'private');
      await backend.set(key, memory);

      const deleted = await backend.deleteFromProject(key, projectId);
      expect(deleted).toBe(true);

      const retrieved = await backend.getFromProject(key, projectId);
      expect(retrieved).toBeNull();
    });

    it('should return false when deleting non-existent memory', async () => {
      const key = buildKey(agentId, 'recent', 'non-existent', 'private');
      const deleted = await backend.deleteFromProject(key, projectId);
      expect(deleted).toBe(false);
    });
  });

  describe('List Operations', () => {
    beforeAll(async () => {
      // Create some test memories
      const memories: Memory[] = [
        {
          id: uuidv4(),
          agentId,
          projectId,
          scope: 'private',
          category: 'recent',
          content: 'Recent 1',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          version: 1,
        },
        {
          id: uuidv4(),
          agentId,
          projectId,
          scope: 'private',
          category: 'recent',
          content: 'Recent 2',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          version: 1,
        },
        {
          id: uuidv4(),
          agentId,
          projectId,
          scope: 'private',
          category: 'tasks',
          content: 'Task 1',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          version: 1,
        },
      ];

      for (const memory of memories) {
        const key = buildKey(agentId, memory.category, memory.id, 'private');
        await backend.set(key, memory);
      }
    });

    it('should list memories by prefix', async () => {
      const prefix = `agents/${agentId}/recent/`;
      const memories = await backend.listFromProject(prefix, projectId);
      expect(memories.length).toBeGreaterThanOrEqual(2);
      expect(memories.every((m) => m.category === 'recent')).toBe(true);
    });

    it('should list all agent memories', async () => {
      const prefix = `agents/${agentId}/`;
      const memories = await backend.listFromProject(prefix, projectId);
      expect(memories.length).toBeGreaterThanOrEqual(3);
    });

    it('should list keys by prefix', async () => {
      const prefix = `agents/${agentId}/recent/`;
      const keys = await backend.keysFromProject(prefix, projectId);
      expect(keys.length).toBeGreaterThanOrEqual(2);
      expect(keys.every((k) => k.startsWith(prefix))).toBe(true);
    });

    it('should return empty array for non-matching prefix', async () => {
      const prefix = 'agents/non-existent-agent/';
      const memories = await backend.listFromProject(prefix, projectId);
      expect(memories).toEqual([]);
    });
  });

  describe('Project Isolation', () => {
    it('should isolate memories by project', async () => {
      const project1 = `test-isolation-1-${Date.now()}`;
      const project2 = `test-isolation-2-${Date.now()}`;

      await backend.ensureBucket(project1);
      await backend.ensureBucket(project2);

      const memory1: Memory = {
        id: uuidv4(),
        agentId,
        projectId: project1,
        scope: 'private',
        category: 'recent',
        content: 'Project 1 memory',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
      };

      const memory2: Memory = {
        id: uuidv4(),
        agentId,
        projectId: project2,
        scope: 'private',
        category: 'recent',
        content: 'Project 2 memory',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
      };

      const key1 = buildKey(agentId, 'recent', memory1.id, 'private');
      const key2 = buildKey(agentId, 'recent', memory2.id, 'private');

      await backend.set(key1, memory1);
      await backend.set(key2, memory2);

      // Memory 1 should not be visible in project 2
      const retrieved1 = await backend.getFromProject(key1, project2);
      expect(retrieved1).toBeNull();

      // Memory 2 should not be visible in project 1
      const retrieved2 = await backend.getFromProject(key2, project1);
      expect(retrieved2).toBeNull();

      // Both should be visible in their own projects
      const retrieved1InProject1 = await backend.getFromProject(key1, project1);
      expect(retrieved1InProject1).toEqual(memory1);

      const retrieved2InProject2 = await backend.getFromProject(key2, project2);
      expect(retrieved2InProject2).toEqual(memory2);
    });
  });

  describe('Error Handling', () => {
    it('should throw error when getting from uninitialized bucket', async () => {
      const uninitializedProject = `test-uninitialized-${Date.now()}`;
      const key = buildKey(agentId, 'recent', 'test', 'private');

      await expect(backend.getFromProject(key, uninitializedProject)).rejects.toThrow(
        'Bucket not initialized'
      );
    });

    it('should throw validation error for get() without project context', async () => {
      const key = buildKey(agentId, 'recent', 'test', 'private');
      await expect(backend.get(key)).rejects.toThrow('get() requires projectId context');
    });

    it('should throw validation error for delete() without project context', async () => {
      const key = buildKey(agentId, 'recent', 'test', 'private');
      await expect(backend.delete(key)).rejects.toThrow('delete() requires projectId context');
    });

    it('should throw validation error for list() without project context', async () => {
      await expect(backend.list('agents/')).rejects.toThrow('list() requires projectId context');
    });

    it('should throw validation error for keys() without project context', async () => {
      await expect(backend.keys('agents/')).rejects.toThrow('keys() requires projectId context');
    });
  });
});
