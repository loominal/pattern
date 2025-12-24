/**
 * MCP tool: export-memories
 * Export memories to a JSON file for backup or transfer
 */

import { promises as fs } from 'fs';
import path from 'path';
import type { LoominalScope } from '@loominal/shared/types';
import type { NatsKvBackend } from '../storage/nats-kv.js';
import type { Memory, MemoryCategory } from '../types.js';
import { PatternError, PatternErrorCode } from '../types.js';
import { createLogger } from '../logger.js';

const logger = createLogger('export-memories');

export interface ExportMemoriesInput {
  outputPath?: string; // Optional file path for export (default: memories-backup-TIMESTAMP.json)
  scope?: LoominalScope; // Filter by scope
  category?: MemoryCategory; // Filter by category
  since?: string; // ISO 8601 timestamp - only export memories after this date
  includeExpired?: boolean; // Include expired memories (default: false)
}

export interface ExportMemoriesOutput {
  exported: number; // Number of memories exported
  filepath: string; // Path to the export file
  bytes: number; // Size of the export file in bytes
}

export interface ExportFormat {
  version: string; // Export format version
  exportedAt: string; // ISO 8601 timestamp of export
  projectId: string; // Project ID
  agentId: string; // Agent ID
  memories: Memory[]; // Exported memories
}

/**
 * Check if a memory is expired
 */
function isExpired(memory: Memory): boolean {
  if (!memory.expiresAt) {
    return false;
  }
  const expiresAt = new Date(memory.expiresAt);
  const now = new Date();
  return expiresAt < now;
}

/**
 * Export memories tool handler
 * @param input - Tool input parameters
 * @param storage - NATS KV storage backend
 * @param projectId - Current project ID
 * @param agentId - Current agent ID
 * @returns Export statistics
 */
export async function exportMemories(
  input: ExportMemoriesInput,
  storage: NatsKvBackend,
  projectId: string,
  agentId: string
): Promise<ExportMemoriesOutput> {
  const {
    outputPath,
    scope,
    category,
    since,
    includeExpired = false,
  } = input;

  logger.info('Starting memory export', {
    projectId,
    agentId,
    scope,
    category,
    since,
    includeExpired,
  });

  try {
    // Fetch all memories based on scope filter
    let allMemories: Memory[] = [];

    if (scope) {
      // Fetch from specific scope
      allMemories = await fetchMemoriesForScope(scope, storage, projectId, agentId);
    } else {
      // Fetch from all scopes
      const privateMemories = await fetchMemoriesForScope('private', storage, projectId, agentId);
      const personalMemories = await fetchMemoriesForScope('personal', storage, projectId, agentId);
      const teamMemories = await fetchMemoriesForScope('team', storage, projectId, agentId);
      const publicMemories = await fetchMemoriesForScope('public', storage, projectId, agentId);
      allMemories = [...privateMemories, ...personalMemories, ...teamMemories, ...publicMemories];
    }

    logger.debug('Fetched memories from storage', { count: allMemories.length });

    // Apply filters
    let filteredMemories = allMemories;

    // Filter by category
    if (category) {
      filteredMemories = filteredMemories.filter((m) => m.category === category);
      logger.debug('Filtered by category', { category, count: filteredMemories.length });
    }

    // Filter by since timestamp
    if (since) {
      const sinceDate = new Date(since);
      if (isNaN(sinceDate.getTime())) {
        throw new PatternError(
          PatternErrorCode.VALIDATION_ERROR,
          `Invalid since timestamp: ${since}`
        );
      }
      filteredMemories = filteredMemories.filter((m) => {
        const updatedAt = new Date(m.updatedAt);
        return updatedAt > sinceDate;
      });
      logger.debug('Filtered by since', { since, count: filteredMemories.length });
    }

    // Filter expired memories
    if (!includeExpired) {
      const beforeFilter = filteredMemories.length;
      filteredMemories = filteredMemories.filter((m) => !isExpired(m));
      const expiredCount = beforeFilter - filteredMemories.length;
      if (expiredCount > 0) {
        logger.debug('Filtered out expired memories', { expiredCount });
      }
    }

    // Generate output path
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const defaultPath = `memories-backup-${timestamp}.json`;
    const filepath = outputPath
      ? path.isAbsolute(outputPath)
        ? outputPath
        : path.resolve(process.cwd(), outputPath)
      : path.resolve(process.cwd(), defaultPath);

    // Create export format
    const exportData: ExportFormat = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      projectId,
      agentId,
      memories: filteredMemories,
    };

    // Write to file
    const jsonContent = JSON.stringify(exportData, null, 2);
    await fs.writeFile(filepath, jsonContent, 'utf8');

    const bytes = Buffer.byteLength(jsonContent, 'utf8');

    logger.info('Export completed successfully', {
      exported: filteredMemories.length,
      filepath,
      bytes,
    });

    return {
      exported: filteredMemories.length,
      filepath,
      bytes,
    };
  } catch (error) {
    const err = error as Error;
    logger.error('Export failed', { error: err.message });

    // Re-throw PatternErrors
    if (error instanceof PatternError) {
      throw error;
    }

    // Wrap other errors
    throw new PatternError(
      PatternErrorCode.NATS_ERROR,
      `Failed to export memories: ${err.message}`,
      { originalError: err.message }
    );
  }
}

/**
 * Fetch memories for a specific scope
 */
async function fetchMemoriesForScope(
  scope: LoominalScope,
  storage: NatsKvBackend,
  projectId: string,
  agentId: string
): Promise<Memory[]> {
  try {
    switch (scope) {
      case 'private': {
        const prefix = `agents/${agentId}/`;
        return await storage.listFromProject(prefix, projectId);
      }
      case 'personal': {
        const prefix = `pattern.agents/${agentId}/`;
        return await storage.listFromUserBucket(prefix, agentId);
      }
      case 'team': {
        const prefix = 'shared/';
        return await storage.listFromProject(prefix, projectId);
      }
      case 'public': {
        const prefix = 'shared/';
        return await storage.listFromGlobalBucket(prefix);
      }
      default:
        return [];
    }
  } catch (error) {
    const err = error as Error;
    logger.warn(`Failed to fetch memories for scope ${scope}`, { error: err.message });
    return [];
  }
}
