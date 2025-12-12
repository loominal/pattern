/**
 * recall_context tool - Retrieves memory context when an agent starts
 * Based on PLAN.md section 11.4
 */

import type { Memory, MemoryCategory, RecallResult } from '../types.js';
import type { StorageBackend } from '../storage/interface.js';
import { createLogger } from '../logger.js';

const logger = createLogger('recall-context');

/**
 * Input parameters for recall_context
 */
export interface RecallContextInput {
  scope?: 'private' | 'shared' | 'both'; // default: 'both'
  categories?: MemoryCategory[]; // filter by categories (empty = all)
  limit?: number; // default: 50, max: 200
  since?: string; // ISO 8601, only memories after this
}

/**
 * Get priority for a memory category (lower number = higher priority)
 */
function getCategoryPriority(category: MemoryCategory): number {
  const priorityMap: Record<MemoryCategory, number> = {
    core: 1,
    longterm: 2,
    decisions: 3,
    architecture: 3,
    learnings: 3,
    recent: 4,
    tasks: 5,
  };
  return priorityMap[category] ?? 6;
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
 * Generate a summary from memories (concatenated key points)
 * Truncated to maxBytes total
 */
function generateSummary(memories: Memory[], maxBytes: number): string {
  let summary = '';
  let currentBytes = 0;

  for (const memory of memories) {
    // Format: ## {category}\n{content}\n\n
    const categoryHeader = `## ${memory.category}\n`;
    const content = `${memory.content}\n\n`;
    const entry = categoryHeader + content;

    const entryBytes = Buffer.byteLength(entry, 'utf8');

    // Check if adding this entry would exceed the limit
    if (currentBytes + entryBytes > maxBytes) {
      // Try to add at least the category header and a truncated part of the content
      const remainingBytes = maxBytes - currentBytes;
      if (remainingBytes > Buffer.byteLength(categoryHeader, 'utf8') + 20) {
        // Add truncated content
        const availableForContent = remainingBytes - Buffer.byteLength(categoryHeader, 'utf8') - 4; // Reserve 4 bytes for "...\n"
        let truncatedContent = content.substring(0, availableForContent);
        // Ensure we don't cut in the middle of a multi-byte character
        while (Buffer.byteLength(truncatedContent, 'utf8') > availableForContent) {
          truncatedContent = truncatedContent.substring(0, truncatedContent.length - 1);
        }
        summary += categoryHeader + truncatedContent + '...\n';
      }
      break;
    }

    summary += entry;
    currentBytes += entryBytes;
  }

  return summary.trim();
}

/**
 * Recall context from storage
 *
 * @param storage - Storage backend instance
 * @param projectId - Project identifier
 * @param agentId - Agent identifier (for private memories)
 * @param input - Input parameters
 * @returns RecallResult with private/shared memories and summary
 */
export async function recallContext(
  storage: StorageBackend,
  projectId: string,
  agentId: string,
  input: RecallContextInput = {}
): Promise<RecallResult> {
  const {
    scope = 'both',
    categories = [],
    limit = 50,
    since,
  } = input;

  // Validate limit
  const effectiveLimit = Math.min(Math.max(1, limit), 200);

  logger.debug('Recalling context', {
    projectId,
    agentId,
    scope,
    categories,
    limit: effectiveLimit,
    since,
  });

  // Fetch memories based on scope
  let privateMemories: Memory[] = [];
  let sharedMemories: Memory[] = [];

  try {
    // Fetch private memories
    if (scope === 'private' || scope === 'both') {
      const privatePrefix = `agents/${agentId}/`;
      privateMemories = await storage.listFromProject(privatePrefix, projectId);
      logger.debug('Fetched private memories', { count: privateMemories.length });
    }

    // Fetch shared memories
    if (scope === 'shared' || scope === 'both') {
      const sharedPrefix = 'shared/';
      sharedMemories = await storage.listFromProject(sharedPrefix, projectId);
      logger.debug('Fetched shared memories', { count: sharedMemories.length });
    }

    // Combine all memories for processing
    const allMemories = [...privateMemories, ...sharedMemories];

    // Separate expired memories (for counting)
    const expiredMemories = allMemories.filter(isExpired);
    const activeMemories = allMemories.filter(m => !isExpired(m));

    logger.debug('Separated expired memories', {
      active: activeMemories.length,
      expired: expiredMemories.length,
    });

    // Apply filters
    let filteredMemories = activeMemories;

    // Filter by categories if provided
    if (categories.length > 0) {
      filteredMemories = filteredMemories.filter(m => categories.includes(m.category));
      logger.debug('Filtered by categories', { count: filteredMemories.length, categories });
    }

    // Filter by since timestamp if provided
    if (since) {
      const sinceDate = new Date(since);
      filteredMemories = filteredMemories.filter(m => {
        const updatedAt = new Date(m.updatedAt);
        return updatedAt > sinceDate;
      });
      logger.debug('Filtered by since', { count: filteredMemories.length, since });
    }

    // Sort by priority
    filteredMemories.sort((a, b) => {
      // First by category priority (ascending - lower number = higher priority)
      const priorityDiff = getCategoryPriority(a.category) - getCategoryPriority(b.category);
      if (priorityDiff !== 0) {
        return priorityDiff;
      }

      // Then by updatedAt (descending - newer first)
      const aUpdated = new Date(a.updatedAt).getTime();
      const bUpdated = new Date(b.updatedAt).getTime();
      return bUpdated - aUpdated;
    });

    logger.debug('Sorted memories by priority', { count: filteredMemories.length });

    // Apply limit
    const limitedMemories = filteredMemories.slice(0, effectiveLimit);
    logger.debug('Applied limit', { limit: effectiveLimit, count: limitedMemories.length });

    // Separate back into private and shared
    const resultPrivateMemories = limitedMemories.filter(m => m.scope === 'private');
    const resultSharedMemories = limitedMemories.filter(m => m.scope === 'shared');

    // Generate summary (4KB max)
    const maxSummaryBytes = 4096;
    const summary = generateSummary(limitedMemories, maxSummaryBytes);

    logger.info('Context recalled successfully', {
      private: resultPrivateMemories.length,
      shared: resultSharedMemories.length,
      expired: expiredMemories.length,
      summaryBytes: Buffer.byteLength(summary, 'utf8'),
    });

    return {
      private: resultPrivateMemories,
      shared: resultSharedMemories,
      summary,
      counts: {
        private: resultPrivateMemories.length,
        shared: resultSharedMemories.length,
        expired: expiredMemories.length,
      },
    };
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to recall context', {
      error: err.message,
      projectId,
      agentId,
    });
    throw error;
  }
}
