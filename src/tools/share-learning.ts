/**
 * Share Learning Tool
 * Shares private/personal memory with all project agents by converting to team scope
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
  keepOriginal?: boolean; // default: false. If true, copy; if false, move
}

export interface ShareLearningOutput {
  teamMemoryId: string;
  originalDeleted: boolean;
}

/**
 * Share a private/personal memory with all project agents (team scope)
 *
 * @param input - Input parameters
 * @param storage - Storage backend instance
 * @param projectId - Project ID for isolation
 * @param agentId - Agent ID of the caller
 * @returns Output with new team memory ID and deletion status
 */
export async function shareLearning(
  input: ShareLearningInput,
  storage: NatsKvBackend,
  projectId: string,
  agentId: string
): Promise<ShareLearningOutput> {
  const { memoryId, category = 'learnings', keepOriginal = false } = input;

  logger.info('Sharing learning', { memoryId, category, keepOriginal, agentId, projectId });

  // Validate category is a team category
  if (!isSharedCategory(category)) {
    throw new PatternError(
      PatternErrorCode.INVALID_CATEGORY,
      `Category '${category}' is not a valid team category. Use one of: decisions, architecture, learnings`
    );
  }

  // Try to find the original memory by scanning all individual categories
  const individualCategories: MemoryCategory[] = ['recent', 'tasks', 'longterm', 'core'];
  let originalMemory: Memory | null = null;
  let originalKey: string | null = null;

  // Search in private scope first
  for (const privCategory of individualCategories) {
    const key = buildKey(agentId, privCategory, memoryId, 'private');
    const memory = await storage.getFromProject(key, projectId);
    if (memory) {
      originalMemory = memory;
      originalKey = key;
      break;
    }
  }

  // Search in personal scope if not found (for core memories - stored in user bucket)
  let foundInUserBucket = false;
  if (!originalMemory) {
    for (const privCategory of individualCategories) {
      const key = `pattern.${buildKey(agentId, privCategory, memoryId, 'personal')}`;
      const memory = await storage.getFromUserBucket(key, agentId);
      if (memory) {
        originalMemory = memory;
        originalKey = key;
        foundInUserBucket = true;
        break;
      }
    }
  }

  if (!originalMemory || !originalKey) {
    throw new PatternError(
      PatternErrorCode.MEMORY_NOT_FOUND,
      `Memory with ID '${memoryId}' not found in private or personal scope`,
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

  // Create a new team memory with the content
  const now = new Date().toISOString();
  const newMemoryId = uuidv4();
  const teamMemory: Memory = {
    id: newMemoryId,
    agentId: originalMemory.agentId, // Keep original agent as creator
    projectId,
    scope: 'team',
    category,
    content: originalMemory.content,
    ...(originalMemory.metadata && { metadata: originalMemory.metadata }),
    createdAt: now,
    updatedAt: now,
    version: 1,
  };

  const teamKey = buildKey(agentId, category, newMemoryId, 'team');
  await storage.set(teamKey, teamMemory);

  logger.debug('Created team memory', { teamMemoryId: newMemoryId, category });

  // Delete original if keepOriginal is false
  let originalDeleted = false;
  if (!keepOriginal) {
    let deleted: boolean;
    if (foundInUserBucket) {
      deleted = await storage.deleteFromUserBucket(originalKey, agentId);
    } else {
      deleted = await storage.deleteFromProject(originalKey, projectId);
    }
    originalDeleted = deleted;
    if (deleted) {
      logger.debug('Deleted original memory', { memoryId, originalKey, fromUserBucket: foundInUserBucket });
    } else {
      logger.warn('Failed to delete original memory', { memoryId, originalKey });
    }
  } else {
    logger.debug('Keeping original memory', { memoryId });
  }

  logger.info('Successfully shared learning', {
    originalMemoryId: memoryId,
    teamMemoryId: newMemoryId,
    originalDeleted,
  });

  return {
    teamMemoryId: newMemoryId,
    originalDeleted,
  };
}
