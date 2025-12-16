/**
 * MCP tool: forget
 * Delete a memory by ID (requires force=true for core memories)
 */

import type { NatsKvBackend } from '../storage/nats-kv.js';
import type { MemoryCategory } from '../types.js';
import { PatternError, PatternErrorCode } from '../types.js';
import { buildKey } from '../storage/interface.js';

export interface ForgetInput {
  memoryId: string;
  force?: boolean; // Required for core memories
}

export interface ForgetOutput {
  deleted: boolean;
  category: string;
}

/**
 * Forget tool handler
 * Deletes a memory by ID (requires force=true for core memories)
 * Can only delete own memories or team/public memories you created
 * @param input - Tool input parameters
 * @param storage - NATS KV storage backend
 * @param projectId - Current project ID
 * @param agentId - Current agent ID
 * @returns Deletion status and category
 */
export async function forget(
  input: ForgetInput,
  storage: NatsKvBackend,
  projectId: string,
  agentId: string
): Promise<ForgetOutput> {
  // Validate input
  if (!input.memoryId || input.memoryId.trim() === '') {
    throw new PatternError(PatternErrorCode.VALIDATION_ERROR, 'Memory ID cannot be empty');
  }

  // Search for the memory in all categories and scopes
  // Individual categories (private/personal)
  const individualCategories: MemoryCategory[] = ['recent', 'tasks', 'longterm', 'core'];
  const teamCategories: MemoryCategory[] = ['decisions', 'architecture', 'learnings'];

  let foundMemory = null;
  let foundKey = '';
  let foundBucket: 'project' | 'user' | 'global' = 'project';

  // Search private memories (project bucket)
  for (const category of individualCategories) {
    const key = buildKey(agentId, category, input.memoryId, 'private');
    const memory = await storage.getFromProject(key, projectId);

    if (memory) {
      foundMemory = memory;
      foundKey = key;
      foundBucket = 'project';
      break;
    }
  }

  // Search personal memories (user bucket) - core memories are stored here
  if (!foundMemory) {
    for (const category of individualCategories) {
      const key = buildKey(agentId, category, input.memoryId, 'personal');
      const memory = await storage.getFromUserBucket(key, agentId);

      if (memory) {
        foundMemory = memory;
        foundKey = key;
        foundBucket = 'user';
        break;
      }
    }
  }

  // Search team memories (project bucket) if not found in individual
  if (!foundMemory) {
    for (const category of teamCategories) {
      const key = buildKey(agentId, category, input.memoryId, 'team');
      const memory = await storage.getFromProject(key, projectId);

      if (memory) {
        foundMemory = memory;
        foundKey = key;
        foundBucket = 'project';
        break;
      }
    }
  }

  // Search public memories (global bucket) if not found
  if (!foundMemory) {
    for (const category of teamCategories) {
      const key = buildKey(agentId, category, input.memoryId, 'public');
      const memory = await storage.getFromGlobalBucket(key);

      if (memory) {
        foundMemory = memory;
        foundKey = key;
        foundBucket = 'global';
        break;
      }
    }
  }

  // If not found, return error
  if (!foundMemory) {
    throw new PatternError(
      PatternErrorCode.MEMORY_NOT_FOUND,
      `Memory with ID '${input.memoryId}' not found`,
      { memoryId: input.memoryId }
    );
  }

  // Check ownership for team/public memories
  if ((foundMemory.scope === 'team' || foundMemory.scope === 'public') && foundMemory.agentId !== agentId) {
    throw new PatternError(
      PatternErrorCode.ACCESS_DENIED,
      `Cannot delete ${foundMemory.scope} memory created by another agent`,
      { memoryId: input.memoryId, creator: foundMemory.agentId, currentAgent: agentId }
    );
  }

  // Check if core memory and force flag
  if (foundMemory.category === 'core' && !input.force) {
    throw new PatternError(
      PatternErrorCode.CORE_PROTECTED,
      `Core memories require force=true to delete`,
      { memoryId: input.memoryId, category: foundMemory.category }
    );
  }

  // Delete the memory from the correct bucket
  let deleted: boolean;
  switch (foundBucket) {
    case 'user':
      deleted = await storage.deleteFromUserBucket(foundKey, agentId);
      break;
    case 'global':
      deleted = await storage.deleteFromGlobalBucket(foundKey);
      break;
    case 'project':
    default:
      deleted = await storage.deleteFromProject(foundKey, projectId);
      break;
  }

  // Return result
  return {
    deleted,
    category: foundMemory.category,
  };
}
