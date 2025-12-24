/**
 * MCP tool: forget-bulk
 * Delete multiple memories by IDs with error handling
 */

import type { NatsKvBackend } from '../storage/nats-kv.js';
import { forget, type ForgetInput } from './forget.js';
import { logger } from '../logger.js';

export interface ForgetBulkInput {
  memoryIds: string[]; // Array of memory IDs to delete
  stopOnError?: boolean; // Stop on first error vs continue (default: false)
  force?: boolean; // Force delete core memories (default: false)
}

export interface ForgetBulkOutput {
  deleted: number; // Number successfully deleted
  failed: number; // Number that failed
  errors: Array<{ memoryId: string; error: string }>; // Error details
}

/**
 * Forget-bulk tool handler
 * Deletes multiple memories by IDs with error handling
 * @param input - Tool input parameters
 * @param storage - NATS KV storage backend
 * @param projectId - Current project ID
 * @param agentId - Current agent ID
 * @returns Deletion statistics and any errors
 */
export async function forgetBulk(
  input: ForgetBulkInput,
  storage: NatsKvBackend,
  projectId: string,
  agentId: string
): Promise<ForgetBulkOutput> {
  const { memoryIds, stopOnError = false, force = false } = input;

  // Handle empty array
  if (!Array.isArray(memoryIds) || memoryIds.length === 0) {
    logger.info('forget-bulk called with empty array');
    return {
      deleted: 0,
      failed: 0,
      errors: [],
    };
  }

  logger.info(`forget-bulk: Processing ${memoryIds.length} memories`, {
    stopOnError,
    force,
  });

  // Delete memories one by one
  const results: ForgetBulkOutput = {
    deleted: 0,
    failed: 0,
    errors: [],
  };

  for (const [index, memoryId] of memoryIds.entries()) {
    try {
      // Validate memory ID
      if (!memoryId || typeof memoryId !== 'string' || memoryId.trim() === '') {
        throw new Error('Memory ID cannot be empty');
      }

      // Call the forget tool
      const forgetInput: ForgetInput = {
        memoryId,
        force,
      };

      await forget(forgetInput, storage, projectId, agentId);

      results.deleted++;

      logger.debug(`Deleted memory ${index + 1}/${memoryIds.length}`, {
        memoryId,
      });
    } catch (error) {
      const err = error as Error;
      results.failed++;
      results.errors.push({ memoryId, error: err.message });

      logger.warn(`Failed to delete memory ${index + 1}/${memoryIds.length}`, {
        memoryId,
        error: err.message,
      });

      // Stop on first error if requested
      if (stopOnError) {
        logger.info(`Stopping on error at memory ${index + 1}/${memoryIds.length}`);
        break;
      }
    }
  }

  logger.info('forget-bulk completed', {
    deleted: results.deleted,
    failed: results.failed,
    errorCount: results.errors.length,
  });

  return results;
}
