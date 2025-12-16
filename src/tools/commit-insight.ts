/**
 * MCP tool: commit-insight
 * Promote a temporary memory (recent/tasks) to permanent storage (longterm)
 * Can optionally change scope during promotion (e.g., private to personal)
 */

import type { LoominalScope } from '@loominal/shared/types';
import type { NatsKvBackend } from '../storage/nats-kv.js';
import { PatternError, PatternErrorCode } from '../types.js';
import { buildKey } from '../storage/interface.js';

export interface CommitInsightInput {
  memoryId: string;
  newContent?: string; // Optional content update
  targetScope?: LoominalScope; // Optional scope change (default: keep original scope)
}

export interface CommitInsightOutput {
  memoryId: string;
  previousCategory: string;
  previousScope: LoominalScope;
  newScope: LoominalScope;
}

/**
 * Commit insight tool handler
 * Moves a memory from 'recent' or 'tasks' to 'longterm' category (removes TTL)
 * Can optionally change scope (e.g., from private to personal for cross-project insights)
 * @param input - Tool input parameters
 * @param storage - NATS KV storage backend
 * @param projectId - Current project ID
 * @param agentId - Current agent ID
 * @returns Memory ID, previous category, and scope information
 */
export async function commitInsight(
  input: CommitInsightInput,
  storage: NatsKvBackend,
  projectId: string,
  agentId: string
): Promise<CommitInsightOutput> {
  // Validate input
  if (!input.memoryId || input.memoryId.trim() === '') {
    throw new PatternError(PatternErrorCode.VALIDATION_ERROR, 'Memory ID cannot be empty');
  }

  // Search for the memory in 'recent' and 'tasks' categories
  // Search both private and personal scopes
  const categoriesToSearch = ['recent', 'tasks'];
  const scopesToSearch: LoominalScope[] = ['private', 'personal'];
  let foundMemory = null;
  let foundKey = '';

  for (const scope of scopesToSearch) {
    for (const category of categoriesToSearch) {
      const key = buildKey(agentId, category, input.memoryId, scope);
      const memory = await storage.getFromProject(key, projectId);

      if (memory) {
        foundMemory = memory;
        foundKey = key;
        break;
      }
    }
    if (foundMemory) break;
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

  // Store previous category and scope for output
  const previousCategory = foundMemory.category;
  const previousScope = foundMemory.scope;

  // Determine target scope (default to original scope if not specified)
  const targetScope = input.targetScope ?? previousScope;

  // Validate target scope is appropriate for longterm category
  if (targetScope !== 'private' && targetScope !== 'personal') {
    throw new PatternError(
      PatternErrorCode.VALIDATION_ERROR,
      `Target scope must be 'private' or 'personal' for longterm memories`,
      { targetScope }
    );
  }

  // Update memory object
  const now = new Date().toISOString();
  foundMemory.category = 'longterm';
  foundMemory.scope = targetScope;
  foundMemory.updatedAt = now;
  // Remove TTL - delete the expiresAt property if it exists
  if ('expiresAt' in foundMemory) {
    delete foundMemory.expiresAt;
  }

  // Update content if provided
  if (input.newContent !== undefined) {
    foundMemory.content = input.newContent;
  }

  // Build new key for longterm category with target scope
  const newKey = buildKey(agentId, 'longterm', input.memoryId, targetScope);

  // Store in new location (no TTL)
  await storage.set(newKey, foundMemory);

  // Delete from old location
  await storage.deleteFromProject(foundKey, projectId);

  // Return result
  return {
    memoryId: input.memoryId,
    previousCategory,
    previousScope,
    newScope: targetScope,
  };
}
