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
  scopes?: ('private' | 'personal' | 'team' | 'public')[]; // default: all scopes
  categories?: MemoryCategory[]; // filter by categories (empty = all)
  limit?: number; // default: 50, max: 200
  since?: string; // ISO 8601, only memories after this
  // Tag filtering
  tags?: string[]; // Filter by tags (AND logic - memory must have all tags)
  // Priority filtering
  minPriority?: 1 | 2 | 3; // Minimum priority (1=high, 2=medium, 3=low)
  maxPriority?: 1 | 2 | 3; // Maximum priority
  // Date range filtering
  createdAfter?: string; // ISO 8601, only memories created after this
  createdBefore?: string; // ISO 8601, only memories created before this
  updatedAfter?: string; // ISO 8601, only memories updated after this
  updatedBefore?: string; // ISO 8601, only memories updated before this
  // Content search
  search?: string; // Text search in content (case-insensitive)
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
 * Sub-agent identity information
 */
export interface SubagentInfo {
  isSubagent: boolean;
  parentId?: string;
}

/**
 * Recall context from storage
 *
 * @param storage - Storage backend instance
 * @param projectId - Project identifier
 * @param agentId - Agent identifier (for private memories)
 * @param input - Input parameters
 * @param subagentInfo - Sub-agent identity info (for parent memory access)
 * @returns RecallResult with private/shared memories and summary
 */
