/**
 * MCP tool: import-memories
 * Import memories from a JSON backup file
 */

import { promises as fs } from 'fs';
import path from 'path';
import type { LoominalScope } from '@loominal/shared/types';
import type { NatsKvBackend } from '../storage/nats-kv.js';
import type { Memory, MemoryCategory } from '../types.js';
import { PatternError, PatternErrorCode, getTTL, validateScopeCategory } from '../types.js';
import { buildKey } from '../storage/interface.js';
import { createLogger } from '../logger.js';
import type { ExportFormat } from './export-memories.js';

const logger = createLogger('import-memories');

export interface ImportMemoriesInput {
  inputPath: string; // Path to JSON backup file
  overwriteExisting?: boolean; // Overwrite if memory ID already exists (default: false)
  skipInvalid?: boolean; // Skip invalid entries instead of failing (default: true)
}

export interface ImportMemoriesOutput {
  imported: number; // Number of memories successfully imported
  skipped: number; // Number of memories skipped
  errors: string[]; // Array of error messages
}

/**
 * Validate a memory object
 */
function validateMemory(memory: unknown): memory is Memory {
  if (!memory || typeof memory !== 'object') {
    return false;
  }

  const m = memory as Record<string, unknown>;

  // Check required fields
  if (typeof m.id !== 'string' || !m.id) {
    return false;
  }
  if (typeof m.agentId !== 'string' || !m.agentId) {
    return false;
  }
  if (typeof m.projectId !== 'string' || !m.projectId) {
    return false;
  }
  if (!['private', 'personal', 'team', 'public'].includes(m.scope as string)) {
    return false;
  }
  if (!['recent', 'tasks', 'longterm', 'core', 'decisions', 'architecture', 'learnings'].includes(m.category as string)) {
    return false;
  }
  if (typeof m.content !== 'string' || !m.content) {
    return false;
  }
  if (typeof m.createdAt !== 'string' || !m.createdAt) {
    return false;
  }
  if (typeof m.updatedAt !== 'string' || !m.updatedAt) {
    return false;
  }
  if (typeof m.version !== 'number') {
    return false;
  }

  // Validate expiresAt if present
  if (m.expiresAt !== undefined && typeof m.expiresAt !== 'string') {
    return false;
  }

  // Validate metadata if present
  if (m.metadata !== undefined && typeof m.metadata !== 'object') {
    return false;
  }

  return true;
}

/**
 * Validate export format
 */
function validateExportFormat(data: unknown): data is ExportFormat {
  if (!data || typeof data !== 'object') {
    return false;
  }

  const d = data as Record<string, unknown>;

  if (typeof d.version !== 'string') {
    return false;
  }
  if (typeof d.exportedAt !== 'string') {
    return false;
  }
  if (typeof d.projectId !== 'string') {
    return false;
  }
  if (typeof d.agentId !== 'string') {
    return false;
  }
  if (!Array.isArray(d.memories)) {
    return false;
  }

  return true;
}

/**
 * Import memories tool handler
 * @param input - Tool input parameters
 * @param storage - NATS KV storage backend
 * @param projectId - Current project ID
 * @param agentId - Current agent ID
 * @returns Import statistics
 */
