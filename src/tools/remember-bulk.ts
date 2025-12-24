/**
 * MCP tool: remember-bulk
 * Store multiple memories at once with validation and error handling
 */

import type { LoominalScope } from '@loominal/shared/types';
import type { NatsKvBackend } from '../storage/nats-kv.js';
import type { MemoryCategory, MemoryMetadata, PatternConfig } from '../types.js';
import { PatternError, PatternErrorCode, validateScopeCategory } from '../types.js';
import { remember, type RememberInput } from './remember.js';
import { logger } from '../logger.js';

export interface BulkMemoryInput {
  content: string; // Max 32KB
  scope?: LoominalScope; // default: 'private'
  category?: MemoryCategory; // default: 'recent'
  metadata?: MemoryMetadata;
}

export interface RememberBulkInput {
  memories: BulkMemoryInput[]; // Array of memories to store
  stopOnError?: boolean; // Stop on first error vs continue (default: false)
  validate?: boolean; // Validate all before storing any (default: true)
}

export interface RememberBulkOutput {
  stored: number; // Number successfully stored
  failed: number; // Number that failed
  errors: Array<{ index: number; error: string }>; // Error details
  memoryIds: string[]; // IDs of successfully stored memories
}

interface ValidationError {
  index: number;
  error: string;
}

const MAX_CONTENT_SIZE = 32 * 1024; // 32KB in bytes

/**
 * Validate a single memory input
 */
function validateMemoryInput(memory: BulkMemoryInput, index: number): ValidationError | null {
  // Check content
  if (!memory.content || memory.content.trim() === '') {
    return { index, error: 'Content cannot be empty' };
  }

  // Check content size
  const contentSize = Buffer.byteLength(memory.content, 'utf8');
  if (contentSize > MAX_CONTENT_SIZE) {
    return {
      index,
      error: `Content size (${contentSize} bytes) exceeds maximum (${MAX_CONTENT_SIZE} bytes)`,
    };
  }

  // Set defaults for validation
  const scope = memory.scope ?? 'private';
  const category = memory.category ?? 'recent';

  // Validate scope/category combination
  try {
    validateScopeCategory(scope, category);
  } catch (error) {
    const err = error as Error;
    return { index, error: err.message };
  }

  // Validate metadata if present
  if (memory.metadata) {
    const { tags, priority, relatedTo } = memory.metadata;

    // Validate tags
    if (tags !== undefined) {
      if (!Array.isArray(tags)) {
        return { index, error: 'metadata.tags must be an array' };
      }
      if (tags.length > 10) {
        return { index, error: 'Maximum 10 tags allowed' };
      }
      for (const tag of tags) {
        if (typeof tag !== 'string') {
          return { index, error: 'All tags must be strings' };
        }
        if (tag.length > 50) {
          return { index, error: 'Tag length cannot exceed 50 characters' };
        }
      }
    }

    // Validate priority
    if (priority !== undefined && ![1, 2, 3].includes(priority)) {
      return { index, error: 'Priority must be 1, 2, or 3' };
    }

    // Validate relatedTo
    if (relatedTo !== undefined) {
      if (!Array.isArray(relatedTo)) {
        return { index, error: 'metadata.relatedTo must be an array' };
      }
      for (const id of relatedTo) {
        if (typeof id !== 'string') {
          return { index, error: 'All relatedTo IDs must be strings' };
        }
      }
    }
  }

  return null;
}

/**
 * Remember-bulk tool handler
 * Stores multiple memories at once with validation and error handling
 * @param input - Tool input parameters
 * @param storage - NATS KV storage backend
 * @param projectId - Current project ID
 * @param agentId - Current agent ID
 * @param config - Optional Pattern configuration (for scanner settings)
 * @returns Storage statistics and any errors
 */
export async function rememberBulk(
  input: RememberBulkInput,
  storage: NatsKvBackend,
  projectId: string,
  agentId: string,
  config?: PatternConfig
): Promise<RememberBulkOutput> {
  const { memories, stopOnError = false, validate: shouldValidate = true } = input;

  // Handle empty array
  if (!Array.isArray(memories) || memories.length === 0) {
    logger.info('remember-bulk called with empty array');
    return {
      stored: 0,
      failed: 0,
      errors: [],
      memoryIds: [],
    };
  }

  logger.info(`remember-bulk: Processing ${memories.length} memories`, {
    stopOnError,
    validate: shouldValidate,
  });

  const validationErrors: ValidationError[] = [];

  // Pre-flight validation if requested
  if (shouldValidate) {
    logger.debug('Validating all memories before storage');
    for (const [index, memory] of memories.entries()) {
      const validationError = validateMemoryInput(memory, index);
      if (validationError) {
        validationErrors.push(validationError);
      }
    }

    // If we have validation errors, fail fast
    if (validationErrors.length > 0) {
      logger.warn(`Validation failed for ${validationErrors.length} memories`);
      throw new PatternError(
        PatternErrorCode.VALIDATION_ERROR,
        `Validation failed for ${validationErrors.length} ${validationErrors.length === 1 ? 'memory' : 'memories'}`,
        {
          validationErrors,
          totalMemories: memories.length,
        }
      );
    }
  }

  // Store memories one by one
  const results: RememberBulkOutput = {
    stored: 0,
    failed: 0,
    errors: [],
    memoryIds: [],
  };

  for (const [index, memory] of memories.entries()) {
    try {
      // Convert BulkMemoryInput to RememberInput
      const rememberInput: RememberInput = {
        content: memory.content,
        ...(memory.scope !== undefined && { scope: memory.scope }),
        ...(memory.category !== undefined && { category: memory.category }),
        ...(memory.metadata !== undefined && { metadata: memory.metadata }),
      };

      // Call the remember tool
      const result = await remember(rememberInput, storage, projectId, agentId, config);

      results.stored++;
      results.memoryIds.push(result.memoryId);

      logger.debug(`Stored memory ${index + 1}/${memories.length}`, {
        memoryId: result.memoryId,
      });
    } catch (error) {
      const err = error as Error;
      results.failed++;
      results.errors.push({ index, error: err.message });

      logger.warn(`Failed to store memory ${index + 1}/${memories.length}`, {
        error: err.message,
      });

      // Stop on first error if requested
      if (stopOnError) {
        logger.info(`Stopping on error at memory ${index + 1}/${memories.length}`);
        break;
      }
    }
  }

  logger.info('remember-bulk completed', {
    stored: results.stored,
    failed: results.failed,
    errorCount: results.errors.length,
  });

  return results;
}