export async function recallContext(
  storage: StorageBackend,
  projectId: string,
  agentId: string,
  input: RecallContextInput = {},
  subagentInfo?: SubagentInfo
): Promise<RecallResult> {
  const {
    scopes = ['private', 'personal', 'team', 'public'],
    categories = [],
    limit = 50,
    since,
    tags,
    minPriority,
    maxPriority,
    createdAfter,
    createdBefore,
    updatedAfter,
    updatedBefore,
    search,
  } = input;

  // Validate limit
  const effectiveLimit = Math.min(Math.max(1, limit), 200);

  logger.debug('Recalling context', {
    projectId,
    agentId,
    scopes,
    categories,
    limit: effectiveLimit,
    since,
    isSubagent: subagentInfo?.isSubagent ?? false,
    parentId: subagentInfo?.parentId,
  });

  // Fetch memories based on requested scopes
  let privateMemories: Memory[] = [];
  let personalMemories: Memory[] = [];
  let teamMemories: Memory[] = [];
  let publicMemories: Memory[] = [];

  try {
    // Fetch private memories (project bucket)
    if (scopes.includes('private')) {
      const privatePrefix = `agents/${agentId}/`;
      privateMemories = await storage.listFromProject(privatePrefix, projectId);
      logger.debug('Fetched private memories', { count: privateMemories.length });

      // If sub-agent, also fetch parent's non-core memories
      if (subagentInfo?.isSubagent && subagentInfo.parentId) {
        logger.debug('Sub-agent mode detected, fetching parent memories', {
          parentId: subagentInfo.parentId,
        });

        const parentPrefix = `agents/${subagentInfo.parentId}/`;
        const parentMemories = await storage.listFromProject(parentPrefix, projectId);

        // Filter out core memories (security boundary - sub-agents cannot see parent core)
        const parentNonCoreMemories = parentMemories.filter((m) => m.category !== 'core');

        logger.debug('Fetched parent memories (excluding core)', {
          total: parentMemories.length,
          nonCore: parentNonCoreMemories.length,
          filtered: parentMemories.length - parentNonCoreMemories.length,
        });

        // Add parent's non-core memories to private memories
        privateMemories = [...privateMemories, ...parentNonCoreMemories];
      }
    }

    // Fetch personal memories (user bucket)
    if (scopes.includes('personal')) {
      const personalPrefix = `pattern.agents/${agentId}/`;
      personalMemories = await storage.listFromUserBucket(personalPrefix, agentId);
      logger.debug('Fetched personal memories', { count: personalMemories.length });
    }

    // Fetch team memories (project bucket)
    if (scopes.includes('team')) {
      const teamPrefix = 'shared/';
      teamMemories = await storage.listFromProject(teamPrefix, projectId);
      logger.debug('Fetched team memories', { count: teamMemories.length });
    }

    // Fetch public memories (global bucket)
    if (scopes.includes('public')) {
      const publicPrefix = 'shared/';
      publicMemories = await storage.listFromGlobalBucket(publicPrefix);
      logger.debug('Fetched public memories', { count: publicMemories.length });
    }

    // Combine all memories for processing
    const allMemories = [...privateMemories, ...personalMemories, ...teamMemories, ...publicMemories];

    // Separate expired memories (for counting)
    const expiredMemories = allMemories.filter(isExpired);
    const activeMemories = allMemories.filter((m) => !isExpired(m));

    logger.debug('Separated expired memories', {
      active: activeMemories.length,
      expired: expiredMemories.length,
    });

    // Apply filters
    let filteredMemories = activeMemories;

    // Filter by categories if provided
    if (categories.length > 0) {
      filteredMemories = filteredMemories.filter((m) => categories.includes(m.category));
      logger.debug('Filtered by categories', { count: filteredMemories.length, categories });
    }

    // Filter by since timestamp if provided
    if (since) {
      const sinceDate = new Date(since);
      filteredMemories = filteredMemories.filter((m) => {
        const updatedAt = new Date(m.updatedAt);
        return updatedAt > sinceDate;
      });
      logger.debug('Filtered by since', { count: filteredMemories.length, since });
    }

    // Filter by tags if provided (AND logic - memory must have all specified tags)
    if (tags && tags.length > 0) {
      filteredMemories = filteredMemories.filter((m) => {
        const memoryTags = m.metadata?.tags || [];
        return tags.every((tag) => memoryTags.includes(tag));
      });
      logger.debug('Filtered by tags', { count: filteredMemories.length, tags });
    }

    // Filter by priority if provided
    if (minPriority !== undefined || maxPriority !== undefined) {
      filteredMemories = filteredMemories.filter((m) => {
        const priority = m.metadata?.priority ?? 2; // default priority is 2 (medium)
        const min = minPriority ?? 1;
        const max = maxPriority ?? 3;
        return priority >= min && priority <= max;
      });
      logger.debug('Filtered by priority', {
        count: filteredMemories.length,
        minPriority,
        maxPriority,
      });
    }

    // Filter by created date range if provided
    if (createdAfter || createdBefore) {
      filteredMemories = filteredMemories.filter((m) => {
        const createdAt = new Date(m.createdAt);
        if (createdAfter && createdAt < new Date(createdAfter)) return false;
        if (createdBefore && createdAt > new Date(createdBefore)) return false;
        return true;
      });
      logger.debug('Filtered by created date range', {
        count: filteredMemories.length,
        createdAfter,
        createdBefore,
      });
    }

    // Filter by updated date range if provided
    if (updatedAfter || updatedBefore) {
      filteredMemories = filteredMemories.filter((m) => {
        const updatedAt = new Date(m.updatedAt);
        if (updatedAfter && updatedAt < new Date(updatedAfter)) return false;
        if (updatedBefore && updatedAt > new Date(updatedBefore)) return false;
        return true;
      });
      logger.debug('Filtered by updated date range', {
        count: filteredMemories.length,
        updatedAfter,
        updatedBefore,
      });
    }

    // Filter by content search if provided (case-insensitive)
    if (search) {
      const searchLower = search.toLowerCase();
      filteredMemories = filteredMemories.filter((m) => m.content.toLowerCase().includes(searchLower));
      logger.debug('Filtered by content search', { count: filteredMemories.length, search });
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

    // Separate back into scope categories
    const resultPrivateMemories = limitedMemories.filter((m) => m.scope === 'private');
    const resultPersonalMemories = limitedMemories.filter((m) => m.scope === 'personal');
    const resultTeamMemories = limitedMemories.filter((m) => m.scope === 'team');
    const resultPublicMemories = limitedMemories.filter((m) => m.scope === 'public');

    // Generate summary (4KB max)
    const maxSummaryBytes = 4096;
    const summary = generateSummary(limitedMemories, maxSummaryBytes);

    logger.info('Context recalled successfully', {
      private: resultPrivateMemories.length,
      personal: resultPersonalMemories.length,
      team: resultTeamMemories.length,
      public: resultPublicMemories.length,
      expired: expiredMemories.length,
      summaryBytes: Buffer.byteLength(summary, 'utf8'),
    });

    return {
      private: resultPrivateMemories,
      personal: resultPersonalMemories,
      team: resultTeamMemories,
      public: resultPublicMemories,
      summary,
      counts: {
        private: resultPrivateMemories.length,
        personal: resultPersonalMemories.length,
        team: resultTeamMemories.length,
        public: resultPublicMemories.length,
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
