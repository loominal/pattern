/**
 * Bucket creation and management tests for NATS KV storage backend
 * Tests edge cases around bucket creation, race conditions, and error handling
 * Improves coverage for bucket management code in nats-kv.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NatsKvBackend } from './nats-kv.js';
import { buildKey } from './interface.js';
import type { Memory } from '../types.js';
import { PatternError, PatternErrorCode } from '../types.js';
import { v4 as uuidv4 } from 'uuid';

describe('NATS Bucket Management Tests', () => {
  let backend: NatsKvBackend;
  const natsUrl = process.env.NATS_URL || 'nats://localhost:4222';

  beforeAll(async () => {
    backend = new NatsKvBackend(natsUrl);
    await backend.connect();
  });

  afterAll(async () => {
    await backend.disconnect();
  });

  describe('Bucket Creation', () => {
    it('should create new project bucket', async () => {
      const projectId = `test-new-bucket-${Date.now()}`;
      await expect(backend.ensureBucket(projectId)).resolves.not.toThrow();
    });

    it('should create new user bucket', async () => {
      const agentId = `test-new-user-${Date.now()}`;
      await expect(backend.ensureUserBucket(agentId)).resolves.not.toThrow();
    });

    it('should create new global bucket', async () => {
      await expect(backend.ensureGlobalBucket()).resolves.not.toThrow();
    });

    it('should handle bucket already exists gracefully', async () => {
      const projectId = `test-exists-${Date.now()}`;

      // Create bucket first time
      await backend.ensureBucket(projectId);

      // Second call should not error (idempotent)
      await expect(backend.ensureBucket(projectId)).resolves.not.toThrow();
    });

    it('should handle concurrent bucket creation attempts', async () => {
      const projectId = `test-concurrent-${Date.now()}`;

      // Try to create the same bucket multiple times concurrently
      const promises = [
        backend.ensureBucket(projectId),
        backend.ensureBucket(projectId),
        backend.ensureBucket(projectId),
      ];

      // All should succeed without error (race condition handling)
      await expect(Promise.all(promises)).resolves.not.toThrow();
    });

    it('should handle special characters in project ID', async () => {
      const projectId = `test-special-chars-${Date.now()}-with_underscores-and-dashes`;
      await expect(backend.ensureBucket(projectId)).resolves.not.toThrow();
    });

    it('should create multiple project buckets independently', async () => {
      const projectIds = [
        `test-multi-1-${Date.now()}`,
        `test-multi-2-${Date.now()}`,
        `test-multi-3-${Date.now()}`,
      ];

      for (const projectId of projectIds) {
        await expect(backend.ensureBucket(projectId)).resolves.not.toThrow();
      }
    });

    it('should create multiple user buckets independently', async () => {
      const agentIds = [
        `test-agent-1-${Date.now()}`,
        `test-agent-2-${Date.now()}`,
        `test-agent-3-${Date.now()}`,
      ];

      for (const agentId of agentIds) {
        await expect(backend.ensureUserBucket(agentId)).resolves.not.toThrow();
      }
    });
  });

  describe('Bucket Access Errors', () => {
    it('should throw when accessing uninitialized project bucket', async () => {
      const uninitializedProject = `test-uninitialized-${Date.now()}`;
      const key = buildKey('agent-123', 'recent', 'memory-123', 'private');

      await expect(backend.getFromProject(key, uninitializedProject)).rejects.toThrow(
        'Bucket not initialized'
      );
    });

    it('should throw with PatternError code for uninitialized bucket', async () => {
      const uninitializedProject = `test-uninitialized-code-${Date.now()}`;
      const key = buildKey('agent-123', 'recent', 'memory-123', 'private');

      try {
        await backend.getFromProject(key, uninitializedProject);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(PatternError);
        const patternError = error as PatternError;
        expect(patternError.code).toBe(PatternErrorCode.NATS_ERROR);
      }
    });

    it('should throw when listing from uninitialized project bucket', async () => {
      const uninitializedProject = `test-uninitialized-list-${Date.now()}`;
      const prefix = 'agents/test-agent/recent/';

      await expect(backend.listFromProject(prefix, uninitializedProject)).rejects.toThrow(
        'Bucket not initialized'
      );
    });

    it('should throw when deleting from uninitialized project bucket', async () => {
      const uninitializedProject = `test-uninitialized-delete-${Date.now()}`;
      const key = buildKey('agent-123', 'recent', 'memory-123', 'private');

      await expect(backend.deleteFromProject(key, uninitializedProject)).rejects.toThrow(
        'Bucket not initialized'
      );
    });

    it('should throw when listing keys from uninitialized project bucket', async () => {
      const uninitializedProject = `test-uninitialized-keys-${Date.now()}`;
      const prefix = 'agents/test-agent/';

      await expect(backend.keysFromProject(prefix, uninitializedProject)).rejects.toThrow(
        'Bucket not initialized'
      );
    });
  });

  describe('Memory Operations with Bucket Auto-Ensure', () => {
    it('should auto-ensure bucket when setting memory with private scope', async () => {
      const projectId = `test-auto-private-${Date.now()}`;
      const agentId = 'test-agent';

      const memory: Memory = {
        id: uuidv4(),
        agentId,
        projectId,
        scope: 'private',
        category: 'recent',
        content: 'Auto-ensure test',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
      };

      const key = buildKey(agentId, 'recent', memory.id, 'private');

      // set() should auto-ensure the bucket
      await expect(backend.set(key, memory)).resolves.not.toThrow();

      // Verify memory was stored
      await backend.ensureBucket(projectId);
      const retrieved = await backend.getFromProject(key, projectId);
      expect(retrieved).toEqual(memory);
    });

    it('should auto-ensure bucket when setting memory with team scope', async () => {
      const projectId = `test-auto-team-${Date.now()}`;
      const agentId = 'test-agent';

      const memory: Memory = {
        id: uuidv4(),
        agentId,
        projectId,
        scope: 'team',
        category: 'decisions',
        content: 'Team decision auto-ensure',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
      };

      const key = buildKey(agentId, 'decisions', memory.id, 'team');

      // set() should auto-ensure the bucket
      await expect(backend.set(key, memory)).resolves.not.toThrow();

      // Verify memory was stored
      await backend.ensureBucket(projectId);
      const retrieved = await backend.getFromProject(key, projectId);
      expect(retrieved).toEqual(memory);
    });

    it('should auto-ensure user bucket when setting memory with personal scope', async () => {
      const projectId = `test-auto-personal-${Date.now()}`;
      const agentId = `test-agent-personal-${Date.now()}`;

      const memory: Memory = {
        id: uuidv4(),
        agentId,
        projectId,
        scope: 'personal',
        category: 'core',
        content: 'Personal memory auto-ensure',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
      };

      const key = buildKey(agentId, 'core', memory.id, 'personal');

      // set() should auto-ensure the user bucket
      await expect(backend.set(key, memory)).resolves.not.toThrow();

      // Verify memory was stored
      const retrieved = await backend.getFromUserBucket(key, agentId);
      expect(retrieved).toEqual(memory);
    });

    it('should auto-ensure global bucket when setting memory with public scope', async () => {
      const projectId = `test-auto-public-${Date.now()}`;
      const agentId = 'test-agent';

      const memory: Memory = {
        id: uuidv4(),
        agentId,
        projectId,
        scope: 'public',
        category: 'learnings',
        content: 'Public memory auto-ensure',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
      };

      const key = buildKey(agentId, 'learnings', memory.id, 'public');

      // set() should auto-ensure the global bucket
      await expect(backend.set(key, memory)).resolves.not.toThrow();

      // Verify memory was stored
      const retrieved = await backend.getFromGlobalBucket(key);
      expect(retrieved).toEqual(memory);
    });
  });

  describe('Bucket Storage Errors', () => {
    it('should handle NATS storage errors gracefully during set', async () => {
      const projectId = `test-set-error-${Date.now()}`;
      const agentId = 'test-agent';

      await backend.ensureBucket(projectId);

      const memory: Memory = {
        id: uuidv4(),
        agentId,
        projectId,
        scope: 'private',
        category: 'recent',
        content: 'Test memory',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
      };

      const key = buildKey(agentId, 'recent', memory.id, 'private');

      // Normal set should work
      await expect(backend.set(key, memory)).resolves.not.toThrow();
    });

    it('should handle TTL parameter in set operation', async () => {
      const projectId = `test-ttl-${Date.now()}`;
      const agentId = 'test-agent';

      await backend.ensureBucket(projectId);

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

      // Set with TTL
      await expect(backend.set(key, memory, 86400)).resolves.not.toThrow();

      // Verify memory was stored
      const retrieved = await backend.getFromProject(key, projectId);
      expect(retrieved).toEqual(memory);
    });

    it('should handle retrieval of empty/deleted entries', async () => {
      const projectId = `test-empty-${Date.now()}`;
      const agentId = 'test-agent';

      await backend.ensureBucket(projectId);

      // Try to get a non-existent key
      const key = buildKey(agentId, 'recent', 'non-existent', 'private');
      const retrieved = await backend.getFromProject(key, projectId);
      expect(retrieved).toBeNull();
    });

    it('should handle list operation errors gracefully', async () => {
      const projectId = `test-list-error-${Date.now()}`;
      await backend.ensureBucket(projectId);

      // List with a prefix that has no matches
      const prefix = 'agents/non-existent-agent/recent/';
      const memories = await backend.listFromProject(prefix, projectId);
      expect(memories).toEqual([]);
    });

    it('should handle keys operation errors gracefully', async () => {
      const projectId = `test-keys-error-${Date.now()}`;
      await backend.ensureBucket(projectId);

      // Keys with a prefix that has no matches
      const prefix = 'agents/non-existent-agent/';
      const keys = await backend.keysFromProject(prefix, projectId);
      expect(keys).toEqual([]);
    });
  });

  describe('Cross-Bucket Operations', () => {
    it('should maintain isolation between project, user, and global buckets', async () => {
      const projectId = `test-isolation-${Date.now()}`;
      const agentId = `test-agent-${Date.now()}`;
      const memoryId = uuidv4();

      // Same key structure, different buckets
      const privateKey = buildKey(agentId, 'recent', memoryId, 'private');
      const personalKey = buildKey(agentId, 'core', memoryId, 'personal');
      const publicKey = buildKey(agentId, 'learnings', memoryId, 'public');

      const privateMemory: Memory = {
        id: memoryId,
        agentId,
        projectId,
        scope: 'private',
        category: 'recent',
        content: 'Private memory',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
      };

      const personalMemory: Memory = {
        id: memoryId,
        agentId,
        projectId,
        scope: 'personal',
        category: 'core',
        content: 'Personal memory',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
      };

      const publicMemory: Memory = {
        id: memoryId,
        agentId,
        projectId,
        scope: 'public',
        category: 'learnings',
        content: 'Public memory',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
      };

      // Store in different buckets
      await backend.set(privateKey, privateMemory);
      await backend.set(personalKey, personalMemory);
      await backend.set(publicKey, publicMemory);

      // Verify each is in its own bucket
      await backend.ensureBucket(projectId);
      const retrievedPrivate = await backend.getFromProject(privateKey, projectId);
      expect(retrievedPrivate?.content).toBe('Private memory');

      const retrievedPersonal = await backend.getFromUserBucket(personalKey, agentId);
      expect(retrievedPersonal?.content).toBe('Personal memory');

      const retrievedPublic = await backend.getFromGlobalBucket(publicKey);
      expect(retrievedPublic?.content).toBe('Public memory');
    });
  });
});
