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
 * Can only delete own private or shared memories you created
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
    throw new PatternError(
      PatternErrorCode.VALIDATION_ERROR,
      'Memory ID cannot be empty'
    );
  }

  // Search for the memory in all categories
  // Private categories first
  const privateCategories: MemoryCategory[] = ['recent', 'tasks', 'longterm', 'core'];
  const sharedCategories: MemoryCategory[] = ['decisions', 'architecture', 'learnings'];

  let foundMemory = null;
  let foundKey = '';
  let foundScope: 'private' | 'shared' = 'private';

  // Search private memories
  for (const category of privateCategories) {
    const key = buildKey(agentId, category, input.memoryId, 'private');
    const memory = await storage.getFromProject(key, projectId);

    if (memory) {
      foundMemory = memory;
      foundKey = key;
      foundScope = 'private';
      break;
    }
  }

  // Search shared memories if not found in private
  if (!foundMemory) {
    for (const category of sharedCategories) {
      const key = buildKey(agentId, category, input.memoryId, 'shared');
      const memory = await storage.getFromProject(key, projectId);

      if (memory) {
        foundMemory = memory;
        foundKey = key;
        foundScope = 'shared';
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

  // Check ownership for shared memories
  if (foundScope === 'shared' && foundMemory.agentId !== agentId) {
    throw new PatternError(
      PatternErrorCode.ACCESS_DENIED,
      `Cannot delete shared memory created by another agent`,
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

  // Delete the memory
  const deleted = await storage.deleteFromProject(foundKey, projectId);

  // Return result
  return {
    deleted,
    category: foundMemory.category,
  };
}
