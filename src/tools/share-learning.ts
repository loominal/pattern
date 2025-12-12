/**
 * Share Learning Tool
 * Shares private memory with all project agents by converting to shared scope
 */

import { v4 as uuidv4 } from 'uuid';
import type { Memory, MemoryCategory } from '../types.js';
import { PatternError, PatternErrorCode, isSharedCategory } from '../types.js';
import { buildKey } from '../storage/interface.js';
import type { NatsKvBackend } from '../storage/nats-kv.js';
import { createLogger } from '../logger.js';

const logger = createLogger('share-learning');

export interface ShareLearningInput {
  memoryId: string;
  category?: 'decisions' | 'architecture' | 'learnings'; // default: 'learnings'
  keepPrivate?: boolean; // default: false. If true, copy; if false, move
}

export interface ShareLearningOutput {
  sharedMemoryId: string;
  originalDeleted: boolean;
}

/**
 * Share a private memory with all project agents
 *
 * @param input - Input parameters
 * @param storage - Storage backend instance
 * @param projectId - Project ID for isolation
 * @param agentId - Agent ID of the caller
 * @returns Output with new shared memory ID and deletion status
 */
export async function shareLearning(
  input: ShareLearningInput,
  storage: NatsKvBackend,
  projectId: string,
  agentId: string
): Promise<ShareLearningOutput> {
  const { memoryId, category = 'learnings', keepPrivate = false } = input;

  logger.info('Sharing learning', { memoryId, category, keepPrivate, agentId, projectId });

  // Validate category is a shared category
  if (!isSharedCategory(category)) {
    throw new PatternError(
      PatternErrorCode.INVALID_CATEGORY,
      `Category '${category}' is not a valid shared category. Use one of: decisions, architecture, learnings`
    );
  }

  // Try to find the private memory by scanning all private categories
  const privateCategories: MemoryCategory[] = ['recent', 'tasks', 'longterm', 'core'];
  let originalMemory: Memory | null = null;
  let originalKey: string | null = null;

  for (const privCategory of privateCategories) {
    const key = buildKey(agentId, privCategory, memoryId, 'private');
    const memory = await storage.getFromProject(key, projectId);
    if (memory) {
      originalMemory = memory;
      originalKey = key;
      break;
    }
  }

  if (!originalMemory || !originalKey) {
    throw new PatternError(
      PatternErrorCode.MEMORY_NOT_FOUND,
      `Private memory with ID '${memoryId}' not found`,
      { memoryId, agentId }
    );
  }

  // Check if the memory can be shared (only longterm and core)
  const sharableCategories: MemoryCategory[] = ['longterm', 'core'];
  if (!sharableCategories.includes(originalMemory.category)) {
    throw new PatternError(
      PatternErrorCode.INVALID_CATEGORY,
      `Only 'longterm' and 'core' memories can be shared. Found category: '${originalMemory.category}'`,
      { memoryId, category: originalMemory.category }
    );
  }

  // Create a new shared memory with the content
  const now = new Date().toISOString();
  const newMemoryId = uuidv4();
  const sharedMemory: Memory = {
    id: newMemoryId,
    agentId: originalMemory.agentId, // Keep original agent as creator
    projectId,
    scope: 'shared',
    category,
    content: originalMemory.content,
    ...(originalMemory.metadata && { metadata: originalMemory.metadata }),
    createdAt: now,
    updatedAt: now,
    version: 1,
  };

  const sharedKey = buildKey(agentId, category, newMemoryId, 'shared');
  await storage.set(sharedKey, sharedMemory);

  logger.debug('Created shared memory', { sharedMemoryId: newMemoryId, category });

  // Delete original if keepPrivate is false
  let originalDeleted = false;
  if (!keepPrivate) {
    const deleted = await storage.deleteFromProject(originalKey, projectId);
    originalDeleted = deleted;
    if (deleted) {
      logger.debug('Deleted original private memory', { memoryId, originalKey });
    } else {
      logger.warn('Failed to delete original private memory', { memoryId, originalKey });
    }
  } else {
    logger.debug('Keeping original private memory', { memoryId });
  }

  logger.info('Successfully shared learning', {
    originalMemoryId: memoryId,
    sharedMemoryId: newMemoryId,
    originalDeleted,
  });

  return {
    sharedMemoryId: newMemoryId,
    originalDeleted,
  };
}