export async function importMemories(
  input: ImportMemoriesInput,
  storage: NatsKvBackend,
  projectId: string,
  agentId: string
): Promise<ImportMemoriesOutput> {
  const {
    inputPath,
    overwriteExisting = false,
    skipInvalid = true,
  } = input;

  logger.info('Starting memory import', {
    inputPath,
    overwriteExisting,
    skipInvalid,
  });

  const errors: string[] = [];
  let imported = 0;
  let skipped = 0;

  try {
    // Resolve path
    const filepath = path.isAbsolute(inputPath)
      ? inputPath
      : path.resolve(process.cwd(), inputPath);

    // Read file
    let fileContent: string;
    try {
      fileContent = await fs.readFile(filepath, 'utf8');
    } catch (error) {
      const err = error as Error;
      throw new PatternError(
        PatternErrorCode.VALIDATION_ERROR,
        `Failed to read import file: ${err.message}`,
        { filepath }
      );
    }

    // Parse JSON
    let data: unknown;
    try {
      data = JSON.parse(fileContent);
    } catch (error) {
      const err = error as Error;
      throw new PatternError(
        PatternErrorCode.VALIDATION_ERROR,
        `Invalid JSON format: ${err.message}`,
        { filepath }
      );
    }

    // Validate export format
    if (!validateExportFormat(data)) {
      throw new PatternError(
        PatternErrorCode.VALIDATION_ERROR,
        'Invalid export format: missing required fields (version, exportedAt, projectId, agentId, memories)',
        { filepath }
      );
    }

    const exportData = data as ExportFormat;

    // Version check (currently we only support 1.0)
    if (exportData.version !== '1.0') {
      logger.warn('Export format version mismatch', {
        expected: '1.0',
        actual: exportData.version,
      });
    }

    logger.info('Loaded export file', {
      version: exportData.version,
      exportedAt: exportData.exportedAt,
      sourceProjectId: exportData.projectId,
      sourceAgentId: exportData.agentId,
      memoryCount: exportData.memories.length,
    });

    // Process each memory
    for (const memory of exportData.memories) {
      try {
        // Validate memory structure
        if (!validateMemory(memory)) {
          const error = `Invalid memory structure: ${(memory as any).id || 'unknown'}`;
          errors.push(error);
          if (!skipInvalid) {
            throw new PatternError(
              PatternErrorCode.VALIDATION_ERROR,
              error,
              { memory }
            );
          }
          skipped++;
          continue;
        }

        // Validate scope/category combination
        try {
          validateScopeCategory(memory.scope, memory.category);
        } catch (error) {
          const err = error as Error;
          const errorMsg = `Memory ${memory.id}: ${err.message}`;
          errors.push(errorMsg);
          if (!skipInvalid) {
            throw error;
          }
          skipped++;
          continue;
        }

        // Build storage key
        const key = buildKey(memory.agentId, memory.category, memory.id, memory.scope);

        // Check if memory already exists (if not overwriting)
        if (!overwriteExisting) {
          const exists = await checkMemoryExists(storage, key, memory.scope, memory.projectId, memory.agentId);
          if (exists) {
            const errorMsg = `Memory ${memory.id} already exists (use overwriteExisting to replace)`;
            errors.push(errorMsg);
            if (!skipInvalid) {
              throw new PatternError(
                PatternErrorCode.VALIDATION_ERROR,
                errorMsg,
                { memoryId: memory.id }
              );
            }
            skipped++;
            continue;
          }
        }

        // Ensure bucket exists for this scope
        await storage.ensureBucketForScope(memory.scope, memory.projectId, memory.agentId);

        // Get TTL if applicable
        const ttl = getTTL(memory.category);

        // Store the memory
        await storage.set(key, memory, ttl);

        imported++;
        logger.debug('Imported memory', {
          memoryId: memory.id,
          scope: memory.scope,
          category: memory.category,
        });
      } catch (error) {
        const err = error as Error;
        const errorMsg = `Failed to import memory ${memory.id}: ${err.message}`;
        errors.push(errorMsg);
        if (!skipInvalid) {
          throw error;
        }
        skipped++;
      }
    }

    logger.info('Import completed', {
      imported,
      skipped,
      errorCount: errors.length,
    });

    return {
      imported,
      skipped,
      errors,
    };
  } catch (error) {
    const err = error as Error;
    logger.error('Import failed', { error: err.message });

    // Re-throw PatternErrors
    if (error instanceof PatternError) {
      throw error;
    }

    // Wrap other errors
    throw new PatternError(
      PatternErrorCode.NATS_ERROR,
      `Failed to import memories: ${err.message}`,
      { originalError: err.message }
    );
  }
}

/**
 * Check if a memory exists in storage
 */
async function checkMemoryExists(
  storage: NatsKvBackend,
  key: string,
  scope: LoominalScope,
  projectId: string,
  agentId: string
): Promise<boolean> {
  try {
    let memory: Memory | null = null;

    switch (scope) {
      case 'private':
      case 'team':
        memory = await storage.getFromProject(key, projectId);
        break;
      case 'personal':
        memory = await storage.getFromUserBucket(key, agentId);
        break;
      case 'public':
        memory = await storage.getFromGlobalBucket(key);
        break;
    }

    return memory !== null;
  } catch (error) {
    // If we can't check, assume it doesn't exist
    return false;
  }
}
