/**
 * Cleanup Tool
 * Run maintenance tasks to expire TTL memories and enforce storage limits
 */

import type { Memory } from '../types.js';
// PatternError and PatternErrorCode available if needed for future error handling
import type { NatsKvBackend } from '../storage/nats-kv.js';
import { createLogger } from '../logger.js';

const logger = createLogger('cleanup');

export interface CleanupInput {
  expireOnly?: boolean; // default: false. If true, only expire TTL memories
}

export interface CleanupOutput {
  expired: number; // Count of memories removed due to TTL
  deleted: number; // Count of memories removed due to limits
  errors: string[]; // Any errors encountered
}

// Storage limits
const LIMITS = {
  recent: 1000,
  tasks: 500,
  core: 100,
};

/**
 * Run cleanup maintenance tasks
 *
 * @param input - Input parameters
 * @param storage - Storage backend instance
 * @param projectId - Project ID for isolation
 * @returns Output with counts of expired/deleted memories and any errors
 */
export async function cleanup(
  input: CleanupInput,
  storage: NatsKvBackend,
  projectId: string
): Promise<CleanupOutput> {
  const { expireOnly = false } = input;
  const errors: string[] = [];
  let expiredCount = 0;
  let deletedCount = 0;

  logger.info('Starting cleanup', { expireOnly, projectId });

  // Get all private memories (agents/*)
  const agentsPrefix = 'agents/';
  const allMemories = await storage.listFromProject(agentsPrefix, projectId);

  logger.debug('Loaded memories for cleanup', { count: allMemories.length });

  // Phase 1: Expire TTL memories
  const now = new Date();
  const expiredMemories: Memory[] = [];

  for (const memory of allMemories) {
    if (memory.expiresAt) {
      const expiresAt = new Date(memory.expiresAt);
      if (expiresAt < now) {
        expiredMemories.push(memory);
      }
    }
  }

  // Delete expired memories
  for (const memory of expiredMemories) {
    try {
      // Build the key for this memory
      const key = `agents/${memory.agentId}/${memory.category}/${memory.id}`;
      const deleted = await storage.deleteFromProject(key, projectId);
      if (deleted) {
        expiredCount++;
        logger.debug('Expired memory', { memoryId: memory.id, category: memory.category });
      }
    } catch (err) {
      const error = err as Error;
      const errorMsg = `Failed to expire memory ${memory.id}: ${error.message}`;
      logger.error(errorMsg);
      errors.push(errorMsg);
    }
  }

  logger.info('Expired TTL memories', { count: expiredCount });

  // Phase 2: Enforce storage limits (only if not expireOnly)
  if (!expireOnly) {
    // Filter out expired memories from the list
    const activeMemories = allMemories.filter((m) => !expiredMemories.find((em) => em.id === m.id));

    // Group memories by category
    const memoriesByCategory = {
      recent: activeMemories.filter((m) => m.category === 'recent'),
      tasks: activeMemories.filter((m) => m.category === 'tasks'),
      core: activeMemories.filter((m) => m.category === 'core'),
    };

    // Check 'recent' limit
    if (memoriesByCategory.recent.length > LIMITS.recent) {
      const excess = memoriesByCategory.recent.length - LIMITS.recent;
      // Sort by createdAt (oldest first)
      const sorted = memoriesByCategory.recent.sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
      const toDelete = sorted.slice(0, excess);

      for (const memory of toDelete) {
        try {
          const key = `agents/${memory.agentId}/${memory.category}/${memory.id}`;
          const deleted = await storage.deleteFromProject(key, projectId);
          if (deleted) {
            deletedCount++;
            logger.debug('Deleted memory due to limit', {
              memoryId: memory.id,
              category: 'recent',
            });
          }
        } catch (err) {
          const error = err as Error;
          const errorMsg = `Failed to delete recent memory ${memory.id}: ${error.message}`;
          logger.error(errorMsg);
          errors.push(errorMsg);
        }
      }

      logger.info('Enforced recent limit', {
        limit: LIMITS.recent,
        deleted: toDelete.length,
      });
    }

    // Check 'tasks' limit
    if (memoriesByCategory.tasks.length > LIMITS.tasks) {
      const excess = memoriesByCategory.tasks.length - LIMITS.tasks;
      // Sort by createdAt (oldest first)
      const sorted = memoriesByCategory.tasks.sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
      const toDelete = sorted.slice(0, excess);

      for (const memory of toDelete) {
        try {
          const key = `agents/${memory.agentId}/${memory.category}/${memory.id}`;
          const deleted = await storage.deleteFromProject(key, projectId);
          if (deleted) {
            deletedCount++;
            logger.debug('Deleted memory due to limit', {
              memoryId: memory.id,
              category: 'tasks',
            });
          }
        } catch (err) {
          const error = err as Error;
          const errorMsg = `Failed to delete task memory ${memory.id}: ${error.message}`;
          logger.error(errorMsg);
          errors.push(errorMsg);
        }
      }

      logger.info('Enforced tasks limit', {
        limit: LIMITS.tasks,
        deleted: toDelete.length,
      });
    }

    // Check 'core' limit (cannot auto-delete, just report error)
    if (memoriesByCategory.core.length > LIMITS.core) {
      const excess = memoriesByCategory.core.length - LIMITS.core;
      const errorMsg = `Core memory limit exceeded: ${memoriesByCategory.core.length} memories (limit: ${LIMITS.core}, excess: ${excess}). Core memories cannot be auto-deleted.`;
      logger.error(errorMsg);
      errors.push(errorMsg);
    }
  }

  logger.info('Cleanup completed', {
    expired: expiredCount,
    deleted: deletedCount,
    errors: errors.length,
  });

  return {
    expired: expiredCount,
    deleted: deletedCount,
    errors,
  };
}
