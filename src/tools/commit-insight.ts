/**
 * MCP tool: commit-insight
 * Promote a temporary memory (recent/tasks) to permanent storage (longterm)
 */

import type { NatsKvBackend } from '../storage/nats-kv.js';
import { PatternError, PatternErrorCode } from '../types.js';
import { buildKey, parseKey } from '../storage/interface.js';

export interface CommitInsightInput {
  memoryId: string;
  newContent?: string; // Optional content update
}

export interface CommitInsightOutput {
  memoryId: string;
  previousCategory: string;
}

/**
 * Commit insight tool handler
 * Moves a memory from 'recent' or 'tasks' to 'longterm' category (removes TTL)
 * @param input - Tool input parameters
 * @param storage - NATS KV storage backend
 * @param projectId - Current project ID
 * @param agentId - Current agent ID
 * @returns Memory ID and previous category
 */
export async function commitInsight(
  input: CommitInsightInput,
  storage: NatsKvBackend,
  projectId: string,
  agentId: string
): Promise<CommitInsightOutput> {
  // Validate input
  if (!input.memoryId || input.memoryId.trim() === '') {
    throw new PatternError(
      PatternErrorCode.VALIDATION_ERROR,
      'Memory ID cannot be empty'
    );
  }

  // Search for the memory in 'recent' and 'tasks' categories (only private scope)
  const categoriesToSearch = ['recent', 'tasks'];
  let foundMemory = null;
  let foundKey = '';

  for (const category of categoriesToSearch) {
    const key = buildKey(agentId, category, input.memoryId, 'private');
    const memory = await storage.getFromProject(key, projectId);

    if (memory) {
      foundMemory = memory;
      foundKey = key;
      break;
    }
  }

  // If not found, return error
  if (!foundMemory) {
    throw new PatternError(
      PatternErrorCode.MEMORY_NOT_FOUND,
      `Memory with ID '${input.memoryId}' not found in 'recent' or 'tasks' categories`,
      { memoryId: input.memoryId }
    );
  }

  // Check if already 'longterm' or 'core'
  if (foundMemory.category === 'longterm') {
    throw new PatternError(
      PatternErrorCode.VALIDATION_ERROR,
      `Memory is already in 'longterm' category`,
      { memoryId: input.memoryId, category: foundMemory.category }
    );
  }

  if (foundMemory.category === 'core') {
    throw new PatternError(
      PatternErrorCode.CORE_PROTECTED,
      `Memory is in 'core' category and cannot be modified`,
      { memoryId: input.memoryId, category: foundMemory.category }
    );
  }

  // Store previous category for output
  const previousCategory = foundMemory.category;

  // Update memory object
  const now = new Date().toISOString();
  foundMemory.category = 'longterm';
  foundMemory.updatedAt = now;
  // Remove TTL - delete the expiresAt property if it exists
  if ('expiresAt' in foundMemory) {
    delete foundMemory.expiresAt;
  }

  // Update content if provided
  if (input.newContent !== undefined) {
    foundMemory.content = input.newContent;
  }

  // Build new key for longterm category
  const newKey = buildKey(agentId, 'longterm', input.memoryId, 'private');

  // Store in new location (no TTL)
  await storage.set(newKey, foundMemory);

  // Delete from old location
  await storage.deleteFromProject(foundKey, projectId);

  // Return result
  return {
    memoryId: input.memoryId,
    previousCategory,
  };
}
